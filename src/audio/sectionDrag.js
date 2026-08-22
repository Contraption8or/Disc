// Prepares a marked section as its own standalone MP3 clip, so it can be
// dragged out to Premiere as just that section rather than the whole
// track. Electron's native drag-out requires a real file on disk and
// must be started synchronously from the browser's dragstart event (see
// the IPC handler in electron/main.js), so this can't render the clip
// live at drag time — it has to be prepared ahead of the actual drag
// gesture and cached, then dragstart just hands off the already-written
// temp file.
import { convertToMp3 } from "./audioConverter.js";

// Keyed by track path + the section's exact range, not the section's id —
// if a section's start/end ever changed in place the id would still
// match a stale clip. Holds { path, promise }: `path` is null until the
// render finishes, `promise` lets concurrent callers (e.g. hover firing
// twice) share one in-flight job instead of encoding the same clip twice.
const cache = new Map();

function cacheKey(track, section) {
  return `${track.filePath}::${section.startFraction}::${section.endFraction}`;
}

function sectionFileName(track, section, index) {
  const base = track.fileName.replace(/\.[^./\\]+$/, "");
  const raw = `${base} (section ${index + 1}).mp3`;
  // Strip characters Windows filenames can't contain — track names are
  // otherwise free-form, and this file has to actually be writable.
  return raw.replace(/[\\/:*?"<>|]/g, "_");
}

// Returns the cached temp file path if this exact section has already
// been rendered, or null if it hasn't (or is still in progress).
export function getSectionDragPath(track, section) {
  return cache.get(cacheKey(track, section))?.path || null;
}

// Kicks off (or reuses) the render. Safe to call repeatedly — e.g. once
// on hover and again on mousedown — since it's cached per exact range.
export function prepareSectionDrag(track, section, index) {
  const key = cacheKey(track, section);
  const existing = cache.get(key);
  if (existing) return existing.promise;

  const entry = { path: null, promise: null };
  entry.promise = (async () => {
    const { mp3Bytes } = await convertToMp3(track.filePath, {
      startFraction: section.startFraction,
      endFraction: section.endFraction,
    });
    const result = await window.disc.writeTempAudio(
      sectionFileName(track, section, index),
      mp3Bytes
    );
    if (!result?.success) {
      cache.delete(key); // let a later attempt retry instead of being stuck on a failed entry
      throw new Error(result?.error || "Couldn't prepare this section for drag");
    }
    entry.path = result.path;
    return result.path;
  })();
  cache.set(key, entry);
  return entry.promise;
}
