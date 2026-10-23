import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu, shell, clipboard, screen, protocol } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { watch, readFileSync, appendFileSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import os from "node:os";
import { createRequire } from "node:module";

// mouse-state is a Windows-only native addon (CommonJS, so it needs
// createRequire from this ESM file) — see native/mouse-state/mouse_state.cc
// and the comment above setupWindowSnap below for why it's needed at all.
// Loaded defensively: it may not be built (missing Visual Studio Build
// Tools, or it simply failed to build), and Disc must keep working
// perfectly well without it — the window-snap system just falls back to
// its slower timer-based heuristic for detecting drag-end.
const require = createRequire(import.meta.url);
let mouseState = null;
if (process.platform === "win32") {
  try {
    mouseState = require("mouse-state");
  } catch {
    mouseState = null;
  }
}

// Dev-only escape hatch so a second checkout (a git worktree used for
// testing a branch, for instance) doesn't share userData — and therefore
// localStorage and device-identity.json — with whatever install is
// already using the default profile. Without this, an untested branch
// could silently read/write real data, including emitting Studio Sync
// events under the real device's identity into a real shared folder.
if (process.env.DISC_USER_DATA) {
  app.setPath("userData", process.env.DISC_USER_DATA);
}

// Where Disc's own releases are published — used by the update check
// below. Public repo, so the GitHub API needs no auth for this.

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
  // The Image panel (see ImagePanel.jsx) streams its picture through this
  // same protocol rather than storing image bytes in localStorage.
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
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

// Without this, launching Disc while it's already running doesn't do
// nothing so much as it does something confusing: a second full process
// tree (Vite + Electron) spins up and immediately collides with the first
// over port 5174, and depending on timing that can either silently fail
// or leave stray processes behind — repeated launches this way is
// genuinely how a machine ends up with a pile of stuck node/electron
// processes and a Desktop shortcut that looks like it's doing nothing.
// requestSingleInstanceLock() is the standard Electron fix: a second
// launch attempt hands off to the first instance (which just focuses its
// window, see the "second-instance" listener below) and quits
// immediately instead of trying to run alongside it.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Windows identifies running apps for taskbar pinning/grouping/
// notifications by this id, not by window title or icon — without it,
// every Electron app running from the same generic node_modules/electron/
// dist/electron.exe (true for any dev-mode Electron app, not just this
// one) is indistinguishable to Windows, which is very likely why pinning
// straight from the running taskbar button falls back to Electron's own
// generic icon regardless of what icon the BrowserWindow itself was given.
// Deliberately its own id, distinct from package.json's build.appId
// ("com.disc.lite") — that id is what a real packaged install registers
// with Windows (Start Menu entry, Programs-and-Features entry, icon), and
// a dev-mode instance squatting on the same id can end up with a blank/
// generic taskbar icon if that packaged install is ever removed while
// Windows still has this id cached against it. A distinct id sidesteps
// that regardless of what is or isn't installed.
if (process.platform === "win32") {
  app.setAppUserModelId("com.disc.lite");
}

let mainWindow = null;
const folderWatchers = new Map(); // key -> FSWatcher
const watchDebounceTimers = new Map(); // key -> Timeout

// --- Persisted app settings (not the music-library data — just things
// like the memory limit that have to be known before the window/renderer
// even exists) ---------------------------------------------------------
const settingsPath = path.join(app.getPath("userData"), "disc-settings.json");
const crashLogPath = path.join(app.getPath("userData"), "crash-log.jsonl");

// Where a marked section's trimmed clip lives for dragging out to Premiere
// (see src/audio/sectionDrag.js) — a ".disc-sections" subfolder right next
// to the source track itself, not a temp directory. It used to live under
// the OS temp dir and get wiped on every launch, which meant a clip
// already sitting in a Premiere project would go offline as soon as Disc
// (or the OS) cleared temp — dragging into a timeline expects that file to
// keep existing. Named with a leading dot, and explicitly skipped by the
// folder scanner below, so it never shows up as a real library track.
const SECTIONS_DIR_NAME = ".disc-sections";
function loadSettings() {
  try {
    return JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

// --- Studio Sync: per-device identity + append-only event log ---------
// See docs/collab-sync-scope.md. Each install gets a random id (never
// synced — it's what names this device's own log file) and an editable
// display name. Deliberately stored outside userData's Local Storage
// (which is what the renderer's own localStorage uses) since this needs
// to be readable before/without a renderer at all, same reasoning as
// disc-settings.json above.

// Folder used inside a shared/synced music directory for the event log —
// same "dot-prefixed, explicitly skipped by the scanner" pattern as
// SECTIONS_DIR_NAME above, so it never shows up as library content.
const SYNC_DIR_NAME = ".disc-sync";

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

// Several themes' (Tron, Sunset, Emerald, Abyss, Ember, Midnight, Blush)
// blurred-desktop background is real Windows 11 Mica/Acrylic
// (win.backgroundMaterial), not a CSS trick — CSS backdrop-filter can only
// blur other content already rendered inside the page, it has no way to
// reach the actual desktop/other windows behind a transparent Electron
// window, which is what "blur what's behind it" actually requires.
// backgroundMaterial is a Windows-11-only, constructor-time-only option (no
// supported way to flip it on a live window), so switching to one of these
// themes needs a restart to take visual effect — same "changes a startup
// flag, needs a relaunch" pattern already used for the memory-limit and
// CPU-thread settings above.
//
// Windows 10 and 11 both report process.platform === "win32" and even the
// same os.release() major/minor ("10.0") — the only thing that actually
// tells them apart is the build number, which jumps to 22000+ on 11. That
// distinction matters here specifically: setting transparent + a
// backgroundMaterial the compositor doesn't support is what was causing
// real Windows 10 users theme-switching crashes and a blank/broken window,
// not just a missing visual effect. Gating on the real build number keeps
// Windows 10 on the plain opaque window path — acrylic-tagged themes still
// render (translucent CSS panels, just with no real blur behind them,
// exactly as themes.js's requiresAcrylic comment already describes as the
// intended non-Windows-11 fallback), it just never touches transparent /
// backgroundMaterial at all.
const isWindows11 =
  process.platform === "win32" && parseInt(os.release().split(".")[2] || "0", 10) >= 22000;
const useAcrylic = isWindows11 && Boolean(startupSettings.useAcrylic);

// --- Rounded window corners ---------------------------------------------
// Windows 11 rounds every normal top-level window's corners by default,
// but a frameless (WS_POPUP-style) BrowserWindow like Disc's opts itself
// out of that automatically — DWM clips the window's actual surface, not
// something CSS can influence, so getting Disc's corners to look like
// every other window on the desktop needs the native
// setWindowCornerPreference helper from native/mouse-state (see its
// mouse_state.cc for why it lives in that addon).
const DWMWCP_DONOTROUND = 1;
const DWMWCP_ROUND = 2;

// Tracks the corner state actually applied to each window so resize
// events (which fire continuously while the user drags an edge) only
// make the native call on an actual change, not on every pixel of drag.
const appliedCornerPreference = new WeakMap();

function applyWindowCornerPreference(win, preference) {
  if (!isWindows11 || !mouseState?.setWindowCornerPreference) return;
  if (!win || win.isDestroyed()) return;
  if (appliedCornerPreference.get(win) === preference) return;
  try {
    mouseState.setWindowCornerPreference(win.getNativeWindowHandle(), preference);
    appliedCornerPreference.set(win, preference);
  } catch {
    // Cosmetic only — never worth crashing over.
  }
}

// A window "fills its display" when maximized OR (via our own snap
// system's "top" zone, which resizes to the full work area via setBounds
// rather than an actual OS-level maximize) sized to cover the display's
// entire work area edge-to-edge. Either way it should look flush with
// the screen — square corners, exactly like Windows' own maximized
// windows — rather than visibly rounded ones cutting into the display.
function windowFillsDisplay(win) {
  if (win.isMaximized()) return true;
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  return (
    bounds.x <= workArea.x &&
    bounds.y <= workArea.y &&
    bounds.x + bounds.width >= workArea.x + workArea.width &&
    bounds.y + bounds.height >= workArea.y + workArea.height
  );
}

function updateWindowCorners(win) {
  if (!win || win.isDestroyed()) return;
  applyWindowCornerPreference(win, windowFillsDisplay(win) ? DWMWCP_DONOTROUND : DWMWCP_ROUND);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 480,
    // A fully-opaque backgroundColor would paint over the acrylic material
    // before Disc's own (semi-transparent, for these themes) CSS
    // backgrounds ever get a chance to show it through. transparent:true is
    // what actually makes Chromium preserve alpha when compositing the
    // page — without it, the renderer assumes an opaque surface and the
    // whole page effectively fails to paint over the native material
    // instead of blending with it (shows up as a real blurred backdrop
    // with the entire Disc UI missing).
    backgroundColor: useAcrylic ? "#00000000" : "#000000",
    // Deliberately not just "Disc" — launch-disc.vbs uses AppActivate to
    // detect whether the app is already running before deciding to launch
    // it, and AppActivate does a case-insensitive *prefix* match against
    // every open window's title. A plain "Disc" title can match something
    // else entirely (a File Explorer window for a folder literally named
    // "disc", say), which AppActivate happily "activates" (brings to
    // front) instead of ever starting the app — the launcher silently
    // does nothing. This longer, more specific title is unlikely to
    // prefix-match anything else.
    title: "Disc Lite",
    // Without this, dev mode (`electron .`, not a packaged build) shows
    // Electron's own generic default icon in the taskbar instead of
    // Disc's — a packaged build gets this for free from the .exe's own
    // embedded icon resource (see package.json's build.win config), but
    // that only applies once actually built; running from source needs
    // it set explicitly.
    icon: path.join(__dirname, "assets", "disc-icon.ico"),
    frame: false,
    ...(useAcrylic ? { backgroundMaterial: "acrylic", transparent: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Needed later for native drag-out of files into Premiere Pro.
      // Left here as a marker for Phase 3 (drag-to-Premiere).
    },
  });

  // Belt-and-suspenders alongside the `icon:` constructor option above —
  // harmless, and keeps the window's icon explicitly set on the live
  // native handle rather than relying solely on constructor-time state.
  mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, "assets", "disc-icon.ico")));

  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Electron syncs the window title to the page's own <title> on every
  // navigation/reload by default, which would silently undo the title set
  // above (index.html's <title> is just "Disc") — launch-disc.vbs depends
  // on the window title staying exactly "Disc Lite" to reliably
  // detect an already-running instance (see comment there), so that has to
  // win over whatever the page sets.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  // "Maximized" no longer means real OS-level win.maximize() at all (see
  // disc:window-toggle-maximize below for why) — these two just keep
  // corner-rounding in sync on the off chance something outside this
  // file's own code puts the window into that state (Win+Up, say).
  // disc:window-maximized-changed is sent from the toggle handler now,
  // not here, so there's exactly one source of truth for that.
  mainWindow.on("maximize", () => updateWindowCorners(mainWindow));
  mainWindow.on("unmaximize", () => updateWindowCorners(mainWindow));
  // Covers every other way the window's size can change — our own snap
  // system's release-triggered setBounds (including the "top" zone,
  // which fills the work area without ever calling win.maximize()) and
  // the user manually dragging an edge — so corners stay in sync with
  // whatever's actually on screen, not just real OS-level maximize.
  mainWindow.on("resize", () => updateWindowCorners(mainWindow));

  // The main *process* surviving a renderer crash doesn't mean the user
  // is fine — Disc's title bar (including its close button) is drawn by
  // the same renderer that just died, so a crash otherwise leaves a
  // window that's stuck on screen, blank, with no way to close it short
  // of Alt+F4 or Task Manager. Logs first (so there's a record even if
  // nobody was watching when it happened), then a native dialog for
  // recovery — native because it doesn't depend on the crashed page to
  // render, unlike everything else in this app.
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    try {
      const entry = {
        ts: new Date().toISOString(),
        reason: details.reason,
        exitCode: details.exitCode,
      };
      appendFileSync(crashLogPath, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // Logging the crash is best-effort — nothing to do if even that fails.
    }
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "error",
        title: "Disc crashed",
        message: `Disc's window stopped responding (${details.reason}).`,
        detail:
          "This has been logged (Settings → Troubleshooting has a button to find the log). Reload to keep working, or close the window.",
        buttons: ["Reload", "Close"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (!mainWindow) return;
        if (result.response === 0) {
          if (isDev) mainWindow.loadURL("http://localhost:5174");
          else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
        } else {
          mainWindow.close();
        }
      });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    teardownWindowSnap();
  });

  setupWindowSnap(mainWindow);
  updateWindowCorners(mainWindow);
  // Created up front, not lazily on the first drag — a data: URL loads
  // near-instantly, but "near" still isn't zero, and creating this
  // window for the first time in the middle of the very first drag was
  // one of the things contributing to that first preview looking like a
  // flicker rather than a clean fade in.
  ensureSnapPreviewWindow();
}

