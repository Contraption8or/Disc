import { isUnderDirectory } from "../utils/paths.js";

function relativeSlash(filePath, rootPath) {
  const norm = (p) => p.replace(/\\/g, "/");
  const file = norm(filePath);
  let root = norm(rootPath);
  if (!root.endsWith("/")) root += "/";
  return file.slice(root.length);
}

// Same reasoning as trackKey.js: a linked folder's absolute path is
// worthless across two machines with different drive letters/roots. When
// the linked directory lives inside the shared music root, this derives a
// path relative to it instead — portable, and (in Phase 3) resolvable on
// any machine by joining it with *that* machine's own music folder path.
//
// Returns null when the folder lives outside the shared root (some
// personal, unsynced location) — callers should send no link event at all
// in that case rather than an absolute path nobody else can use. The
// receiving device ends up with the folder entry itself (name, color,
// position) but unlinked, which is the honest outcome: the actual files
// genuinely aren't available to share.
export function getRelativeFolderPath(folderPath, musicFolderPath) {
  if (!folderPath || !musicFolderPath) return null;
  if (folderPath === musicFolderPath) return "";
  if (!isUnderDirectory(folderPath, musicFolderPath)) return null;
  return relativeSlash(folderPath, musicFolderPath);
}

// The Phase 3 counterpart — resolves a shared relativePath back into an
// absolute path on *this* machine, by joining it with this device's own
// music folder path rather than trusting the sending device's absolute
// path (which almost certainly points somewhere different here).
export function resolveFolderPath(relativePath, musicFolderPath) {
  if (relativePath == null || !musicFolderPath) return null;
  if (relativePath === "") return musicFolderPath;
  const sep = musicFolderPath.includes("\\") ? "\\" : "/";
  const normalizedRel = relativePath.replace(/\//g, sep);
  return musicFolderPath.replace(/[/\\]+$/, "") + sep + normalizedRel;
}
