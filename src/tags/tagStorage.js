const TAGS_KEY = "disc.tags";
const TRACK_TAGS_KEY = "disc.trackTags";

export function loadTags() {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTags(tags) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

export function loadTrackTags() {
  try {
    const raw = localStorage.getItem(TRACK_TAGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTrackTags(trackTags) {
  localStorage.setItem(TRACK_TAGS_KEY, JSON.stringify(trackTags));
}