// --- Window snapping ---------------------------------------------------
// A from-scratch, OS-independent replacement for Windows' own Snap —
// dragging the title bar to a screen edge shows a preview and, on
// release, resizes the window to that zone. Electron's own
// -webkit-app-region:drag moves the window itself rather than handing off
// to a real native move gesture, so DWM's actual Snap engine never
// engages no matter how the title bar is set up (see the git history for
// the earlier, abandoned attempt to get real native Snap working, both
// via a native addon and by giving non-acrylic themes an actual native
// frame) — this sidesteps that entirely by not depending on it at all.
// Works identically for every theme, including acrylic/transparent ones,
// which native Snap fundamentally couldn't support.
const SNAP_EDGE_PX = 28; // distance from a work-area edge that counts as "in the zone"
const SNAP_ARM_MOVES = 3; // consecutive 'move' events required before treating this as a real drag, not an incidental programmatic setBounds
// Chromium doesn't deliver a normal DOM mouseup for the button that
// started a -webkit-app-region:drag window move — confirmed by testing,
// not just suspected: instrumented both paths and every single release
// during a real drag only ever hit the fallback timer, never a mouseup
// event, no matter how the drag ended. mouseState (see the require above)
// sidesteps that by polling Windows directly for whether the button is
// still physically held, checked every SNAP_POLL_MS while a drag might be
// active — this is what actually ends a drag now. SNAP_DRAG_END_MS below
// only matters as a fallback on non-Windows/pre-mouseState-build systems.
const SNAP_POLL_MS = 40;
const SNAP_DRAG_END_MS = 3000; // fallback only, and only when mouseState isn't available at all — see the comment above. Deliberately long so it can never mistake an ordinary mid-drag pause for the drag having ended.

