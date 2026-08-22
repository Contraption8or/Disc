const STORAGE_KEY = "disc.customThemes";

export function loadCustomThemes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
}
