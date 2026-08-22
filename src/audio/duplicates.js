import { getCachedWaveform } from "./waveform.js";

// Peaks arrays are always the same fixed length (see waveform.js), so no
// alignment/resampling is needed before comparing them directly.
function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

const DURATION_TOLERANCE_SECONDS = 2;
const SHAPE_SIMILARITY_THRESHOLD = 0.985;

// Returns a Set of track ids that appear to have at least one duplicate
// somewhere in the given list. Two passes:
//  1. Exact file-size match — cheap, catches byte-identical copies,
//     works for every track regardless of whether it's been opened yet.
//  2. Waveform-shape similarity — catches the same song at a different
//     bitrate/filename, but only among tracks whose waveform has already
//     been decoded (same lazy-decode design as everywhere else in Disc,
//     so this isn't a full-library scan happening silently).
export function findDuplicateIds(allTracks) {
  const dupes = new Set();

  const bySize = new Map();
  allTracks.forEach((t) => {
    if (!t.sizeBytes) return;
    const list = bySize.get(t.sizeBytes) || [];
    list.push(t);
    bySize.set(t.sizeBytes, list);
  });
  bySize.forEach((list) => {
    if (list.length > 1) list.forEach((t) => dupes.add(t.id));
  });

  const withWaveform = allTracks
    .map((t) => ({ t, w: getCachedWaveform(t.id) }))
    .filter((x) => x.w);

  for (let i = 0; i < withWaveform.length; i++) {
    for (let j = i + 1; j < withWaveform.length; j++) {
      const a = withWaveform[i];
      const b = withWaveform[j];
      if (dupes.has(a.t.id) && dupes.has(b.t.id)) continue;
      if (Math.abs(a.w.duration - b.w.duration) > DURATION_TOLERANCE_SECONDS) continue;
      if (cosineSimilarity(a.w.peaks, b.w.peaks) >= SHAPE_SIMILARITY_THRESHOLD) {
        dupes.add(a.t.id);
        dupes.add(b.t.id);
      }
    }
  }

  return dupes;
}