let snapPreviewWindow = null;
let snapMoveTimer = null;
let snapPollTimer = null;
let snapMoveStreak = 0;
let snapPendingZone = null; // { type, display } | null
let snapTargetWindow = null;
// Which zone the preview is *currently showing* (not just whatever the
// cursor happens to be over this instant) — used two ways below: as a
// hysteresis band (once a zone is active, leaving it needs a bigger move
// than entering it did, so ordinary hand jitter right at the boundary
// during a real drag doesn't flicker the preview in and out), and to skip
// re-issuing setBounds/show on every single 'move' event while the
// cursor sits still inside the same zone (each 'move' event redoes this
// work otherwise, which is its own separate source of visible flicker).
let snapActiveZoneType = null;
// Accent color for the preview — piped in from the renderer (see
// disc:set-snap-accent-color below) since only it can read the active
// theme's actual CSS custom property; this is just the last value it
// reported, with a reasonable default before that first report arrives.
let snapAccentRgb = "79, 157, 255";
// Windows-style "un-snap on drag away, back to whatever size it was
// before" — snapWasFree holds the exact bounds the window had right
// before its *first* snap in the current streak (snapping left, then top,
// then right in one continuous session must all restore to that same
// original size, not to "left" when un-snapping from "top"). Guarded by
// isSnapped so it's only captured once per streak, and cleared once the
// window is actually back to a free size.
let snapIsSnapped = false;
let snapFreeBounds = null;
// A short ignore-window (timestamp, not a one-shot flag) set right before
// this module calls setBounds on the real window itself, so the 'move'
// event(s) that call triggers don't get misread as the user still
// actively dragging. This has to be a window, not a single-consume
// boolean: one setBounds call can fire more than one 'move' event, and a
// boolean only swallows the first — the rest were slipping through,
// re-arming the whole system off our *own* resize and causing a visibly
// laggy, sometimes-snaps-back-to-the-big-size mess.
let snapIgnoreMoveUntil = 0;
const SNAP_IGNORE_MOVE_MS = 120;

