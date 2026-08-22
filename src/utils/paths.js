// Builds the disc-media:// URL <audio> streams a track from directly (see
// the protocol.handle registration in electron/main.js) — encodeURIComponent
// on the whole path keeps separators, drive-letter colons, spaces, and
// unicode filenames intact through the URL round-trip; main.js reverses it
// with decodeURIComponent before touching the filesystem.
export function toMediaUrl(filePath) {
  return `disc-media://play/${encodeURIComponent(filePath)}`;
}

// Cross-platform-ish prefix check: is `filePath` located inside `dirPath`?
// Paths on Windows are case-insensitive and can mix slash styles, so both
// are normalized before comparing.
export function isUnderDirectory(filePath, dirPath) {
  if (!filePath || !dirPath) return false;
  const normalize = (p) => p.replace(/\\/g, "/").toLowerCase();
  const file = normalize(filePath);
  let dir = normalize(dirPath);
  if (!dir.endsWith("/")) dir += "/";
  return file.startsWith(dir);
}
