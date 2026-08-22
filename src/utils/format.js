export function formatSize(bytes) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function stripExtension(fileName) {
  // Generic — strips whatever the extension is (mp3, wav, mov, ...)
  // rather than listing specific ones, so display names never show a
  // trailing extension regardless of file type.
  return fileName.replace(/\.[^./\\]+$/, "");
}
