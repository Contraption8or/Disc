import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu, shell, clipboard, screen, protocol } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { watch, readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import os from "node:os";
import AdmZip from "adm-zip";

// Content-Type by extension for disc-media:// responses (see below) — the
// same set of formats the rest of the app already treats as playable
// (Chromium's Web Audio decodes all of these natively). Falls back to
// audio/mpeg for anything unrecognized, same as the old Blob-based
// playback path did.
const MEDIA_MIME_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

function mediaMimeType(filePath) {
  return MEDIA_MIME_TYPES[path.extname(filePath).toLowerCase()] || "audio/mpeg";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// Playback used to read a track's entire file into memory, ship every byte
// across IPC to the renderer, and build a Blob from it before <audio> could
// even start — for a multi-MB file that's real, measurable latency on every
// track switch, and it's redone from scratch each time. This custom scheme
// lets <audio src="disc-media://..."> stream straight from disk instead
// (net.fetch on a file:// URL gets Range-request/streaming support for
// free), so playback can start as soon as the first chunk is available
// rather than waiting on the whole file. Must be registered before the app
// is ready. "standard: true" + "stream: true" are what let range requests
// and progressive playback work; "supportFetchAPI" isn't needed since
// nothing calls fetch() against it directly.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "disc-media",
    privileges: { standard: true, secure: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
]);

let mainWindow = null;
let normalBounds = null; // remembered so we can restore after compact mode
const folderWatchers = new Map(); // key -> FSWatcher
const watchDebounceTimers = new Map(); // key -> Timeout

// --- Persisted app settings (not the music-library data — just things
// like the memory limit that have to be known before the window/renderer
// even exists) ---------------------------------------------------------
const settingsPath = path.join(app.getPath("userData"), "disc-settings.json");

// Where a marked section's trimmed clip lives for dragging out to Premiere
// (see src/audio/sectionDrag.js) — a ".disc-sections" subfolder right next
// to the source track itself, not a temp directory. It used to live under
// the OS temp dir and get wiped on every launch, which meant a clip
// already sitting in a Premiere project would go offline as soon as Disc
// (or the OS) cleared temp — dragging into a timeline expects that file to
// keep existing. Named with a leading dot, and explicitly skipped by the
// folder scanner below, so it never shows up as a real library track.
const SECTIONS_DIR_NAME = ".disc-sections";
function sectionsDirFor(trackFilePath) {
  return path.join(path.dirname(trackFilePath), SECTIONS_DIR_NAME);
}

function loadSettings() {
  try {
    return JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    const dir = path.dirname(settingsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    // Best effort — worst case the setting doesn't persist.
  }
}

// V8's heap size flag only takes effect if set before the app (and its
// renderer processes) actually start, so this has to happen here at the
// top of the file — a runtime IPC call later would be too late.
const startupSettings = loadSettings();
if (startupSettings.memoryLimitMb) {
  app.commandLine.appendSwitch(
    "js-flags",
    `--max-old-space-size=${startupSettings.memoryLimitMb}`
  );
}

// Same timing requirement as the memory flag above: UV_THREADPOOL_SIZE
// only takes effect if set before the very first async fs (or other
// libuv-threadpool-backed) operation runs, so this has to happen here
// too — before app ready, before any folder scan or file read. This is
// the file-I/O side of "more CPU" (reading many audio files at once);
// it's separate from — and doesn't affect — Chromium's own internal
// audio-decode threading, which manages itself and isn't something this
// app can tune directly.
if (startupSettings.threadPoolSize) {
  process.env.UV_THREADPOOL_SIZE = String(startupSettings.threadPoolSize);
}

// Used as the little icon that follows the cursor during a native
// drag-out (e.g. dragging a track's waveform into Premiere Pro).
const dragIcon = nativeImage.createFromPath(
  path.join(__dirname, "assets", "drag-icon.png")
);

// No native File/Edit/View/Window/Help menu bar — Disc draws its own
// title bar entirely, themed to match whatever theme is active.
Menu.setApplicationMenu(null);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: "#1b1b1f",
    title: "Disc",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Needed later for native drag-out of files into Premiere Pro.
      // Left here as a marker for Phase 3 (drag-to-Premiere).
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("disc:window-maximized-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("disc:window-maximized-changed", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // The URL is disc-media://play/<encoded absolute file path>. "play" as
  // the host is arbitrary (custom schemes need one) — everything that
  // matters is in the path, which is exactly the file path run through
  // encodeURIComponent so path separators, drive-letter colons, spaces,
  // and unicode filenames all survive intact.
  //
  // This used to just be `net.fetch(pathToFileURL(filePath).href, ...)` —
  // simpler, but it left Chromium unable to tell the resource was actually
  // seekable (no reliable Accept-Ranges/Content-Range on the response), so
  // every attempt to seek got silently reset back to 0: <audio>.currentTime
  // would read back 0 immediately after being set, seeking/seeked fired but
  // landed at ~0 either way. Building the response by hand — reading only
  // the requested byte range via a real fs stream, and setting
  // Content-Range/Accept-Ranges/206 ourselves — is what actually makes
  // seeking work, rather than hoping net.fetch infers the right semantics
  // for a local file.
  protocol.handle("disc-media", async (request) => {
    try {
      const encoded = new URL(request.url).pathname.replace(/^\/+/, "");
      const filePath = decodeURIComponent(encoded);
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      const contentType = mediaMimeType(filePath);

      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        let start = match?.[1] ? parseInt(match[1], 10) : 0;
        let end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1;
        // A genuinely invalid range (start past the end of the file, or
        // past what it resolves to after clamping — including the
        // zero-byte-file case, where end lands at -1) has no sane byte
        // range to fall back to. The previous version reset `start` to 0
        // without touching `end`, which could still leave start > end and
        // hand createReadStream a nonsensical range instead of properly
        // rejecting it.
        if (start >= fileSize || start > end) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
          });
        }

        const stream = createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
          },
        });
      }

      const stream = createReadStream(filePath);
      return new Response(Readable.toWeb(stream), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error("Failed to start Disc:", err);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- IPC handlers -----------------------------------------------------

// Memory limit setting — read/write the persisted value, and relaunch to
// actually apply it (it's a startup-time V8 flag, so it can't take effect
// on a running process).
ipcMain.handle("disc:get-memory-limit", () => {
  return loadSettings().memoryLimitMb ?? null;
});

ipcMain.handle("disc:set-memory-limit", (_event, memoryLimitMb) => {
  const settings = loadSettings();
  if (memoryLimitMb) {
    settings.memoryLimitMb = memoryLimitMb;
  } else {
    delete settings.memoryLimitMb;
  }
  saveSettings(settings);
  return true;
});

// Same pattern as memory limit — read/write the persisted value, relaunch
// to actually apply it (UV_THREADPOOL_SIZE is also only readable at
// startup, same as the V8 heap flag).
ipcMain.handle("disc:get-thread-pool-size", () => {
  return loadSettings().threadPoolSize ?? null;
});

ipcMain.handle("disc:set-thread-pool-size", (_event, threadPoolSize) => {
  const settings = loadSettings();
  if (threadPoolSize) {
    settings.threadPoolSize = threadPoolSize;
  } else {
    delete settings.threadPoolSize;
  }
  saveSettings(settings);
  return true;
});

ipcMain.handle("disc:get-cpu-count", () => {
  return os.cpus().length;
});

// Used when a folder gets dragged in from Explorer — confirms the dropped
// path is genuinely a directory (not a file, and not something that just
// vanished) before Disc creates a linked folder for it.
ipcMain.handle("disc:stat-path", async (_event, targetPath) => {
  try {
    const stat = await fs.stat(targetPath);
    return { exists: true, isDirectory: stat.isDirectory() };
  } catch {
    return { exists: false, isDirectory: false };
  }
});

ipcMain.on("disc:relaunch", () => {
  app.relaunch();
  app.exit(0);
});

// --- Profiles ---------------------------------------------------------
// A "profile" is everything Disc persists (theme, folders, tags, notes,
// shortcuts, appearance, layout, marked sections, all of it) bundled
// into one JSON file. Since Disc doesn't hold the actual music files
// itself, a profile is what makes a whole setup shareable — send someone
// the file and they get your folder structure, tags, and settings
// without needing any of the same files to already be organized the
// same way (though the linked folder paths obviously still need to
// exist on their machine to actually show tracks).
//
// Each profile is its own file, named by a stable generated id rather
// than its display name — renaming a profile only ever means rewriting
// the "profileName" field inside the file, never touching the filename
// itself, which sidesteps every filesystem-rename edge case (illegal
// characters, collisions, case-sensitivity differences across
// platforms) that a name-as-filename scheme would run into.
const profilesDir = path.join(app.getPath("userData"), "profiles");

function ensureProfilesDir() {
  if (!existsSync(profilesDir)) mkdirSync(profilesDir, { recursive: true });
}

ipcMain.handle("disc:list-profiles", async () => {
  ensureProfilesDir();
  try {
    const files = await fs.readdir(profilesDir);
    const profiles = [];
    for (const fileName of files) {
      if (!fileName.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(profilesDir, fileName), "utf8");
        const parsed = JSON.parse(raw);
        profiles.push({
          fileName,
          profileName: parsed.profileName || fileName.replace(/\.json$/, ""),
          savedAt: parsed.savedAt || null,
        });
      } catch {
        // A corrupted/unreadable profile file is skipped rather than
        // breaking the whole list.
      }
    }
    profiles.sort((a, b) => a.profileName.localeCompare(b.profileName));
    return profiles;
  } catch {
    return [];
  }
});

