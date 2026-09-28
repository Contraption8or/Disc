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
  "disc.imagePanel",
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
  "disc.trackSections",
  "disc.trackTags",
  "disc.volume",
];

// Deliberately NOT in PROFILE_KEYS: "disc.studioSyncEnabled",
// "disc.sync.seq", "disc.sync.backfilled". These identify *this
// machine's* relationship to the shared event log (its own sequence
// counter, whether it's already backfilled), not profile-portable data —
// resetting disc.sync.seq on a Default-profile reset would break event
// ordering/dedup against every device's log, and resetting
// disc.sync.backfilled would re-run the one-time backfill and could
// re-emit events for data that was only ever local to a different
// profile on this same machine.

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

// The built-in "Default" profile: rather than a saved file, it's just "every
// profile-relevant key removed" — on the next load Disc treats itself as a
// fresh install (default theme, default panel layout, default settings, an
// empty library setup), exactly what a brand-new copy would show.
export function resetProfileData() {
  for (const key of PROFILE_KEYS) {
    localStorage.removeItem(key);
  }
}

// Whether the Default profile row is hidden from the Profiles menu. A plain
// UI preference — deliberately NOT in PROFILE_KEYS, so switching profiles
// (or resetting to Default) never flips it back.
export const HIDE_DEFAULT_PROFILE_KEY = "disc.hideDefaultProfile";
