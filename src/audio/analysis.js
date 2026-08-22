import { getAudioContext, acquireSlot, releaseSlot } from "./waveform.js";

const analysisCache = new Map();
const inFlight = new Map();

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

// Krumhansl-Kessler key profiles — how strongly each scale degree "belongs"
// to a major/minor key, relative to the tonic (index 0).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function getCachedAnalysis(trackId) {
  return analysisCache.get(trackId) || null;
}

export function computeAnalysis(track) {
  if (analysisCache.has(track.id)) return Promise.resolve(analysisCache.get(track.id));
  if (inFlight.has(track.id)) return inFlight.get(track.id);
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

      const bpm = estimateBpm(audioBuffer);
      const keyResult = estimateKey(audioBuffer);
      const { brightness, energy } = estimateBrightnessAndEnergy(audioBuffer);
      const result = {
        bpm,
        key: keyResult?.key ?? null,
        chroma: keyResult?.chroma ?? null,
        brightness,
        energy,
      };
      analysisCache.set(track.id, result);
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

// A lightweight, honest heuristic for two "vibe" dimensions — not genre
// classification (that needs a trained model, which isn't something we
// have here), just two real, standard, cheap-to-compute audio features:
// zero-crossing rate as a brightness proxy (more high-frequency content
// crosses zero more often) and RMS as a loudness/energy proxy. Values are
// squashed into a rough 0–1 range purely so tracks can be compared
// against each other — they're not calibrated to any absolute scale.
function estimateBrightnessAndEnergy(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = averageChannels(audioBuffer);
  const duration = audioBuffer.duration;

  const windowSeconds = Math.min(20, duration);
  const startSample = Math.floor(
    Math.max(0, duration / 2 - windowSeconds / 2) * sampleRate
  );
  const endSample = Math.min(
    channelData.length,
    startSample + Math.floor(windowSeconds * sampleRate)
  );
  const samples = channelData.subarray(startSample, endSample);
  if (samples.length < sampleRate * 0.5) return { brightness: 0.5, energy: 0.5 };

  let sumSquares = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
    if (i > 0 && samples[i] >= 0 !== samples[i - 1] >= 0) zeroCrossings++;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const zcr = zeroCrossings / samples.length;

  return {
    energy: Math.min(1, rms * 6),
    brightness: Math.min(1, zcr * 8),
  };
}

function averageChannels(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
  const len = audioBuffer.length;
  const result = new Float32Array(len);
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    result[i] = sum / channels.length;
  }
  return result;
}

// Tempo via autocorrelation of an onset/novelty curve — a standard,
// lightweight approach: build an energy envelope, take positive-only
// differences (onset strength), then find the lag that best repeats.
function estimateBpm(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = averageChannels(audioBuffer);

  const skipSeconds = Math.min(5, audioBuffer.duration * 0.1);
  const startSample = Math.floor(skipSeconds * sampleRate);
  const maxAnalysisSeconds = 90;
  const endSample = Math.min(
    channelData.length,
    startSample + Math.floor(maxAnalysisSeconds * sampleRate)
  );
  if (endSample - startSample < sampleRate) return null; // too short to analyze

  const hop = 512;
  const envelope = [];
  for (let i = startSample; i < endSample; i += hop) {
    const end = Math.min(i + hop, endSample);
    let sum = 0;
    for (let j = i; j < end; j++) sum += channelData[j] * channelData[j];
    envelope.push(Math.sqrt(sum / (end - i)));
  }

  const novelty = new Array(envelope.length).fill(0);
  for (let i = 1; i < envelope.length; i++) {
    const diff = envelope[i] - envelope[i - 1];
    novelty[i] = diff > 0 ? diff : 0;
  }

  const framesPerSecond = sampleRate / hop;
  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * framesPerSecond));
  const maxLag = Math.min(novelty.length - 1, Math.ceil((60 / minBpm) * framesPerSecond));

  const scores = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < novelty.length; i++) {
      score += novelty[i] * novelty[i + lag];
    }
    scores[lag] = score;
  }

  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (scores[lag] > bestScore) {
      bestScore = scores[lag];
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return null;

  // Raw autocorrelation reliably finds *a* repeating period, but a true
  // tempo's octave (half/double speed) and triplet-feel neighbors (2/3,
  // 3/2 the lag) repeat the same onset pattern just as strongly — often
  // even more strongly, since a kick-and-snare pattern at 120 BPM also
  // "repeats" at 60 and 240. This is the single most common failure mode
  // of naive autocorrelation tempo detectors. Weighting each candidate by
  // how plausible its resulting BPM actually is (most music sits roughly
  // 90-150 BPM — a soft tie-breaker, not a hard cutoff, so genuinely slow
  // or fast tracks still win when their raw score is clearly stronger)
  // resolves ties in favor of the musically likely answer instead of
  // whichever octave happened to score a few percent higher.
  function tempoPrior(bpm) {
    const center = 120;
    const width = 55;
    return Math.exp(-((bpm - center) ** 2) / (2 * width * width));
  }
  function weightedScoreAt(lag) {
    if (lag < minLag || lag > maxLag) return -Infinity;
    const bpm = (60 * framesPerSecond) / lag;
    return scores[lag] * (0.5 + 0.5 * tempoPrior(bpm));
  }

  const candidateLags = [
    bestLag,
    bestLag * 2,
    Math.round(bestLag / 2),
    Math.round((bestLag * 3) / 2),
    Math.round((bestLag * 2) / 3),
  ];
  let chosenLag = bestLag;
  let chosenWeightedScore = -Infinity;
  for (const lag of candidateLags) {
    const s = weightedScoreAt(lag);
    if (s > chosenWeightedScore) {
      chosenWeightedScore = s;
      chosenLag = lag;
    }
  }

  // Parabolic interpolation around the winning lag for sub-frame
  // precision — the lag grid alone quantizes BPM more coarsely than it
  // needs to (a whole-frame step is several BPM wide at typical tempos),
  // and a real peak usually sits slightly off-grid.
  const y0 = chosenLag - 1 >= minLag ? scores[chosenLag - 1] : scores[chosenLag];
  const y1 = scores[chosenLag];
  const y2 = chosenLag + 1 <= maxLag ? scores[chosenLag + 1] : scores[chosenLag];
  const denom = y0 - 2 * y1 + y2;
  const offset = denom !== 0 ? Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / denom)) : 0;

  return Math.round((60 * framesPerSecond) / (chosenLag + offset));
}

