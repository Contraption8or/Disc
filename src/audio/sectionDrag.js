// Prepares a marked section as its own standalone MP3 clip, so it can be
// dragged out to Premiere as just that section rather than the whole
// track. Electron's native drag-out requires a real file on disk and must
// be started synchronously from the browser's dragstart event (see the IPC
// handler in electron/main.js), so this can't render the clip live at drag
// time — it has to be prepared ahead of the actual drag gesture and
// cached, then dragstart just hands off the already-written file.
//
// The file itself lives permanently in a ".disc-sections" folder next to
// the source track (see sectionsDirFor in electron/main.js) — it used to
// live in the OS temp directory and get wiped on every launch, which meant
// a clip already sitting in a Premiere project would go offline as soon as
// Disc (or the OS) cleared temp. A real project timeline expects that file
// to keep existing.
import { convertToMp3 } from "./audioConverter.js";

// Keyed by track path + the section's exact range, not the section's id —
// if a section's start/end ever changed in place the id would still match
// a stale clip. Holds { path, promise }: `path` is null until the render
// finishes, `promise` lets concurrent callers (e.g. hover firing twice)
// share one in-flight job instead of encoding the same clip twice.
const cache = new Map();

function cacheKey(track, section) {
  return `${track.filePath}::${section.startFraction}::${section.endFraction}`;
}

// Named by the section's own id, not its position in the list — a
// position-based name would collide or go stale the moment a different
// section gets deleted and everything after it shifts down. Takes a raw
// file path (rather than a track object) so a caller that only has a
// track id — which, everywhere in Disc, *is* its file path — can still
// compute the same name without needing the full track record.
function sectionFileName(filePath, sectionId) {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const fileName = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const base = fileName.replace(/\.[^./\\]+$/, "");
  const raw = `${base} [${sectionId}].mp3`;
  // Strip characters Windows filenames can't contain — track names are
  // otherwise free-form, and this file has to actually be writable.
  return raw.replace(/[\\/:*?"<>|]/g, "_");
}

// Returns the cached file path if this exact section has already been
// rendered (this session), or null if it hasn't (or is still in progress).
export function getSectionDragPath(track, section) {
  return cache.get(cacheKey(track, section))?.path || null;
}

// Kicks off (or reuses) the render. Safe to call repeatedly — e.g. once on
// hover and again on mousedown — since it's cached per exact range. Checks
// disk first: since these files now persist across restarts, a section
// prepared in an earlier session doesn't need to be decoded and re-encoded
// all over again just because the in-memory cache is empty on a fresh
// launch.
export function prepareSectionDrag(track, section) {
  const key = cacheKey(track, section);
  const existing = cache.get(key);
  if (existing) return existing.promise;

  const fileName = sectionFileName(track.filePath, section.id);
  const entry = { path: null, promise: null };
  entry.promise = (async () => {
    const existsResult = await window.disc.sectionAudioExists(track.filePath, fileName);
    if (existsResult?.exists) {
      entry.path = existsResult.path;
      return existsResult.path;
    }

    const { mp3Bytes } = await convertToMp3(track.filePath, {
      startFraction: section.startFraction,
      endFraction: section.endFraction,
    });
    const result = await window.disc.writeSectionAudio(track.filePath, fileName, mp3Bytes);
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

// Removes a section's clip from disk (if it was ever rendered) — called
// when the section itself is deleted, so .disc-sections doesn't just
// accumulate orphaned files forever. Takes the track's file path directly
// (a track id *is* its file path everywhere in Disc) since the caller —
// the track-sections deletion handler — only has the id and the section
// id, not a full track/section record.
export function deleteSectionDrag(trackFilePath, sectionId) {
  return window.disc
    .deleteSectionAudio(trackFilePath, sectionFileName(trackFilePath, sectionId))
    .catch(() => {});
}