function markProgrammaticMove() {
  snapIgnoreMoveUntil = Date.now() + SNAP_IGNORE_MOVE_MS;
}

// Snap/un-snap just resizes the window outright — no animation. Earlier
// versions tried a few: tweening the real window's own bounds directly
// (~60 setBounds calls a second, visibly staggery, since Windows redoes
// a full layout/repaint of Disc's entire real UI on every one), a CSS
// clip-path on the real page content (still not smooth — Disc's own
// live content can force its own repaints regardless of will-change,
// competing with the animation for main-thread time), then a FLIP
// transform played over a static snapshot of the window (smooth, but
// still felt "clunky" — an extra visual event on top of what's already
// an instant, deliberate action). Landed here: the window just resizes,
// same as clicking a normal maximize/restore button anywhere else.
function resizeSnapTarget(win, to) {
  if (win.isDestroyed()) return;
  markProgrammaticMove();
  win.setBounds(to);
}

// Where a restored (un-snapped) window lands, given the size it's being
// restored to — horizontally centered on its current display, at
// whatever height the (still snapped/maximized) window's own top edge
// is currently at, not the monitor's top edge. Every snap zone (see
// snapZoneBounds) starts flush with the display's own left edge, so just
// keeping the window's current x on restore meant it always landed in
// the top-left corner of the screen no matter which zone or the
// maximize button it came from — centering just the x reads as a
// deliberate "here's your window back" placement instead, without
// moving it somewhere its top edge wasn't already.
function unsnapPosition(win, size) {
  const current = win.getBounds();
  const { workArea } = screen.getDisplayMatching(current);
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: current.y,
  };
}

function getSnapZone(point) {
  const display = screen.getDisplayNearestPoint(point);
  const { x, y, width, height } = display.workArea;
  const relX = point.x - x;
  const relY = point.y - y;
  const threshold = snapActiveZoneType ? SNAP_EDGE_PX * 2 : SNAP_EDGE_PX;
  const nearTop = relY <= threshold;
  const nearLeft = relX <= threshold;
  const nearRight = relX >= width - threshold;

  if (nearTop && nearLeft) return { type: "top-left", display };
  if (nearTop && nearRight) return { type: "top-right", display };
  if (nearTop) return { type: "top", display };
  if (nearLeft) return { type: "left", display };
  if (nearRight) return { type: "right", display };
  return null;
}