ipcMain.handle("disc:save-profile", async (_event, { profileName, data, fileName }) => {
  ensureProfilesDir();
  try {
    const targetFileName = fileName || `profile-${Date.now()}.json`;
    const content = JSON.stringify(
      { profileName, savedAt: new Date().toISOString(), data },
      null,
      2
    );
    await fs.writeFile(path.join(profilesDir, targetFileName), content, "utf8");
    return { success: true, fileName: targetFileName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("disc:load-profile", async (_event, fileName) => {
  try {
    const raw = await fs.readFile(path.join(profilesDir, fileName), "utf8");
    const parsed = JSON.parse(raw);
    return { success: true, profileName: parsed.profileName, data: parsed.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("disc:rename-profile", async (_event, { fileName, newName }) => {
  try {
    const filePath = path.join(profilesDir, fileName);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.profileName = newName;
    await fs.writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("disc:delete-profile", async (_event, fileName) => {
  try {
    await fs.unlink(path.join(profilesDir, fileName));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Exporting writes to wherever the person chooses (for sharing via
// email, a drive, etc) — a completely separate concern from the
// profiles folder above, which is just Disc's own local list.
ipcMain.handle("disc:export-profile-to-file", async (_event, { profileName, data }) => {
  if (!mainWindow) return { success: false };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export Disc profile",
    defaultPath: `${profileName.replace(/[/\\:*?"<>|]/g, "")}.discprofile.json`,
    filters: [{ name: "Disc Profile", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { success: false, cancelled: true };
  try {
    const content = JSON.stringify(
      { profileName, savedAt: new Date().toISOString(), data },
      null,
      2
    );
    await fs.writeFile(result.filePath, content, "utf8");
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("disc:import-profile-from-file", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import a Disc profile",
    properties: ["openFile"],
    filters: [{ name: "Disc Profile", extensions: ["json"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  try {
    const raw = await fs.readFile(result.filePaths[0], "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.data) return { success: false, error: "Not a valid Disc profile file" };
    return { success: true, profileName: parsed.profileName || "Imported Profile", data: parsed.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Toggle "always on top" — this is the lock button in the title bar.
ipcMain.handle("disc:toggle-always-on-top", (_event, shouldPin) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(shouldPin, "floating");
  return mainWindow.isAlwaysOnTop();
});

// Window controls — needed because the window is frameless so Disc can
// draw its own title bar (themed to match the active theme, rather than
// leaving an unthemed native title bar + menu bar on top of it).
ipcMain.on("disc:window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("disc:window-toggle-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("disc:window-is-maximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.on("disc:window-close", () => {
  mainWindow?.close();
});

// Open a native folder picker so the person can point Disc at their
// music folder. Actually reading/watching that folder is Phase 2 —
// this just returns the chosen path for now.
ipcMain.handle("disc:choose-music-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose your Disc music folder",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// A native multi-select file picker for adding mp3s — a reliable
// alternative to drag-and-drop, since OS-level DND can get intercepted by
// third-party window-manager tools (WindHawk mods and similar) in ways
// Disc has no visibility into or control over.
ipcMain.handle("disc:choose-mp3-files", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    title: "Choose mp3s, wavs, oggs, or mov clips to add",
    filters: [{ name: "Audio & Video", extensions: ["mp3", "wav", "ogg", "mov"] }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

function getFileType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mov")) return "video";
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg")) return "audio";
  return null;
}

// Recursively walk a folder and return every .mp3/.mov file it finds,
// along with its path relative to the root (used to figure out which
// subfolder a track lives in). Returns null (not []) if the root itself
// doesn't exist/isn't reachable — e.g. an external drive that's been
// unplugged — so the renderer can tell "genuinely empty" apart from
// "temporarily unreachable" and avoid dropping tracks from view.
async function scanForMp3s(rootDir) {
  try {
    await fs.access(rootDir);
  } catch {
    return null;
  }

  const results = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const fileType = entry.isFile() ? getFileType(entry.name) : null;
      if (entry.isDirectory()) {
        // Marked-section clips (see sectionsDirFor above) live right next
        // to their source track, inside a folder a normal scan would
        // otherwise happily walk into and list as real library tracks.
        if (entry.name === SECTIONS_DIR_NAME) continue;
        await walk(fullPath);
      } else if (fileType) {
        let sizeBytes = 0;
        let addedAtMs = null;
        try {
          const stat = await fs.stat(fullPath);
          sizeBytes = stat.size;
          // birthtime isn't reliable on every filesystem (some report the
          // same value as mtime, or epoch 0) — fall back to mtime then.
          addedAtMs =
            stat.birthtimeMs && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
        } catch {
          // File may have been removed mid-scan; skip its stats silently.
        }
        const relativeDir = path.relative(rootDir, currentDir);
        results.push({
          id: fullPath,
          filePath: fullPath,
          fileName: entry.name,
          fileType,
          relativeDir: relativeDir === "" ? null : relativeDir,
          sizeBytes,
          addedAtMs,
        });
      }
    }
  }

  await walk(rootDir);
  return results;
}

ipcMain.handle("disc:scan-folder", async (_event, folderPath) => {
  if (!folderPath) return [];
  return scanForMp3s(folderPath);
});

// Reads a file's raw bytes so the renderer can play it (via a Blob URL)
// and decode its waveform (via Web Audio) without needing file:// access,
// which is unreliable from a Vite dev server origin.
ipcMain.handle("disc:read-audio-file", async (_event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    // Return a plain Uint8Array (not a Node Buffer) so it structured-clones
    // cleanly across the context bridge and works directly with Blob().
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
});

// --- Audio → MP3 converter -------------------------------------------
// Decoding and encoding both happen in the renderer (Chromium decodes
// all of these natively via Web Audio — the same pipeline already used
// everywhere else in Disc for waveforms; lamejs — a pure-JS encoder, no
// native binary — handles the MP3 side). The main process's job here is
// just picking files/folders and writing the finished bytes to disk.
// This list is deliberately limited to formats Chromium's Web Audio
// reliably decodes — leaving out things like WMA that aren't a
// web-standard format and can't be promised to work.
const CONVERTIBLE_EXTENSIONS = ["ogg", "wav", "flac", "m4a", "aac", "opus", "webm"];

ipcMain.handle("disc:choose-convertible-files", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    title: "Choose audio files to convert",
    filters: [{ name: "Audio", extensions: CONVERTIBLE_EXTENSIONS }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle("disc:choose-convertible-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose a folder to search for audio files",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Recursively finds every convertible audio file under a folder — same
// shape of walk as the main library scanner, just narrower (a fixed
// extension list, no track metadata needed, just paths).
ipcMain.handle("disc:scan-for-convertible", async (_event, rootDir) => {
  const results = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === SECTIONS_DIR_NAME) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.toLowerCase().split(".").pop();
        if (CONVERTIBLE_EXTENSIONS.includes(ext)) results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return results;
});

// Writes the finished MP3 bytes (encoded in the renderer) to the chosen
// destination folder, using the original filename with a .mp3 extension.
// Skips (rather than overwrites) if a file with that name already exists,
// since silently overwriting something in the user's music folder is the
// kind of thing that should never happen without them explicitly asking.
ipcMain.handle("disc:write-converted-mp3", async (_event, { destFolder, fileName, bytes }) => {
  try {
    const destPath = path.join(destFolder, fileName);
    try {
      await fs.access(destPath);
      return { success: false, skipped: true, reason: "A file with that name already exists" };
    } catch {
      // Doesn't exist yet — good, proceed.
    }
    await fs.writeFile(destPath, Buffer.from(bytes));
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Writes a trimmed marked-section clip into the source track's own
// .disc-sections folder (created on first use), for dragging just that
// section into Premiere. Unlike disc:write-converted-mp3 (which writes
// user-facing files into a linked library folder and must never silently
// clobber something), this always overwrites — it's keyed by the
// section's own id (see sectionFileName in src/audio/sectionDrag.js), so
// re-rendering the same section is expected to replace its own file, not
// collide with anything else. path.basename() strips any directory
// components from the renderer-supplied name so a write can never land
// outside the intended folder.
ipcMain.handle("disc:write-section-audio", async (_event, { trackFilePath, fileName, bytes }) => {
  try {
    const dir = sectionsDirFor(trackFilePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const safeName = path.basename(String(fileName || "section.mp3"));
    const destPath = path.join(dir, safeName);
    await fs.writeFile(destPath, Buffer.from(bytes));
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Lets the renderer skip re-trimming/re-encoding a section clip that's
// already sitting on disk from a previous session — now that these
// persist instead of living in a wiped-on-launch temp dir, there's no
// reason to redo that work every time Disc restarts.
ipcMain.handle("disc:section-audio-exists", async (_event, { trackFilePath, fileName }) => {
  const safeName = path.basename(String(fileName || ""));
  const destPath = path.join(sectionsDirFor(trackFilePath), safeName);
  try {
    await fs.access(destPath);
    return { exists: true, path: destPath };
  } catch {
    return { exists: false, path: destPath };
  }
});

// Removes one section's clip — called when its marked section is deleted
// in Disc, so .disc-sections doesn't just accumulate orphaned files
// forever. Best-effort: a clip that was never actually dragged (so never
// rendered) simply won't exist, which is fine.
ipcMain.handle("disc:delete-section-audio", async (_event, { trackFilePath, fileName }) => {
  const safeName = path.basename(String(fileName || ""));
  const destPath = path.join(sectionsDirFor(trackFilePath), safeName);
  try {
    await fs.unlink(destPath);
  } catch {
    // Already gone, or never existed — nothing to do.
  }
  return { success: true };
});

// Renames a track's actual file on disk, keeping its original extension
// (the rename UI only ever lets you edit the name without the extension,
// same as how it's displayed everywhere else — this just enforces that
// on the backend too, so there's no way to accidentally give a file the
// wrong extension). Strips characters that are illegal in filenames on
// Windows even if they'd be fine on the OS Disc happens to be running on,
// since library folders often get shared/moved across machines.
ipcMain.handle("disc:rename-track-file", async (_event, { filePath, newStem }) => {
  try {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const safeName = newStem.replace(/[/\\:*?"<>|]/g, "").trim();
    if (!safeName) return { success: false, error: "Name can't be empty" };

    const newPath = path.join(dir, `${safeName}${ext}`);
    if (newPath === filePath) return { success: true, newPath };

    try {
      await fs.access(newPath);
      return { success: false, error: "A file with that name already exists" };
    } catch {
      // Doesn't exist yet — good, proceed.
    }

    await fs.rename(filePath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Copy mp3s dragged into the Disc window from the OS into the chosen
// music folder. The folder watcher then picks the new files up on its own.
ipcMain.handle("disc:copy-files-into-folder", async (_event, { folderPath, sourcePaths }) => {
  const copied = [];
  const skipped = [];
  if (!folderPath || !Array.isArray(sourcePaths)) return { copied, skipped };

  for (const sourcePath of sourcePaths) {
    if (!getFileType(sourcePath)) {
      skipped.push(sourcePath);
      continue;
    }

    const baseName = path.basename(sourcePath);
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    let destName = baseName;
    let destPath = path.join(folderPath, destName);
    let counter = 1;

    // Don't clobber a file that's already there — rename with " (1)", " (2)"...
    while (true) {
      try {
        await fs.access(destPath);
        destName = `${stem} (${counter})${ext}`;
        destPath = path.join(folderPath, destName);
        counter += 1;
      } catch {
        break;
      }
    }

    // Copying (not moving) so the original file, wherever it was dragged
    // from, is left untouched.
    try {
      await fs.copyFile(sourcePath, destPath);
      copied.push(destPath);
    } catch {
      skipped.push(sourcePath);
    }
  }

  return { copied, skipped };
});

// Zips up a folder's tracks and saves them wherever the person picks —
// the "send this to a colleague" export. Files' relative subfolder
// structure (if any) is preserved inside the archive.
ipcMain.handle("disc:export-folder-zip", async (_event, { suggestedName, files }) => {
  if (!mainWindow || !Array.isArray(files) || files.length === 0) {
    return { success: false };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export folder as ZIP",
    defaultPath: `${suggestedName || "Disc Export"}.zip`,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  try {
    const zip = new AdmZip();
    for (const file of files) {
      const folderInZip = file.relativeDir ? file.relativeDir.replace(/\\/g, "/") : "";
      try {
        zip.addLocalFile(file.filePath, folderInZip, file.fileName);
      } catch {
        // Skip a file that vanished/became unreadable mid-export (e.g. an
        // unplugged drive) rather than failing the whole archive.
      }
    }
    zip.writeZip(result.filePath);
    return { success: true, filePath: result.filePath, fileCount: files.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Watch a folder so new/removed mp3s are picked up automatically instead
// of requiring a manual rescan. Each root Disc cares about (the main music
// folder, plus any linked custom-folder directories) gets its own watcher,
// identified by `key` — "main" for the music folder, or a custom folder's
// id. We just notify the renderer that something changed under that key
// and let it re-run disc:scan-folder for that specific root.
ipcMain.handle("disc:watch-folder", (_event, { key, folderPath }) => {
  const existing = folderWatchers.get(key);
  if (existing) {
    existing.close();
    folderWatchers.delete(key);
  }
  if (!folderPath || !mainWindow) return false;

  try {
    const watcher = watch(
      folderPath,
      { recursive: true },
      () => {
        clearTimeout(watchDebounceTimers.get(key));
        watchDebounceTimers.set(
          key,
          setTimeout(() => {
            mainWindow?.webContents.send("disc:folder-changed", key);
          }, 400)
        );
      }
    );
    // fs.watch's returned watcher is an EventEmitter — an unhandled
    // 'error' event on any EventEmitter throws in Node by default, and
    // that would crash this whole process, not just fail this one watch.
    // A watched directory disappearing mid-session (an external/network
    // drive getting disconnected — exactly what Disc's "missing folder"
    // banner already exists to handle) is a real, expected way for this
    // to fire, so it needs a real handler, not silence.
    watcher.on("error", () => {
      folderWatchers.delete(key);
      mainWindow?.webContents.send("disc:folder-changed", key);
    });
    folderWatchers.set(key, watcher);
    return true;
  } catch {
    // Recursive watching isn't supported on every platform/filesystem;
    // the person can still hit a manual rescan if this silently fails.
    return false;
  }
});

ipcMain.handle("disc:unwatch-folder", (_event, key) => {
  const existing = folderWatchers.get(key);
  if (existing) {
    existing.close();
    folderWatchers.delete(key);
  }
  clearTimeout(watchDebounceTimers.get(key));
  watchDebounceTimers.delete(key);
  return true;
});

// Native OS drag-out — this is what lets a track's waveform be dragged
// straight onto Premiere Pro's timeline (or anywhere else that accepts a
// dropped file), the same as dragging it out of Explorer. Must be
// triggered via ipcRenderer.send (not invoke) and handled synchronously:
// startDrag needs to run in the same tick as the renderer's dragstart
// event, so the async round-trip of invoke/handle would break it.
ipcMain.on("disc:start-drag", (event, filePath) => {
  if (!filePath) return;
  event.sender.startDrag({
    file: filePath,
    icon: dragIcon,
  });
});

// Shows the file selected in Explorer — the "reveal in Explorer" action.
ipcMain.on("disc:reveal-in-explorer", (_event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.on("disc:copy-to-clipboard", (_event, text) => {
  if (typeof text === "string") clipboard.writeText(text);
});

// Deletes a track from disk — moves it to the OS trash/recycle bin rather
// than permanently unlinking it, so it's recoverable if this was a mistake
// (e.g. clicked the wrong duplicate).
ipcMain.handle("disc:delete-file", async (_event, filePath) => {
  if (!filePath) return false;
  try {
    await shell.trashItem(filePath);
    return true;
  } catch {
    return false;
  }
});

// Physically moves a file on disk into a different folder — used by the
// multi-select "Move to folder" batch action. Same collision-safe
// renaming as the drag-and-drop copy handler, but moves rather than
// copies since this is reorganizing files that are already in the library.
ipcMain.handle("disc:move-file", async (_event, { sourcePath, destFolderPath }) => {
  if (!sourcePath || !destFolderPath) return null;

  const baseName = path.basename(sourcePath);
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let destName = baseName;
  let destPath = path.join(destFolderPath, destName);
  let counter = 1;

  while (true) {
    try {
      await fs.access(destPath);
      if (path.resolve(destPath) === path.resolve(sourcePath)) break; // moving onto itself
      destName = `${stem} (${counter})${ext}`;
      destPath = path.join(destFolderPath, destName);
      counter += 1;
    } catch {
      break;
    }
  }

  try {
    await fs.rename(sourcePath, destPath);
  } catch {
    // rename() fails across different drives — fall back to copy+delete.
    try {
      await fs.copyFile(sourcePath, destPath);
      await fs.unlink(sourcePath);
    } catch {
      return null;
    }
  }
  return destPath;
});

// --- Compact mode -------------------------------------------------------
// Shrinks the window down to just the title bar + now-playing strip, for
// tucking into a corner while an editor eats the rest of the screen.
ipcMain.on("disc:enter-compact-mode", () => {
  if (!mainWindow) return;
  normalBounds = mainWindow.getBounds();

  const width = 400;
  const height = 96;
  const workArea = screen.getPrimaryDisplay().workArea;
  const x = workArea.x + workArea.width - width - 16;
  const y = workArea.y + workArea.height - height - 16;

  mainWindow.setMinimumSize(360, 90);
  mainWindow.setBounds({ x, y, width, height });
});

ipcMain.on("disc:exit-compact-mode", () => {
  if (!mainWindow) return;
  mainWindow.setMinimumSize(760, 480);
  if (normalBounds) {
    mainWindow.setBounds(normalBounds);
  } else {
    mainWindow.setSize(1280, 800);
  }
});
