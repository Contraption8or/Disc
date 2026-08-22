const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// How many semitones apart two note names are, the short way around the
// 12-tone circle (0 = same note, 6 = as far apart as possible).
function noteDistance(a, b) {
  const ia = NOTE_NAMES.indexOf(a);
  const ib = NOTE_NAMES.indexOf(b);
  if (ia === -1 || ib === -1) return 6;
  const diff = Math.abs(ia - ib);
  return Math.min(diff, 12 - diff);
}

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

// Returns a 0–1 score for how similar two tracks are, combining:
//  - shared tags (weighted highest — user-curated ground truth beats any
//    signal Disc can infer on its own)
//  - BPM closeness
//  - key relatedness (exact match highest, nearby on the circle of
//    fourths/fifths still counts for something)
//  - chroma cosine similarity (timbral/harmonic "shape")
//  - brightness/energy closeness (the closest thing to a "vibe" proxy
//    Disc can honestly offer without a trained genre model)
export function computeSimilarityScore(analysisA, analysisB, tagIdsA, tagIdsB) {
  let score = 0;
  let weight = 0;

  if (tagIdsA.length > 0 || tagIdsB.length > 0) {
    const setA = new Set(tagIdsA);
    const setB = new Set(tagIdsB);
    const intersection = [...setA].filter((id) => setB.has(id)).length;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = union === 0 ? 0 : intersection / union;
    score += jaccard * 0.35;
    weight += 0.35;
  }

  if (analysisA.bpm != null && analysisB.bpm != null) {
    const diff = Math.abs(analysisA.bpm - analysisB.bpm);
    const bpmScore = Math.max(0, 1 - diff / 30);
    score += bpmScore * 0.2;
    weight += 0.2;
  }

  if (analysisA.key && analysisB.key) {
    const dist = noteDistance(analysisA.key, analysisB.key);
    const keyScore = Math.max(0, 1 - dist / 6);
    score += keyScore * 0.15;
    weight += 0.15;
  }

  if (analysisA.chroma && analysisB.chroma) {
    const chromaScore = Math.max(0, cosineSimilarity(analysisA.chroma, analysisB.chroma));
    score += chromaScore * 0.2;
    weight += 0.2;
  }

  if (analysisA.brightness != null && analysisB.brightness != null) {
    const brightnessScore = 1 - Math.abs(analysisA.brightness - analysisB.brightness);
    score += brightnessScore * 0.05;
    weight += 0.05;
  }

  if (analysisA.energy != null && analysisB.energy != null) {
    const energyScore = 1 - Math.abs(analysisA.energy - analysisB.energy);
    score += energyScore * 0.05;
    weight += 0.05;
  }

  return weight === 0 ? 0 : score / weight;
}

// A rough, transparently-labeled "vibe" readout for a single track — two
// real audio features bucketed into words, not a genre guess.
export function describeVibe(analysis) {
  if (analysis.energy == null || analysis.brightness == null) return null;
  const energyLabel = analysis.energy < 0.35 ? "Low" : analysis.energy < 0.65 ? "Medium" : "High";
  const brightnessLabel =
    analysis.brightness < 0.35 ? "Dark" : analysis.brightness < 0.65 ? "Balanced" : "Bright";
  return `${energyLabel} energy · ${brightnessLabel}`;
}
