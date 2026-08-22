// Every localStorage key Disc uses. Keeping this list in one place means
// a profile export/import/switch is automatically complete as long as
// this stays in sync with whatever keys the app actually persists —
// there's deliberately no cleverness here beyond "read/write these
// exact strings."
export const PROFILE_KEYS = [
  "disc.appearance",
  "disc.collections",
  "disc.customFolders",
  "disc.customThemes",
  "disc.defaultLayoutName",
  "disc.favorites",
  "disc.folderGroups",
  "disc.layoutPresets",
  "disc.musicFolder",
  "disc.pomodoroSettings",
  "disc.preloadConcurrency",
  "disc.shortcuts",
  "disc.shuffle",
  "disc.tags",
  "disc.theme",
  "disc.trackNotes",
  "disc.trackOrder",
  "disc.trackOverrides",
  "disc.trackSections",
  "disc.trackTags",
  "disc.volume",
];

// Reads every profile-relevant key currently in localStorage into a
// plain object — missing keys are simply omitted rather than included
// as null/undefined, so applying this later doesn't wipe out something
// the exporting install genuinely never had set.
export function collectProfileData() {
  const data = {};
  for (const key of PROFILE_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

// Writes a previously-collected data object back into localStorage.
// Deliberately does NOT clear keys that aren't present in the incoming
// data first — an older profile saved before some feature existed
// simply won't touch that feature's key, leaving whatever's already
// there (or nothing) rather than actively destroying it.
export function applyProfileData(data) {
  for (const key of PROFILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      localStorage.setItem(key, data[key]);
    }
  }
}
