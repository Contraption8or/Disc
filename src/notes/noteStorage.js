const NOTES_KEY = "disc.trackNotes";

export function loadTrackNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTrackNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}
