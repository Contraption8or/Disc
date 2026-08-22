export const DEFAULT_SHORTCUTS = {
  playPause: " ",
  seekBack: "ArrowLeft",
  seekForward: "ArrowRight",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  focusSearch: "/",
  next: "n",
  prev: "p",
  shuffle: "s",
  showShortcuts: "?",
};

export const SHORTCUT_LABELS = {
  playPause: "Play / pause",
  seekBack: "Seek back 5 seconds",
  seekForward: "Seek forward 5 seconds",
  volumeUp: "Volume up",
  volumeDown: "Volume down",
  focusSearch: "Jump to search",
  next: "Next track",
  prev: "Previous track",
  shuffle: "Toggle shuffle",
  showShortcuts: "Show shortcuts list",
};

// A friendly display label for a raw key value.
export function displayKey(key) {
  if (key === " ") return "Space";
  if (key.startsWith("Arrow")) return key.replace("Arrow", "");
  return key.length === 1 ? key.toUpperCase() : key;
}

const STORAGE_KEY = "disc.shortcuts";

export function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SHORTCUTS, ...saved };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}
