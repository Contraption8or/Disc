// Decoded peaks are cached in memory per track id so scrolling, re-mounting,
// or switching folders back and forth doesn't re-decode the same file.
const peaksCache = new Map();
const inFlight = new Map();

// Reuse one AudioContext for every decode. Creating/closing a new one per
// track is both slow and, with a big library, can hit Chromium's hard cap
// on concurrently-open AudioContexts — which is a real source of the "lots
// of files = laggy/broken" symptom.
let sharedAudioCtx = null;
export function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

// Cap how many files get read + decoded at once. Without this, scrolling
// fast through a big library can kick off dozens of simultaneous decodes.
// Normal browsing always stays at the conservative default — this is only
// ever raised temporarily, for the duration of an explicit bulk preload
// run (see src/audio/preload.js), then restored.
export const DEFAULT_MAX_CONCURRENT_DECODES = 3;
let maxConcurrentDecodes = DEFAULT_MAX_CONCURRENT_DECODES;
let activeDecodes = 0;
const waitQueue = [];

export function getMaxConcurrentDecodes() {
  return maxConcurrentDecodes;
}

export function setMaxConcurrentDecodes(n) {
  maxConcurrentDecodes = Math.max(1, Math.min(16, Math.round(n)));
  // If the cap just went up, immediately let already-queued waiters
  // through up to the new limit, rather than waiting for something else
  // to finish first and trigger a releaseSlot.
  while (activeDecodes < maxConcurrentDecodes && waitQueue.length > 0) {
    activeDecodes += 1;
    waitQueue.shift()();
  }
}

export function acquireSlot() {
  if (activeDecodes < maxConcurrentDecodes) {
    activeDecodes += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

export function releaseSlot() {
  activeDecodes -= 1;
  const next = waitQueue.shift();
  if (next) {
    activeDecodes += 1;
    next();
  }
}

export function getCachedWaveform(trackId) {
  return peaksCache.get(trackId) || null;
}

export function computeWaveform(track, bucketCount = 360) {
  if (peaksCache.has(track.id)) {
    return Promise.resolve(peaksCache.get(track.id));
  }
  if (inFlight.has(track.id)) {
    return inFlight.get(track.id);
  }
  if (!window.disc) return Promise.resolve(null);

  const promise = (async () => {
    await acquireSlot();
    try {
      const bytes = await window.disc.readAudioFile(track.filePath);
      if (!bytes) return null;

      const audioCtx = getAudioContext();
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const samplesPerBucket = Math.max(
        1,
        Math.floor(channelData.length / bucketCount)
      );

      const peaks = new Array(bucketCount);
      for (let i = 0; i < bucketCount; i++) {
        const start = i * samplesPerBucket;
        const end = Math.min(start + samplesPerBucket, channelData.length);
        let max = 0;
        for (let j = start; j < end; j++) {
          const v = Math.abs(channelData[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }

      const result = { peaks, duration: audioBuffer.duration };
      peaksCache.set(track.id, result);
      return result;
    } catch {
      return null;
    } finally {
      inFlight.delete(track.id);
      releaseSlot();
    }
  })();

  inFlight.set(track.id, promise);
  return promise;
}
