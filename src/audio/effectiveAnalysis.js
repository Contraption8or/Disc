import { getCachedAnalysis } from "./analysis.js";

export function getEffectiveAnalysis(trackId, overrides) {
  const cached = getCachedAnalysis(trackId) || {};
  const override = overrides[trackId] || {};
  return {
    bpm: override.bpm ?? cached.bpm ?? null,
    key: override.key ?? cached.key ?? null,
    bpmIsOverride: override.bpm != null,
    keyIsOverride: override.key != null,
  };
}