function hexToRgbString(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

// How long the preview fades in/out over — kept in one place since both
// the CSS transition duration and the JS timer that waits for it to
// finish before actually hiding the window need to agree.
const SNAP_PREVIEW_FADE_MS = 140;
// How far the rounded "card" sits in from the zone's true edges.
const SNAP_PREVIEW_INSET = 10;

function snapPreviewHtml() {
  // A rounded, inset "card" rather than a flat edge-to-edge rectangle —
  // matches how Windows' own snap-assist preview looks (a soft-shadowed
  // rounded panel floating a few pixels in from the zone's true edges),
  // which reads as far more deliberate than a plain colored box.
  //
  // The card's left/top/width/height are plain (untransitioned) inline
  // styles set by showSnapPreview below, in coordinates *relative to
  // this window* — deliberately not `inset`/percentage-based, since this
  // window itself no longer resizes per zone (see the comment on
  // showSnapPreview for why: resizing a transparent BrowserWindow is
  // what was actually producing the "pops twice" look, not the fade
  // logic). Only opacity/transform are transitioned, so switching which
  // zone is showing repositions the card instantly while the fade stays
  // smooth.
  const html = `
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
      }
      .zone {
        position: absolute;
        left: 0px;
        top: 0px;
        width: 0px;
        height: 0px;
        border-radius: 14px;
        background: linear-gradient(165deg,
          rgba(${snapAccentRgb}, 0.32),
          rgba(${snapAccentRgb}, 0.16));
        border: 1.5px solid rgba(${snapAccentRgb}, 0.85);
        box-shadow:
          0 16px 40px rgba(0, 0, 0, 0.35),
          0 2px 8px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.14);
        opacity: 0;
        transform: scale(0.96);
        transform-origin: center center;
        transition: opacity ${SNAP_PREVIEW_FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
          transform ${SNAP_PREVIEW_FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .zone.zone--visible {
        opacity: 1;
        transform: scale(1);
      }
    </style>
    <div class="zone" id="zone"></div>
  `;
  return "data:text/html," + encodeURIComponent(html);
}

function snapZoneBounds(zone) {
  const { x, y, width, height } = zone.display.workArea;
  const halfW = Math.round(width / 2);
  const halfH = Math.round(height / 2);
  switch (zone.type) {
    case "top":
      return { x, y, width, height };
    case "left":
      return { x, y, width: halfW, height };
    case "right":
      return { x: x + halfW, y, width: width - halfW, height };
    case "top-left":
      return { x, y, width: halfW, height: halfH };
    case "top-right":
      return { x: x + halfW, y, width: width - halfW, height: halfH };
    default:
      return null;
  }
}

function ensureSnapPreviewWindow() {
  if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) return snapPreviewWindow;
  // Sized to the *whole primary display* up front, not to any particular
  // zone — see showSnapPreview for why: this window's own OS-level
  // bounds should essentially never change once created (resizing a
  // transparent window is what produces a visible flash, since DWM has
  // no valid composited content for the new size until the next repaint
  // lands). Which zone is actually showing, and where within this
  // window, is purely an in-page position from here on.
  const initialBounds = screen.getPrimaryDisplay().bounds;
  snapPreviewWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
  });
  // Click-through — this window only ever displays a preview rectangle,
  // it must never intercept the drag that's still happening in the real
  // window underneath it.
  snapPreviewWindow.setIgnoreMouseEvents(true);
  snapPreviewWindow.loadURL(snapPreviewHtml());
  // Shown exactly once, right here, and never hidden again for the rest
  // of the app's life (see showSnapPreview/hideSnapPreview — from here
  // on, "showing"/"hiding" the zone is purely the CSS opacity transition
  // on the .zone div, not the window itself). A hidden BrowserWindow
  // stops compositing entirely, so the very first frame after a later
  // show()/showInactive() call can lag behind — Chromium hasn't
  // re-rendered yet, so whatever DWM had cached for that window (which
  // can be genuinely blank/undefined content) gets presented for a
  // frame first. That's an actual flash no CSS transition can paper
  // over, since it happens *before* any of this window's own content is
  // involved. Showing it once here, at content-transparent/opacity:0,
  // long before any real drag, means that first-frame cost is paid at
  // startup where nothing is on screen to flash — never during a drag.
  snapPreviewWindow.showInactive();
  return snapPreviewWindow;
}

