const STORAGE_KEY = "disc.layoutPresets";
const DEFAULT_LAYOUT_KEY = "disc.defaultLayoutName";

export function loadLayoutPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLayoutPresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function loadDefaultLayoutName() {
  return localStorage.getItem(DEFAULT_LAYOUT_KEY) || null;
}

export function saveDefaultLayoutName(name) {
  if (name) localStorage.setItem(DEFAULT_LAYOUT_KEY, name);
  else localStorage.removeItem(DEFAULT_LAYOUT_KEY);
}