// Single-frequency magnitude via the Goertzel algorithm — cheaper than a
// full FFT when we only care about ~48 specific target frequencies (one
// per semitone across 4 octaves) rather than the whole spectrum.
function goertzelMagnitude(samples, sampleRate, targetFreq) {
  const n = samples.length;
  const k = Math.round((n * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / n;
  const cosine = Math.cos(omega);
  const coeff = 2 * cosine;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * cosine;
  const imag = s2 * Math.sin(omega);
  return Math.sqrt(real * real + imag * imag);
}

// Reduces spectral leakage — without it, energy from a strong note bleeds
// into neighboring semitone bins, which is especially damaging over a
// short ~7s analysis window where there's little data for that leakage to
// average out over.
function applyHannWindow(samples) {
  const n = samples.length;
  const windowed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    windowed[i] = samples[i] * w;
  }
  return windowed;
}

function pearsonCorrelation(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 0 : num / denom;
}

// Best-effort key detection: build a 12-bin chroma vector from several
// windows spread across the song (not just one short clip — a single
// window can get dominated by whatever instrumentation happens to be
// playing right there, like an intro), then correlate the averaged
// chroma against every major/minor key profile (Krumhansl-Schmuckler)
// and take the best match. This is a real, standard technique, but
// Goertzel chroma from a handful of windows is still noisier than a full
// chromagram — treat the result as a starting point, not gospel.
function estimateKey(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = averageChannels(audioBuffer);
  const duration = audioBuffer.duration;

  const windowSeconds = 7;
  if (duration <= windowSeconds + 2) {
    // Very short clip — just use what's there, minus a tiny fade margin.
    const margin = Math.min(1, duration * 0.1);
    const windows = [[margin, Math.max(0.5, duration - margin * 2)]];
    return correlateKeyFromWindows(channelData, sampleRate, windows);
  }
  // Sample around the 20%, 50%, and 80% marks — spread across verse/
  // chorus/bridge-ish territory rather than clustering near the intro.
  const positions = [0.2, 0.5, 0.8];
  const windows = positions
    .map((p) => {
      const center = duration * p;
      const start = Math.max(0, center - windowSeconds / 2);
      const length = Math.min(windowSeconds, duration - start);
      return [start, length];
    })
    .filter(([, length]) => length > 1);

  if (windows.length === 0) return null;
  return correlateKeyFromWindows(channelData, sampleRate, windows);
}

function correlateKeyFromWindows(channelData, sampleRate, windows) {
  const chroma = new Array(12).fill(0);

  for (const [startSeconds, lengthSeconds] of windows) {
    const startSample = Math.floor(startSeconds * sampleRate);
    const windowLength = Math.floor(lengthSeconds * sampleRate);
    const samples = channelData.subarray(startSample, startSample + windowLength);
    if (samples.length < sampleRate * 0.5) continue;
    const windowed = applyHannWindow(samples);

    // MIDI notes C2 (36) through B5 (83) — a reasonable musical range.
    for (let midi = 36; midi <= 83; midi++) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      let magnitude = goertzelMagnitude(windowed, sampleRate, freq);
      // Fold in the note's own overtones (2nd, 3rd harmonic) at reduced
      // weight — a lightweight approximation of HPCP-style harmonic
      // summation. Real instruments put meaningful energy into overtones,
      // not just the fundamental, so measuring the fundamental alone
      // under-counts a note's actual presence and makes the chroma vector
      // noisier than it needs to be.
      if (freq * 2 < sampleRate / 2) {
        magnitude += 0.5 * goertzelMagnitude(windowed, sampleRate, freq * 2);
      }
      if (freq * 3 < sampleRate / 2) {
        magnitude += 0.25 * goertzelMagnitude(windowed, sampleRate, freq * 3);
      }
      chroma[midi % 12] += magnitude;
    }
  }

  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  const normChroma = chroma.map((v) => v / total);

  function correlate(profile, root) {
    const rotated = new Array(12);
    for (let i = 0; i < 12; i++) rotated[i] = profile[(i - root + 12) % 12];
    return pearsonCorrelation(normChroma, rotated);
  }

  let best = { score: -Infinity, name: null };
  for (let root = 0; root < 12; root++) {
    const majorScore = correlate(MAJOR_PROFILE, root);
    const minorScore = correlate(MINOR_PROFILE, root);
    if (majorScore > best.score) best = { score: majorScore, name: NOTE_NAMES[root] };
    if (minorScore > best.score) best = { score: minorScore, name: NOTE_NAMES[root] };
  }
  // The chroma vector is returned alongside the best-guess key name so it
  // can also be used directly for timbral/harmonic similarity matching
  // (Find Similar), which is a softer, more useful signal than reducing
  // everything down to a single best-guess root note.
  return { key: best.name, chroma: normChroma };
}