// Whether the .zone div's 'zone--visible' class is currently applied —
// tracked here rather than read back from the window, since the window
// itself is always "visible" now (see the comment above) and no longer
// says anything about whether a zone is actually showing.
let snapPreviewShown = false;

function setSnapPreviewVisibleClass(win, visible) {
  if (!win || win.isDestroyed()) return;
  const script = `
    (function () {
      var el = document.getElementById('zone');
      if (!el) return;
      el.classList[${visible ? "'add'" : "'remove'"}]('zone--visible');
    })();
  `;
  win.webContents.executeJavaScript(script).catch(() => {});
}

// Grazing a zone boundary for a single 'move' event during a real drag
// (the cursor briefly reads as "in no zone" right at the edge between
// two of them) used to hide the preview immediately, only to show it
// again a moment later — visually a hide/show pop rather than the zone
// just staying up. This debounce holds off actually starting the
// fade-out until the cursor has stayed out of every zone for a beat;
// showSnapPreview cancels it outright the moment a zone reappears.
const SNAP_PREVIEW_HIDE_DEBOUNCE_MS = 90;
let snapPreviewHideDebounceTimer = null;

function showSnapPreview(zone) {
  clearTimeout(snapPreviewHideDebounceTimer);
  snapPreviewHideDebounceTimer = null;

  const preview = ensureSnapPreviewWindow();

  // The window itself only ever gets resized when the drag has actually
  // moved to a *different display* — essentially never on a single
  // monitor, which is the common case. Which zone is showing, and where
  // within this window, is purely an in-page position from here (see
  // left/top/width/height below), so a plain zone-to-zone change never
  // touches the window's bounds at all.
  const displayBounds = zone.display.bounds;
  const current = preview.getBounds();
  const sameDisplay =
    current.x === displayBounds.x &&
    current.y === displayBounds.y &&
    current.width === displayBounds.width &&
    current.height === displayBounds.height;
  if (!sameDisplay) preview.setBounds(displayBounds);

  const zoneBounds = snapZoneBounds(zone);
  const left = zoneBounds.x - displayBounds.x + SNAP_PREVIEW_INSET;
  const top = zoneBounds.y - displayBounds.y + SNAP_PREVIEW_INSET;
  const width = zoneBounds.width - SNAP_PREVIEW_INSET * 2;
  const height = zoneBounds.height - SNAP_PREVIEW_INSET * 2;

  const alreadyShown = snapPreviewShown;
  snapPreviewShown = true;

  const script = alreadyShown
    ? // Already showing a zone (just switching which one is
      // highlighted) — reposition instantly, no fade involved at all.
      `
      (function () {
        var el = document.getElementById('zone');
        if (!el) return;
        el.style.left = '${left}px';
        el.style.top = '${top}px';
        el.style.width = '${width}px';
        el.style.height = '${height}px';
      })();
    `
    : // Newly appearing — position it first, then fade in. rAF so the
      // "start invisible" position and the "become visible" class
      // change land in different frames; without that gap there's
      // nothing for the transition to actually animate from.
      `
      (function () {
        var el = document.getElementById('zone');
        if (!el) return;
        el.style.left = '${left}px';
        el.style.top = '${top}px';
        el.style.width = '${width}px';
        el.style.height = '${height}px';
        requestAnimationFrame(function () {
          el.classList.add('zone--visible');
        });
      })();
    `;
  preview.webContents.executeJavaScript(script).catch(() => {});
}

function requestHideSnapPreview() {
  clearTimeout(snapPreviewHideDebounceTimer);
  snapPreviewHideDebounceTimer = setTimeout(() => {
    snapPreviewHideDebounceTimer = null;
    hideSnapPreview();
  }, SNAP_PREVIEW_HIDE_DEBOUNCE_MS);
}

// Just removes the CSS class — the window itself is never hidden (see
// ensureSnapPreviewWindow), so this is a plain, always-live CSS opacity
// transition playing out on screen, guaranteed to actually be visible as
// a fade-out rather than racing a win.hide() call to get there first.
function hideSnapPreview() {
  clearTimeout(snapPreviewHideDebounceTimer);
  snapPreviewHideDebounceTimer = null;
  if (!snapPreviewShown) return;
  snapPreviewShown = false;
  setSnapPreviewVisibleClass(snapPreviewWindow, false);
}

