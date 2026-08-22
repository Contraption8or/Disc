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
