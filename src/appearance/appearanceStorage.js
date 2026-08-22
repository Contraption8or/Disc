export const DEFAULT_APPEARANCE = {
  cleanMode: false,
  reduceMotion: false,
  spillEnabled: false,
  spillIntensity: 0.5,
  gradientEnabled: false,
  gradientIntensity: 0.5,
  gradientMode: "auto", // "auto" | "manual"
  gradientAngle: 180,
};

const STORAGE_KEY = "disc.appearance";

export function loadAppearance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_APPEARANCE, ...saved };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
