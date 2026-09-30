import { isUnderDirectory } from "../utils/paths.js";

function relativeSlash(filePath, rootPath) {
  const norm = (p) => p.replace(/\\/g, "/");
  const file = norm(filePath);
  let root = norm(rootPath);
  if (!root.endsWith("/")) root += "/";
  return file.slice(root.length);
}

// Track ids are absolute filesystem paths (see the scanner in
// electron/main.js) — worthless as a shared-event identity since your
// path and Peter's won't share a drive letter or root. This derives a key
// relative to whichever shared root the track lives under instead, which
// is stable across machines as long as both are pointed at the same
// synced folder tree (true by construction for the main music folder,
// which is the whole premise of Studio Sync).
//
// Honest limitation: a linked custom folder's key is namespaced by its
// *name*, not a synced id (custom folder ids are per-device and never
// match across machines) — renaming a linked folder on one machine without
// the rename itself being synced will orphan that folder's existing
// events. Fine for the main music folder (the primary shared case this
// was built for); worth revisiting if linked-folder sharing becomes a
// real need.
export function getTrackKey(filePath, { musicFolderPath, customFolders }) {
  if (!filePath) return null;
  if (musicFolderPath && isUnderDirectory(filePath, musicFolderPath)) {
    return `main/${relativeSlash(filePath, musicFolderPath)}`;
  }
  const folder = (customFolders || []).find(
    (f) => f.folderPath && isUnderDirectory(filePath, f.folderPath)
  );
  if (folder) {
    return `folder:${folder.name}/${relativeSlash(filePath, folder.folderPath)}`;
  }
  return null;
}

function joinPath(rootPath, relativePart) {
  const sep = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRel = relativePart.replace(/\//g, sep);
  return rootPath.replace(/[/\\]+$/, "") + sep + normalizedRel;
}

// The Phase 3 counterpart to getTrackKey — turns a shared trackKey back
// into *this* machine's absolute path, used when applying merged state.
// A "main/..." key resolves against this device's own musicFolderPath
// (which is the whole point — two machines with different roots still
// agree on the relative part). A "folder:Name/..." key resolves against
// whichever local customFolder currently has that exact name and is
// actually linked; if none matches (the folder doesn't exist locally yet,
// isn't linked, or was renamed — see the honest limitation noted in
// folderPath.js), this returns null and the caller should simply drop
// that piece of merged data rather than guess.
export function resolveTrackKey(trackKey, { musicFolderPath, customFolders }) {
  if (!trackKey) return null;
  if (trackKey.startsWith("main/")) {
    if (!musicFolderPath) return null;
    return joinPath(musicFolderPath, trackKey.slice(5));
  }
  if (trackKey.startsWith("folder:")) {
    const rest = trackKey.slice(7);
    const slashIndex = rest.indexOf("/");
    const folderName = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const relativePart = slashIndex === -1 ? "" : rest.slice(slashIndex + 1);
    const folder = (customFolders || []).find(
      (f) => f.folderPath && f.name === folderName
    );
    if (!folder || !relativePart) return null;
    return joinPath(folder.folderPath, relativePart);
  }
  return null;
}