// Only ever called once per drag — the window's actual size/position is
// never touched mid-drag (see setupWindowSnap below for why: an earlier
// version resized on every zone change during the drag itself, calling
// setBounds while Windows' own native move loop was still actively
// driving the window, and the two fought each other — visually the
// window would briefly shrink, then get yanked back to its snapped size
// and stay stuck to the cursor until release). Whatever the window's
// bounds happen to be when this runs is just left as the native drag
// left them, unless a zone applies.
function finishSnapDrag() {
  clearTimeout(snapMoveTimer);
  clearInterval(snapPollTimer);
  snapPollTimer = null;
  if (snapTargetWindow && !snapTargetWindow.isDestroyed()) {
    if (snapPendingZone) {
      if (snapTargetWindow.isMaximized()) snapTargetWindow.unmaximize();
      // Only the *first* snap in a streak overwrites the size to restore
      // to later — snapping left, then top, then right without ever
      // letting go of a free size in between must all still restore back
      // to the one true original, not to whichever snap preceded this.
      if (!snapIsSnapped) snapFreeBounds = snapTargetWindow.getBounds();
      resizeSnapTarget(snapTargetWindow, snapZoneBounds(snapPendingZone));
      snapIsSnapped = true;
    } else if (snapIsSnapped && snapFreeBounds) {
      // Released away from any zone while the window was still snapped —
      // un-snap: restore the original size, centered at the top of the
      // display (see unsnapPosition) rather than wherever the native
      // drag happened to leave its top-left corner — every zone starts
      // flush with the display's left edge, so that always put the
      // restored window in the top-left corner regardless of which edge
      // it was dragged away from.
      resizeSnapTarget(snapTargetWindow, {
        ...unsnapPosition(snapTargetWindow, snapFreeBounds),
        width: snapFreeBounds.width,
        height: snapFreeBounds.height,
      });
      snapIsSnapped = false;
      snapFreeBounds = null;
    }
  }
  snapPendingZone = null;
  snapMoveStreak = 0;
  snapActiveZoneType = null;
  hideSnapPreview();
}

function setupWindowSnap(win) {
  win.on("move", () => {
    if (Date.now() < snapIgnoreMoveUntil) return;
    snapMoveStreak += 1;
    clearTimeout(snapMoveTimer);
    snapMoveTimer = setTimeout(finishSnapDrag, SNAP_DRAG_END_MS);

    if (snapMoveStreak < SNAP_ARM_MOVES) return;
    snapTargetWindow = win;
    // Polling for the real drag-end (see the SNAP_POLL_MS comment above)
    // starts the moment a drag is confirmed armed, not on every 'move'
    // event — setInterval is idempotent-guarded here so repeated arming
    // checks while already polling don't stack up multiple intervals.
    if (mouseState && !snapPollTimer) {
      snapPollTimer = setInterval(() => {
        if (!mouseState.isLeftButtonDown()) finishSnapDrag();
      }, SNAP_POLL_MS);
    }
    const zone = getSnapZone(screen.getCursorScreenPoint());
    snapPendingZone = zone;
    const zoneType = zone?.type ?? null;
    // Skip re-doing any of this while the cursor just sits inside the
    // same zone it was already in last 'move' event — that's the common
    // case (this fires on every pixel of movement during a drag) and
    // redoing setBounds/show on an already-correct, already-visible
    // window is exactly what was producing the flicker.
    if (zoneType === snapActiveZoneType) return;
    snapActiveZoneType = zoneType;
    if (zone) {
      showSnapPreview(zone);
    } else {
      requestHideSnapPreview();
      // Tried restoring the pre-snap size right here, the instant the
      // drag leaves the zone, instead of waiting for release — even as a
      // single, one-shot, ignore-window-guarded setBounds call, it was
      // intermittent (reliable on a fast drag, prone to leaving the drag
      // stuck/desynced on a slow one). That's the signature of a real
      // race, not a logic bug: Chromium's own app-region:drag apparently
      // drives this frameless window's position through a different path
      // than our setBounds() call, and the two were competing for
      // authority over it mid-drag. Reverted — see finishSnapDrag's
      // comment for why every other resize in this file waits for
      // release, and this is no exception after all.
    }
  });
}

function teardownWindowSnap() {
  clearTimeout(snapMoveTimer);
  clearInterval(snapPollTimer);
  snapPollTimer = null;
  clearTimeout(snapPreviewHideDebounceTimer);
  snapPreviewHideDebounceTimer = null;
  snapPreviewShown = false;
  snapPendingZone = null;
  snapMoveStreak = 0;
  snapActiveZoneType = null;
  snapTargetWindow = null;
  snapIsSnapped = false;
  snapFreeBounds = null;
  snapIgnoreMoveUntil = 0;
  if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) snapPreviewWindow.destroy();
  snapPreviewWindow = null;
}

// Secondary drag-end signal, kept as a backstop for platforms/builds where
// mouseState isn't available (see the comment above SNAP_POLL_MS) — a
// renderer-reported mouseup, tested and confirmed to *not* actually fire
// during a real title-bar drag on Windows (Chromium swallows it), but
// still worth keeping for the ordinary case of clicking without dragging
// far enough to arm, and as a fallback on other platforms. Only acts if a
// drag was actually armed, so this is a harmless no-op the rest of the
// time.
ipcMain.on("disc:mouse-up", () => {
  if (snapMoveStreak >= SNAP_ARM_MOVES) finishSnapDrag();
});

