const SECTIONS_KEY = "disc.trackSections";

export function loadTrackSections() {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTrackSections(sections) {
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
}
