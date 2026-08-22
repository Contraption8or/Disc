import { computeWaveform, getCachedWaveform, getMaxConcurrentDecodes } from "./waveform.js";
import { computeAnalysis, getCachedAnalysis } from "./analysis.js";

export function getPreloadCandidates(tracks) {
  return tracks.filter(
    (t) =>
      t.fileType !== "video" &&
      (!getCachedWaveform(t.id) || !getCachedAnalysis(t.id))
  );
}

// Walks every candidate track, decoding its waveform and running BPM/Key
// analysis (both cache themselves, same as everywhere else in Disc — this
// is just doing eagerly, in bulk, what would otherwise happen lazily as
// tracks get scrolled past or opened). Video tracks and already-cached
// tracks are skipped. Reports progress via onProgress after every track,
// and can be stopped early via shouldCancel.
export async function preloadLibrary(tracks, { onProgress, shouldCancel } = {}) {
  const candidates = getPreloadCandidates(tracks);
  const total = candidates.length;
  let completed = 0;

  onProgress?.({ completed: 0, total });

  if (total === 0) {
    return { total: 0, completed: 0, cancelled: false };
  }

  // Worker "lanes" pulling work — the real throttle is the shared slot
  // mechanism in waveform.js (acquireSlot/releaseSlot), but each lane can
  // only have one track in flight at a time, and each track needs two
  // sequential slot acquisitions (waveform, then analysis). A fixed lane
  // count would silently cap the benefit of a higher concurrency setting
  // once it exceeded that count, so this scales with the current setting
  // instead — comfortably enough lanes to keep every slot fed.
  const poolSize = Math.max(4, getMaxConcurrentDecodes() * 2);

  let index = 0;
  async function worker() {
    while (index < candidates.length) {
      if (shouldCancel?.()) return;
      const track = candidates[index++];
      try {
        await computeWaveform(track);
        if (shouldCancel?.()) return;
        await computeAnalysis(track);
      } catch {
        // Best-effort — a single unreadable/corrupt file shouldn't stop
        // the rest of the library from loading.
      }
      completed += 1;
      onProgress?.({ completed, total });
    }
  }

  await Promise.all(Array.from({ length: poolSize }, worker));

  return { total, completed, cancelled: Boolean(shouldCancel?.()) };
}