// Reported by the renderer whenever the active theme's accent color is
// known/changes (see setSnapAccentColor in preload.cjs) — only it can
// read the real computed CSS value. Reloading the already-created
// preview window's content on the fly means a mid-session theme switch
// doesn't need a restart to pick up the new color, same as most other
// live-appliable theme changes in Disc.
ipcMain.on("disc:set-snap-accent-color", (_event, hex) => {
  const rgb = hexToRgbString(hex);
  if (!rgb) return;
  snapAccentRgb = rgb;
  if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) {
    snapPreviewWindow.loadURL(snapPreviewHtml());
    // The fresh page starts back at "no zone shown" (opacity: 0, no
    // class) regardless of whatever was tracked before the reload — keep
    // that bookkeeping in sync so a zone right after a theme change is
    // treated as newly appearing (fades in) rather than "already shown"
    // (which would just reposition an invisible div with no fade at all).
    snapPreviewShown = false;
  }
});

// The losing instance already called app.quit() above — this just makes
// sure it never gets as far as opening a second window in the meantime.
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

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

// "Maximize" deliberately never calls the real win.maximize() — it just
// snaps to the full-work-area "top" zone via the exact same machinery a
// drag-to-the-top-edge uses (snapIsSnapped/snapFreeBounds/
// resizeSnapTarget/snapZoneBounds, all defined above), so this button is
// really just "drag to the top edge and let go" triggered by a click
// instead of a drag. That's not just for consistency: a genuinely
// WS_MAXIMIZE'd frameless window turned out not to cooperate with this
// app's custom app-region:drag dragging at all — a couple of earlier
// attempts (see git history) to un-maximize a real OS-maximized window
// right as a drag started kept racing the native move loop the same way
// mid-drag setBounds calls always have in this file, sometimes leaving
// the window stuck. Never actually entering real WS_MAXIMIZE sidesteps
// that entirely, and reuses drag-to-zone logic that's already proven
// solid — including, for free, restoring on drag-away exactly like any
// other snap zone.
ipcMain.handle("disc:window-toggle-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (snapIsSnapped) {
    // Same "un-snap" as dragging away from any snap zone (see
    // finishSnapDrag), just triggered by the button instead of a drag —
    // restore the pre-snap size, centered horizontally (see
    // unsnapPosition).
    const current = mainWindow.getBounds();
    const size = {
      width: snapFreeBounds?.width ?? current.width,
      height: snapFreeBounds?.height ?? current.height,
    };
    resizeSnapTarget(mainWindow, { ...unsnapPosition(mainWindow, size), ...size });
    snapIsSnapped = false;
    snapFreeBounds = null;
  } else {
    snapFreeBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(snapFreeBounds);
    resizeSnapTarget(mainWindow, snapZoneBounds({ type: "top", display }));
    snapIsSnapped = true;
  }
  mainWindow.webContents.send("disc:window-maximized-changed", snapIsSnapped);
  return snapIsSnapped;
});

ipcMain.handle("disc:window-is-maximized", () => {
  return snapIsSnapped;
});

ipcMain.on("disc:window-close", () => {
  mainWindow?.close();
});

// A native multi-select file picker for adding mp3s — a reliable
// alternative to drag-and-drop, since OS-level DND can get intercepted by
// third-party window-manager tools (WindHawk mods and similar) in ways
// Disc has no visibility into or control over.
// Native multi-select folder picker — the sidebar's "+" uses this so a whole
// set of folders can be added in one go.
ipcMain.handle("disc:choose-folders", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"],
    title: "Add music folders",
  });
  if (result.canceled) return [];
  return result.filePaths;
});

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
        // Marked-section clips (a feature this build no longer has, but an older
        // Disc may have left behind) live right next
        // to their source track, inside a folder a normal scan would
        // otherwise happily walk into and list as real library tracks.
        if (entry.name === SECTIONS_DIR_NAME || entry.name === SYNC_DIR_NAME) continue;
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

// Case-insensitive on Windows (the only platform this app ships for), a
// straight string compare everywhere else — used below to catch "this
// drop target *is* where the file already lives" before it ever reaches
// the rename-on-collision loop.
function samePath(a, b) {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

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

    // Dragging a track back into the very folder it's already sitting in
    // isn't an import at all — without this check, the collision loop
    // below sees a file already at the destination (itself) and
    // "resolves" that the same way it would a genuine naming collision:
    // by copying the source onto a new "<name> (1).ext", producing a
    // pointless duplicate of the exact same file.
    if (samePath(sourcePath, path.join(folderPath, baseName))) {
      skipped.push(sourcePath);
      continue;
    }

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
