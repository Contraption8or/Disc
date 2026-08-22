export function downsamplePeaks(peaks, targetCount) {
  if (!peaks || peaks.length === 0 || targetCount <= 0) return [];
  if (targetCount >= peaks.length) return peaks;

  const bucketSize = peaks.length / targetCount;
  const result = new Array(targetCount);
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let max = 0;
    for (let j = start; j < end; j++) {
      if (peaks[j] > max) max = peaks[j];
    }
    result[i] = max;
  }
  return result;
}
