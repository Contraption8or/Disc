import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DockviewReact } from "dockview";
import "dockview/dist/styles/dockview.css";

import TitleBar from "./components/TitleBar.jsx";
import FolderGroupPanel from "./components/FolderGroupPanel.jsx";
import CollectionsPanel from "./components/CollectionsPanel.jsx";
import LibraryPanel from "./components/LibraryPanel.jsx";
import DetailsPanel from "./components/DetailsPanel.jsx";
import CompactView from "./components/CompactView.jsx";
import ShortcutsModal from "./components/ShortcutsModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import LibraryHealthModal from "./components/LibraryHealthModal.jsx";
import ConvertModal from "./components/ConvertModal.jsx";
import OggLinkPromptModal from "./components/OggLinkPromptModal.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import PomodoroPanel from "./components/PomodoroPanel.jsx";
import { PomodoroProvider } from "./context/PomodoroContext.jsx";
import { DiscContext } from "./context/DiscContext.jsx";
import { THEMES, DEFAULT_THEME } from "./themes/themes.js";
import { applyCustomThemeVars, clearCustomThemeVars } from "./themes/customThemeEngine.js";
import { loadAppearance, saveAppearance } from "./appearance/appearanceStorage.js";
import { applyAppearanceSettings } from "./appearance/applyAppearance.js";
import { loadCustomThemes } from "./themes/customThemes.js";
import {
  loadLayoutPresets,
  saveLayoutPresets,
  loadDefaultLayoutName,
  saveDefaultLayoutName,
} from "./layouts/layoutPresets.js";
import { loadTags, saveTags, loadTrackTags, saveTrackTags } from "./tags/tagStorage.js";
import { loadTrackNotes, saveTrackNotes } from "./notes/noteStorage.js";
import { loadTrackOverrides, saveTrackOverrides } from "./audio/overrideStorage.js";
import { loadTrackSections, saveTrackSections } from "./audio/sectionStorage.js";
import { loadCollections, saveCollections } from "./collections/collectionStorage.js";
import { loadShortcuts, saveShortcuts, DEFAULT_SHORTCUTS } from "./shortcuts/shortcutStorage.js";
import { preloadLibrary, getPreloadCandidates } from "./audio/preload.js";
import {
  setMaxConcurrentDecodes,
  DEFAULT_MAX_CONCURRENT_DECODES,
} from "./audio/waveform.js";
import "./App.css";
import "./appearance/appearance.css";
import "./appearance/motion.css";

const THEME_STORAGE_KEY = "disc.theme";
const FOLDER_STORAGE_KEY = "disc.musicFolder";
const FAVORITES_STORAGE_KEY = "disc.favorites";
const VOLUME_STORAGE_KEY = "disc.volume";
const CUSTOM_FOLDERS_KEY = "disc.customFolders";
const TRACK_ORDER_KEY = "disc.trackOrder";
const FOLDER_GROUPS_KEY = "disc.folderGroups";

// The Blob's MIME type has to actually match the file for playback to be
// reliable — mp3 and wav need different ones, and this is the one place
// in the app that needs to know that (everywhere else just deals with an
// already-decoded AudioBuffer, which is format-agnostic).
function getAudioMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  return "audio/mpeg";
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return DEFAULT_THEME;
    const isValid =
      THEMES.some((t) => t.id === saved) || loadCustomThemes().some((t) => t.id === saved);
    if (isValid) return saved;
    // Only real case this hits today: someone had "premiere-light"
    // (removed) saved as their active theme. Migrating to "paper" (the
    // closest match in spirit — also a light theme) rather than
    // DEFAULT_THEME avoids unexpectedly dumping someone who deliberately
    // chose a light theme into a dark one on their next launch.
    return saved === "premiere-light" ? "paper" : DEFAULT_THEME;
  });
  const [pinned, setPinned] = useState(false);
  const [musicFolderPath, setMusicFolderPath] = useState(
    () => localStorage.getItem(FOLDER_STORAGE_KEY) || ""
  );
  const [tracks, setTracks] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [layoutPresetNames, setLayoutPresetNames] = useState(
    () => Object.keys(loadLayoutPresets())
  );
  const [defaultLayoutName, setDefaultLayoutName] = useState(loadDefaultLayoutName);
  const [activeFolderId, setActiveFolderId] = useState("favorites");
  // Holds { folderId, folderPath, convertiblePaths } between choosing a folder
  // that turns out to have .ogg files in it and the person deciding what
  // to do about it — see handleLinkFolderDirectory below and
  // OggLinkPromptModal.jsx.
  const [pendingOggLink, setPendingOggLink] = useState(null);
  // Manual drag-to-reorder within a single folder (or Favorites) — only
  // ever consulted when sort is set to "Folder order"; any other sort
  // mode ignores this entirely, since dragging to reorder wouldn't mean
  // anything while the list is actively being sorted by something else.
  const [trackOrder, setTrackOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(TRACK_ORDER_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(TRACK_ORDER_KEY, JSON.stringify(trackOrder));
  }, [trackOrder]);

  const handleReorderTracks = useCallback((folderKey, orderedIds) => {
    setTrackOrder((prev) => ({ ...prev, [folderKey]: orderedIds }));
  }, []);
  const [customFolders, setCustomFolders] = useState(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FOLDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // Folders saved before the folder-groups feature existed don't have
      // a groupId yet — put them all in the primary group so nothing goes
      // missing. Similarly, items from before Sections could nest don't
      // have a sectionId (null = top-level, not nested under anything —
      // this now applies to Sections themselves too, not just folders,
      // since Sections can nest inside other Sections), and dividers from
      // before collapsing existed don't have a collapsed flag (default:
      // expanded, so nothing looks different for anyone updating from an
      // older version).
      return parsed.map((f) => {
        let next = f.groupId ? f : { ...f, groupId: "primary" };
        if (next.type === "divider" && next.collapsed === undefined) {
          next = { ...next, collapsed: false };
        }
        if (next.sectionId === undefined) {
          next = { ...next, sectionId: null };
        }
        return next;
      });
    } catch {
      return [];
    }
  });
  const [folderGroups, setFolderGroups] = useState(() => {
    try {
      const raw = localStorage.getItem(FOLDER_GROUPS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.length > 0) return parsed;
    } catch {
      // fall through to default below
    }
    return [{ id: "primary", name: "Sounds", deletable: false }];
  });
  // A just-deleted group, kept around briefly so it can be undone — see
  // handleDeleteFolderGroup/handleUndoDeleteFolderGroup below.
  const [pendingDeletedGroup, setPendingDeletedGroup] = useState(null); // { group, folders } | null
  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimeoutRef = useRef(null);
  const undoGroupTimeoutRef = useRef(null);
  const [customFolderTracks, setCustomFolderTracks] = useState({});
  const watchedCustomIdsRef = useRef(new Set());

  // --- Tagging state --------------------------------------------------
  const [tags, setTags] = useState(loadTags);
  const [trackTags, setTrackTags] = useState(loadTrackTags);

  // --- Notes (freeform per-track text) --------------------------------
  const [trackNotes, setTrackNotes] = useState(loadTrackNotes);
  const [trackOverrides, setTrackOverrides] = useState(loadTrackOverrides);
  // Marked in/out sections per track — { [trackId]: [{ id, startFraction,
  // endFraction }, ...] }. Stored as fractions of duration (0-1) rather
  // than absolute seconds so a section stays correct regardless of
  // whether the track's metadata happens to be loaded at read time.
  const [trackSections, setTrackSections] = useState(loadTrackSections);
  const [healthFilter, setHealthFilter] = useState(null); // null | 'untagged' | 'unanalyzed' | 'missing' | 'duplicates'

  // --- Bulk library preload (waveform + BPM/Key for everything) --------
  // Lives at the App level (not inside the Settings modal) so it keeps
  // running — and its progress keeps updating — even if Settings gets
  // closed while it's mid-run.
  const [preloadState, setPreloadState] = useState({
    status: "idle", // "idle" | "running" | "done" | "cancelled"
    completed: 0,
    total: 0,
    startedAt: null,
  });
  const preloadCancelRef = useRef(false);
  const [preloadConcurrency, setPreloadConcurrency] = useState(
    () => Number(localStorage.getItem("disc.preloadConcurrency")) || DEFAULT_MAX_CONCURRENT_DECODES
  );

  useEffect(() => {
    localStorage.setItem("disc.preloadConcurrency", String(preloadConcurrency));
  }, [preloadConcurrency]);

  const [similarToTrackId, setSimilarToTrackId] = useState(null);
  const [collections, setCollections] = useState(loadCollections);
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  // --- Missing-folder detection ---------------------------------------
  // Keys are "main" or a custom folder's id. A folder lands here when its
  // root directory can't be reached (e.g. an unplugged external drive) —
  // its last-known tracks are kept in view (marked unavailable) instead
  // of silently vanishing.
  const [missingFolderIds, setMissingFolderIds] = useState(() => new Set());

  // --- Compact mode -----------------------------------------------------
  const [compactMode, setCompactMode] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // --- Playback queue (for Play All / Shuffle) ------------------------
  const [queueTrackIds, setQueueTrackIds] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [shuffleEnabled, setShuffleEnabled] = useState(
    () => localStorage.getItem("disc.shuffle") === "true"
  );
  const queueRef = useRef({ ids: [], index: -1 });
  const allTracksRef = useRef([]);
  const playNextRef = useRef(() => {});

  // Bumped whenever a track's BPM/Key analysis finishes (analysis itself
  // lives in a plain module-level cache, not React state, so this is how
  // components relying on that cache — like BPM/Key filtering — know to
  // re-check it).
  const [analysisTick, setAnalysisTick] = useState(0);
  const handleAnalysisUpdated = useCallback(() => {
    setAnalysisTick((v) => v + 1);
  }, []);

  const handleStartPreload = useCallback(() => {
    if (preloadState.status === "running") return;
    preloadCancelRef.current = false;
    setPreloadState({ status: "running", completed: 0, total: 0, startedAt: Date.now() });

    // Normal browsing always stays at the conservative default cap — this
    // bump only applies for the duration of this explicit, deliberate
    // preload run, and is always restored below no matter how it ends.
    setMaxConcurrentDecodes(preloadConcurrency);

    let ticksSinceRefresh = 0;
    preloadLibrary(allTracksRef.current, {
      shouldCancel: () => preloadCancelRef.current,
      onProgress: ({ completed, total }) => {
        setPreloadState((prev) => ({ ...prev, completed, total }));
        // Bump analysisTick periodically (not on every single track) so
        // BPM/Key-dependent UI — sort, filters, the health dashboard —
        // refreshes as data streams in, without re-rendering on every
        // single completion for a library that might be thousands deep.
        ticksSinceRefresh += 1;
        if (ticksSinceRefresh >= 15) {
          ticksSinceRefresh = 0;
          handleAnalysisUpdated();
        }
      },
    })
      .then(({ cancelled }) => {
        handleAnalysisUpdated();
        setPreloadState((prev) => ({
          ...prev,
          status: cancelled ? "cancelled" : "done",
        }));
      })
      .catch(() => {
        setPreloadState((prev) => ({ ...prev, status: "cancelled" }));
      })
      .finally(() => {
        setMaxConcurrentDecodes(DEFAULT_MAX_CONCURRENT_DECODES);
      });
  }, [preloadState.status, preloadConcurrency, handleAnalysisUpdated]);

  const handleCancelPreload = useCallback(() => {
    preloadCancelRef.current = true;
  }, []);

  const handleResetPreload = useCallback(() => {
    setPreloadState({ status: "idle", completed: 0, total: 0, startedAt: null });
  }, []);

  // --- Playback state -----------------------------------------------
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }
  const currentTrackRef = useRef(null);
  const objectUrlRef = useRef(null);
  // Guards against a slow-to-resolve loadAndPlay call finishing *after* a
  // newer one has already taken over — without this, clicking through
  // tracks quickly could let a stale call revoke the blob URL a newer,
  // still-active load owns, or overwrite currentTrackRef back to the
  // wrong track. See loadAndPlay below for how it's used.
  const loadRequestIdRef = useRef(0);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [volume, setVolume] = useState(() => {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    return raw !== null ? Number(raw) : 0.8;
  });

  const dockApiRef = useRef(null);
  const musicFolderPathRef = useRef(musicFolderPath);
  musicFolderPathRef.current = musicFolderPath;

  const applyThemeById = useCallback((id) => {
    const custom = loadCustomThemes().find((t) => t.id === id);
    if (custom) {
      clearCustomThemeVars();
      document.documentElement.setAttribute("data-theme", "custom");
      applyCustomThemeVars(custom.base);
    } else {
      clearCustomThemeVars();
      document.documentElement.setAttribute("data-theme", id);
      // Capture this built-in theme's true flat colors as stable "-base"
      // vars (see the comment in customThemeEngine.js) — reading via
      // getComputedStyle here, right after the attribute switch and
      // right after clearing any leftover custom-theme inline styles,
      // correctly reflects this theme's genuine CSS-rule-defined color.
      const computed = getComputedStyle(document.documentElement);
      const rootStyle = document.documentElement.style;
      ["--bg-app", "--bg-panel", "--bg-panel-alt"].forEach((v) => {
        rootStyle.setProperty(`${v}-base`, computed.getPropertyValue(v).trim());
      });
    }
  }, []);

  useEffect(() => {
    applyThemeById(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, applyThemeById]);

  // --- Appearance settings (spill, gradient, clean mode, reduce motion) --
  const [appearanceSettings, setAppearanceSettings] = useState(loadAppearance);

  const handleSetAppearance = useCallback((updates) => {
    setAppearanceSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    saveAppearance(appearanceSettings);
  }, [appearanceSettings]);

  // Runs after the theme effect above (declared later, so it always
  // re-applies on top) — gradient mode needs to read the theme's actual
  // resolved colors, so it has to run whenever either theme or these
  // settings change.
  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings, theme]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  useEffect(() => {
    localStorage.setItem(FOLDER_GROUPS_KEY, JSON.stringify(folderGroups));
  }, [folderGroups]);

  useEffect(() => {
    saveTags(tags);
  }, [tags]);

  useEffect(() => {
    saveTrackTags(trackTags);
  }, [trackTags]);

  useEffect(() => {
    saveTrackNotes(trackNotes);
  }, [trackNotes]);

  useEffect(() => {
    saveTrackOverrides(trackOverrides);
  }, [trackOverrides]);

  useEffect(() => {
    saveTrackSections(trackSections);
  }, [trackSections]);

  useEffect(() => {
    saveCollections(collections);
  }, [collections]);

  useEffect(() => {
    saveShortcuts(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    localStorage.setItem("disc.shuffle", String(shuffleEnabled));
  }, [shuffleEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    function handlePlay() {
      setIsPlaying(true);
    }
    function handlePause() {
      setIsPlaying(false);
    }
    function handleEnded() {
      setIsPlaying(false);
      playNextRef.current();
    }
    function handleLoadedMetadata() {
      setDuration(audio.duration || 0);
    }
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    // The actual volume change is applied instantly above — only the
    // localStorage write (synchronous, and not something that needs to
    // happen on literally every tick of a slider drag) is debounced.
    const timer = setTimeout(() => {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }, 200);
    return () => clearTimeout(timer);
  }, [volume]);

  // Records whether a scan succeeded or the root was unreachable, without
  // clobbering already-known tracks when it wasn't.
  const applyScanResult = useCallback((key, found, setter) => {
    if (found === null) {
      setMissingFolderIds((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      return;
    }
    setMissingFolderIds((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setter(found);
  }, []);

  const rescan = useCallback(async () => {
    const folder = musicFolderPathRef.current;
    if (!folder || !window.disc) return;
    setIsScanning(true);
    try {
      const found = await window.disc.scanFolder(folder);
      applyScanResult("main", found, setTracks);
    } finally {
      setIsScanning(false);
    }
  }, [applyScanResult]);

  // Scan (and (re-)watch) whenever the chosen music folder changes.
  useEffect(() => {
    if (!musicFolderPath || !window.disc) {
      setTracks([]);
      return;
    }
    rescan();
    window.disc.watchFolder("main", musicFolderPath);
  }, [musicFolderPath, rescan]);

  // Live-updates: when a watched folder changes on disk, rescan just that
  // root — "main" is the music folder, anything else is a linked custom
  // folder's id.
  useEffect(() => {
    if (!window.disc) return;
    return window.disc.onFolderChanged((key) => {
      if (key === "main") {
        rescan();
        return;
      }
      const folder = customFolders.find((f) => f.id === key);
      if (folder?.folderPath) {
        window.disc.scanFolder(folder.folderPath).then((found) => {
          applyScanResult(key, found, (result) =>
            setCustomFolderTracks((prev) => ({ ...prev, [key]: result }))
          );
        });
      }
    });
  }, [rescan, customFolders, applyScanResult]);

  // Keep each linked custom folder scanned + watched, and stop watching
  // anything that gets unlinked or deleted.
  useEffect(() => {
    if (!window.disc) return;

    const currentLinkedIds = new Set(
      customFolders.filter((f) => f.folderPath).map((f) => f.id)
    );

    customFolders.forEach((folder) => {
      if (!folder.folderPath) return;
      window.disc.scanFolder(folder.folderPath).then((found) => {
        applyScanResult(folder.id, found, (result) =>
          setCustomFolderTracks((prev) => ({ ...prev, [folder.id]: result }))
        );
      });
      window.disc.watchFolder(folder.id, folder.folderPath);
    });

    for (const id of watchedCustomIdsRef.current) {
      if (!currentLinkedIds.has(id)) {
        window.disc.unwatchFolder(id);
        setCustomFolderTracks((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setMissingFolderIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
    watchedCustomIdsRef.current = currentLinkedIds;
  }, [customFolders, applyScanResult]);

  const handleToggleFavorite = useCallback((trackId) => {
    setFavoriteIds((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId]
    );
  }, []);

  // Explicit set (not toggle) — used by batch actions so selecting several
  // tracks and hitting "Add to Favorites" doesn't accidentally un-favorite
  // ones that were already favorited.
  const handleSetFavorite = useCallback((trackIds, shouldFavorite) => {
    setFavoriteIds((prev) => {
      const set = new Set(prev);
      trackIds.forEach((id) => {
        if (shouldFavorite) set.add(id);
        else set.delete(id);
      });
      return Array.from(set);
    });
  }, []);

  const handleSetTrackNote = useCallback((trackId, note) => {
    setTrackNotes((prev) => {
      if (!note.trim()) {
        if (!(trackId in prev)) return prev;
        const next = { ...prev };
        delete next[trackId];
        return next;
      }
      return { ...prev, [trackId]: note };
    });
  }, []);

  // field is "bpm" or "key"; value null/empty clears that field's override
  // and falls back to the auto-detected value again.
  const handleSetTrackOverride = useCallback((trackId, field, value) => {
    setTrackOverrides((prev) => {
      const current = prev[trackId] || {};
      const next = { ...current, [field]: value || null };
      if (next.bpm == null) delete next.bpm;
      if (!next.key) delete next.key;
      const result = { ...prev };
      if (Object.keys(next).length === 0) {
        delete result[trackId];
      } else {
        result[trackId] = next;
      }
      return result;
    });
  }, []);

  // Adds a new marked section for a track — startFraction/endFraction are
  // both 0-1, position within the track's total duration. Sections stay
  // in the order they were created; Ctrl+Click on Play cycles through
  // them in that same order (see handlePlaySection below).
  const handleAddTrackSection = useCallback((trackId, startFraction, endFraction) => {
    const id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTrackSections((prev) => ({
      ...prev,
      [trackId]: [...(prev[trackId] || []), { id, startFraction, endFraction }],
    }));
  }, []);

  const handleDeleteTrackSection = useCallback((trackId, sectionId) => {
    setTrackSections((prev) => {
      const remaining = (prev[trackId] || []).filter((s) => s.id !== sectionId);
      const next = { ...prev };
      if (remaining.length === 0) delete next[trackId];
      else next[trackId] = remaining;
      return next;
    });
  }, []);

  // --- Collections (virtual groupings, independent of any real folder) --
  const handleCreateCollection = useCallback((name) => {
    const id = `collection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCollections((prev) => [
      ...prev,
      { id, name: name || "New Collection", color: null, trackIds: [] },
    ]);
    return id;
  }, []);

  const handleRenameCollection = useCallback((id, name) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, name: name.trim() || "New Collection" } : c
      )
    );
  }, []);

  const handleDeleteCollection = useCallback((id) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleSetCollectionColor = useCallback((id, color) => {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  }, []);

  const handleAddTracksToCollection = useCallback((trackIds, collectionId) => {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== collectionId) return c;
        const existing = new Set(c.trackIds);
        trackIds.forEach((id) => existing.add(id));
        return { ...c, trackIds: Array.from(existing) };
      })
    );
  }, []);

  const handleRemoveTrackFromCollection = useCallback((trackId, collectionId) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, trackIds: c.trackIds.filter((id) => id !== trackId) }
          : c
      )
    );
  }, []);

  // Rebinding a key to one action automatically clears it from whatever
  // action was using it, so two actions can never silently share a key.
  const handleSetShortcut = useCallback((action, key) => {
    setShortcuts((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((otherAction) => {
        if (otherAction !== action && next[otherAction] === key) {
          next[otherAction] = "";
        }
      });
      next[action] = key;
      return next;
    });
  }, []);

  const handleResetShortcuts = useCallback(() => {
    setShortcuts({ ...DEFAULT_SHORTCUTS });
  }, []);

  const handleCreateTag = useCallback((name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTags((prev) => [...prev, { id, name: trimmed, color }]);
    return id;
  }, []);

  const handleDeleteTag = useCallback((tagId) => {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    setTrackTags((prev) => {
      const next = {};
      for (const [trackId, ids] of Object.entries(prev)) {
        next[trackId] = ids.filter((id) => id !== tagId);
      }
      return next;
    });
  }, []);

  const handleToggleTrackTag = useCallback((trackId, tagId) => {
    setTrackTags((prev) => {
      const current = prev[trackId] || [];
      const next = current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId];
      return { ...prev, [trackId]: next };
    });
  }, []);

  // Explicit add (not toggle) across many tracks at once — used by the
  // multi-select batch "Add Tag" action.
  const handleAssignTagToTracks = useCallback((trackIds, tagId) => {
    setTrackTags((prev) => {
      const next = { ...prev };
      trackIds.forEach((trackId) => {
        const current = next[trackId] || [];
        if (!current.includes(tagId)) next[trackId] = [...current, tagId];
      });
      return next;
    });
  }, []);

  // Files dragged in from the OS land here, get copied into the target
  // folder (the active custom folder's directory if one's linked and
  // selected, otherwise the main music folder), and the relevant watcher
  // (or this fallback rescan) picks them up.
  const handleDropFiles = useCallback(
    async (sourcePaths, targetFolderPath) => {
      const folder = targetFolderPath || musicFolderPathRef.current;
      if (!folder || !window.disc || sourcePaths.length === 0) return;
      await window.disc.copyFilesIntoFolder(folder, sourcePaths);
      rescan();
    },
    [rescan]
  );

  // Physically moves a batch of tracks to a different folder on disk (the
  // multi-select "Move to folder" action), then rescans everything that
  // could plausibly have changed — simplest correct approach, since a
  // move touches both the source and destination roots.
  const handleBatchMove = useCallback(
    async (trackIds, destFolderPath) => {
      if (!window.disc || !destFolderPath || trackIds.length === 0) return;
      const idSet = new Set(trackIds);
      const toMove = allTracksRef.current.filter((t) => idSet.has(t.id));
      for (const track of toMove) {
        await window.disc.moveFile(track.filePath, destFolderPath);
      }
      rescan();
      customFolders.forEach((folder) => {
        if (!folder.folderPath) return;
        window.disc.scanFolder(folder.folderPath).then((found) => {
          applyScanResult(folder.id, found, (result) =>
            setCustomFolderTracks((prev) => ({ ...prev, [folder.id]: result }))
          );
        });
      });
    },
    [rescan, customFolders, applyScanResult]
  );

  // Deletes a track (to the OS trash, recoverable) then rescans everything
  // that could plausibly have changed. The folder watcher would also catch
  // this on its own, but doing it explicitly makes the UI update instantly
  // rather than waiting on the watcher's debounce.
  const handleDeleteTrack = useCallback(
    async (filePath) => {
      if (!window.disc || !filePath) return;
      await window.disc.deleteFile(filePath);
      rescan();
      customFolders.forEach((folder) => {
        if (!folder.folderPath) return;
        window.disc.scanFolder(folder.folderPath).then((found) => {
          applyScanResult(folder.id, found, (result) =>
            setCustomFolderTracks((prev) => ({ ...prev, [folder.id]: result }))
          );
        });
      });
    },
    [rescan, customFolders, applyScanResult]
  );

  // Same as handleDeleteTrack, but for a whole multi-selection at once —
  // takes track ids (matching every other batch action, e.g. handleBatchMove
  // above) rather than file paths, and does one rescan at the end instead
  // of one per file.
  const handleDeleteTracks = useCallback(
    async (trackIds) => {
      if (!window.disc || !trackIds || trackIds.length === 0) return;
      const idSet = new Set(trackIds);
      const toDelete = allTracksRef.current.filter((t) => idSet.has(t.id));
      for (const track of toDelete) {
        await window.disc.deleteFile(track.filePath);
      }
      rescan();
      customFolders.forEach((folder) => {
        if (!folder.folderPath) return;
        window.disc.scanFolder(folder.folderPath).then((found) => {
          applyScanResult(folder.id, found, (result) =>
            setCustomFolderTracks((prev) => ({ ...prev, [folder.id]: result }))
          );
        });
      });
    },
    [rescan, customFolders, applyScanResult]
  );

  // Renaming a track renames the actual file on disk — and since a
  // track's id *is* its file path everywhere in Disc, that means the id
  // changes too. Everything keyed by the old id (favorites, tags, notes,
  // manual BPM/Key overrides, Collection membership) has to be carried
  // over to the new id here, or it would just silently vanish the moment
  // the library rescans and the track reappears under its new path.
  const handleRenameTrackFile = useCallback(
    async (track, newStem) => {
      if (!window.disc || !track || !newStem?.trim()) return { success: false };
      const result = await window.disc.renameTrackFile(track.filePath, newStem.trim());
      if (!result?.success) return result;

      const oldId = track.id;
      const newId = result.newPath;

      if (oldId !== newId) {
        setFavoriteIds((prev) => prev.map((id) => (id === oldId ? newId : id)));

        setTrackTags((prev) => {
          if (!(oldId in prev)) return prev;
          const next = { ...prev };
          next[newId] = next[oldId];
          delete next[oldId];
          return next;
        });

        setTrackNotes((prev) => {
          if (!(oldId in prev)) return prev;
          const next = { ...prev };
          next[newId] = next[oldId];
          delete next[oldId];
          return next;
        });

        setTrackOverrides((prev) => {
          if (!(oldId in prev)) return prev;
          const next = { ...prev };
          next[newId] = next[oldId];
          delete next[oldId];
          return next;
        });

        setCollections((prev) =>
          prev.map((c) =>
            c.trackIds.includes(oldId)
              ? { ...c, trackIds: c.trackIds.map((id) => (id === oldId ? newId : id)) }
              : c
          )
        );
      }

      // The file-watcher will pick this up on its own, but rescanning
      // right away means the renamed track (and its migrated tags/notes/
      // etc, now correctly attached to it) shows up immediately instead
      // of waiting on the watcher's own timing.
      rescan();
      customFolders.forEach((folder) => {
        if (!folder.folderPath) return;
        window.disc.scanFolder(folder.folderPath).then((found) => {
          applyScanResult(folder.id, found, (r) =>
            setCustomFolderTracks((prev) => ({ ...prev, [folder.id]: r }))
          );
        });
      });

      return result;
    },
    [rescan, customFolders, applyScanResult]
  );

  // Loads a track's audio into the shared <audio> element (if it isn't
  // already loaded) and starts playback, optionally seeking first.
  const loadAndPlay = useCallback(async (track, seekFraction = 0) => {
    if (!window.disc) return;
    const audio = audioRef.current;
    const isNewTrack = currentTrackRef.current?.id !== track.id;

    if (isNewTrack) {
      const requestId = ++loadRequestIdRef.current;
      const bytes = await window.disc.readAudioFile(track.filePath);
      // A newer call to loadAndPlay may have started — and possibly
      // already finished — while this read was in flight. If so, this
      // call is stale and has to stop here: continuing would mean
      // revoking the blob URL a newer, still-active load now owns, or
      // overwriting currentTrackRef back to the wrong track.
      if (loadRequestIdRef.current !== requestId) return;
      if (!bytes) return;
      const blob = new Blob([bytes], { type: getAudioMimeType(track.fileName) });
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      audio.src = url;
      currentTrackRef.current = track;
      setCurrentTrackId(track.id);

      await new Promise((resolve) => {
        if (audio.readyState >= 1) {
          resolve();
          return;
        }
        audio.addEventListener("loadedmetadata", resolve, { once: true });
      });

      // Same check again — a newer call can also complete while this one
      // was waiting on loadedmetadata specifically (both listeners are on
      // the same shared <audio> element, so an unrelated newer load's
      // event could otherwise let this stale call resume and seek/play
      // using its own now-outdated track and seekFraction).
      if (loadRequestIdRef.current !== requestId) return;
    }

    // Setting `currentTime` — even to a value the element is already at —
    // forces a real seek, and MP3 decoding has to re-sync to a frame
    // boundary to honor that. A freshly-loaded track already starts at 0,
    // so re-issuing "seek to 0" right as playback begins was causing a
    // brief decode restart (audible as the first instant repeating).
    // Only actually seek when it's a real, meaningful position change.
    if (seekFraction != null && Number.isFinite(audio.duration)) {
      const targetTime = seekFraction * audio.duration;
      const startsAtZeroAlready = isNewTrack && seekFraction === 0;
      if (!startsAtZeroAlready && Math.abs(audio.currentTime - targetTime) > 0.05) {
        audio.currentTime = targetTime;
      }
    }

    try {
      await audio.play();
    } catch {
      // Playback can be interrupted by a rapid follow-up call; safe to ignore.
    }
  }, []);

  const togglePlayPause = useCallback(
    (track, { forceFromStart = false } = {}) => {
      const audio = audioRef.current;
      const isSameTrack = currentTrackRef.current?.id === track.id;
      if (isSameTrack && forceFromStart) {
        // Shift+Click: restart from the very beginning regardless of
        // wherever playback currently sits, or whether it's paused.
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      if (isSameTrack) {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      } else {
        // A freshly-loaded track always starts at 0 anyway, so
        // forceFromStart doesn't need any special handling on this path.
        loadAndPlay(track, 0);
      }
    },
    [loadAndPlay]
  );

  const seekTo = useCallback(
    (track, fraction) => {
      const audio = audioRef.current;
      if (currentTrackRef.current?.id === track.id) {
        if (Number.isFinite(audio.duration)) {
          audio.currentTime = fraction * audio.duration;
        }
        if (audio.paused) audio.play().catch(() => {});
      } else {
        loadAndPlay(track, fraction);
      }
    },
    [loadAndPlay]
  );

  // Ctrl+Click on Play: cycles through a track's marked sections in the
  // order they were created, playing from that section's start each
  // time. Tracks which section came up last per-track so consecutive
  // Ctrl+clicks advance rather than always landing on the first one;
  // switching to a different track (by any means) resets the cycle back
  // to the first section next time.
  const sectionCycleRef = useRef({ trackId: null, index: -1 });

  const playTrackSection = useCallback(
    (track, sections) => {
      if (!sections || sections.length === 0) {
        togglePlayPause(track);
        return;
      }
      const cycle = sectionCycleRef.current;
      const isSameCycleTrack = cycle.trackId === track.id;
      const nextIndex = isSameCycleTrack ? (cycle.index + 1) % sections.length : 0;
      sectionCycleRef.current = { trackId: track.id, index: nextIndex };

      const section = sections[nextIndex];
      const audio = audioRef.current;
      if (currentTrackRef.current?.id === track.id) {
        if (Number.isFinite(audio.duration)) {
          audio.currentTime = section.startFraction * audio.duration;
        }
        audio.play().catch(() => {});
      } else {
        loadAndPlay(track, section.startFraction);
      }
    },
    [loadAndPlay, togglePlayPause]
  );

  const getCurrentTime = useCallback(() => audioRef.current?.currentTime || 0, []);

  // Nudges playback by a number of seconds (used by the ←/→ shortcuts).
  const seekRelative = useCallback((deltaSeconds) => {
    const audio = audioRef.current;
    if (!currentTrackRef.current || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(
      audio.duration,
      Math.max(0, audio.currentTime + deltaSeconds)
    );
  }, []);

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Starts a queue from a list of track ids (e.g. everything currently
  // visible in the Library panel) and plays the first one.
  const handlePlayAll = useCallback(
    (trackIds, shuffle) => {
      if (!trackIds || trackIds.length === 0) return;
      let ordered = shuffle ? shuffleArray(trackIds) : trackIds;

      // If shuffling while something's already playing, don't let the new
      // queue's first pick be the same track — that reads as "it repeated".
      const nowPlayingId = currentTrackRef.current?.id;
      if (shuffle && ordered.length > 1 && ordered[0] === nowPlayingId) {
        [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
      }

      queueRef.current = { ids: ordered, index: 0 };
      setQueueTrackIds(ordered);
      setQueueIndex(0);
      const track = allTracksRef.current.find((t) => t.id === ordered[0]);
      if (track) loadAndPlay(track, 0);
    },
    [loadAndPlay]
  );

  const handlePlayNext = useCallback(() => {
    const { ids, index } = queueRef.current;
    if (!ids || ids.length === 0) return;
    const nextIndex = index + 1;
    if (nextIndex >= ids.length) {
      queueRef.current = { ids: [], index: -1 };
      setQueueTrackIds([]);
      setQueueIndex(-1);
      return;
    }
    const nextTrack = allTracksRef.current.find((t) => t.id === ids[nextIndex]);
    queueRef.current = { ids, index: nextIndex };
    setQueueIndex(nextIndex);
    if (nextTrack) loadAndPlay(nextTrack, 0);
  }, [loadAndPlay]);

  const handlePlayPrev = useCallback(() => {
    const { ids, index } = queueRef.current;
    if (!ids || ids.length === 0 || index <= 0) return;
    const prevIndex = index - 1;
    const prevTrack = allTracksRef.current.find((t) => t.id === ids[prevIndex]);
    queueRef.current = { ids, index: prevIndex };
    setQueueIndex(prevIndex);
    if (prevTrack) loadAndPlay(prevTrack, 0);
  }, [loadAndPlay]);

  const handleToggleShuffle = useCallback(() => {
    setShuffleEnabled((v) => !v);
  }, []);

  // Global keyboard shortcuts — ignored entirely while typing in a text
  // field, dropdown, or slider so they don't fight with normal typing or
  // native input behavior (e.g. arrow keys on the BPM range slider).
  // Bindings come from `shortcuts` (user-customizable in the Shortcuts
  // modal) except Ctrl/Cmd+K, which is a fixed convention like most apps.
  useEffect(() => {
    function isTypingTarget() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
      );
    }

    function matchesKey(e, boundKey) {
      if (!boundKey) return false;
      if (boundKey.length === 1) return e.key.toLowerCase() === boundKey.toLowerCase();
      return e.key === boundKey;
    }

    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }

      // Force Save — everything in Disc already persists to localStorage
      // the moment it changes, with one exception (volume, debounced by
      // 200ms so a slider drag doesn't hammer localStorage on every
      // tick). This flushes that immediately and confirms with a toast,
      // mostly for peace of mind that nothing's sitting unsaved.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
        setShowSavedToast(true);
        clearTimeout(savedToastTimeoutRef.current);
        savedToastTimeoutRef.current = setTimeout(() => setShowSavedToast(false), 2000);
        return;
      }

      if (isTypingTarget()) return;

      const s = shortcutsRef.current;

      if (matchesKey(e, s.playPause)) {
        e.preventDefault();
        if (currentTrackRef.current) togglePlayPause(currentTrackRef.current);
      } else if (matchesKey(e, s.seekBack)) {
        e.preventDefault();
        seekRelative(-5);
      } else if (matchesKey(e, s.seekForward)) {
        e.preventDefault();
        seekRelative(5);
      } else if (matchesKey(e, s.volumeUp)) {
        e.preventDefault();
        setVolume((v) => Math.min(1, Math.round((v + 0.05) * 100) / 100));
      } else if (matchesKey(e, s.volumeDown)) {
        e.preventDefault();
        setVolume((v) => Math.max(0, Math.round((v - 0.05) * 100) / 100));
      } else if (matchesKey(e, s.focusSearch)) {
        e.preventDefault();
        document.querySelector(".library-toolbar__search input")?.focus();
      } else if (matchesKey(e, s.next)) {
        handlePlayNext();
      } else if (matchesKey(e, s.prev)) {
        handlePlayPrev();
      } else if (matchesKey(e, s.shuffle)) {
        handleToggleShuffle();
      } else if (matchesKey(e, s.showShortcuts)) {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause, seekRelative, handlePlayNext, handlePlayPrev, handleToggleShuffle, volume]);

  const handleSelectTrack = useCallback((track) => {
    setSelectedTrackId(track.id);
  }, []);

  const handleCreateFolder = useCallback((type = "folder", groupId = "primary") => {
    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (type === "divider") {
      setCustomFolders((prev) => [
        ...prev,
        { id, type: "divider", name: "New Section", groupId, collapsed: false, sectionId: null },
      ]);
    } else {
      setCustomFolders((prev) => [
        ...prev,
        {
          id,
          type: "folder",
          name: "New Folder",
          color: null,
          folderPath: null,
          groupId,
          sectionId: null,
        },
      ]);
    }
    return id;
  }, []);

  // Dragging a real folder in from Explorer creates AND links it in one
  // step — skips the usual "create empty folder, then browse for a
  // directory" two-step entirely. Confirms the dropped path is genuinely
  // a directory first (a stray file dropped alongside a folder gets
  // silently skipped rather than creating a broken/unlinkable entry), and
  // derives the folder's name from the directory's own name.
  const handleCreateFolderFromPath = useCallback(async (folderPath, groupId, sectionId) => {
    if (!window.disc || !folderPath) return;
    const stat = await window.disc.statPath(folderPath);
    if (!stat?.isDirectory) return;

    const name =
      folderPath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "New Folder";
    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCustomFolders((prev) => [
      ...prev,
      {
        id,
        type: "folder",
        name,
        color: null,
        folderPath,
        groupId,
        sectionId: sectionId ?? null,
      },
    ]);
  }, []);

  const handleRenameFolder = useCallback((id, name) => {
    setCustomFolders((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, name: name.trim() || "New Folder" } : f
      )
    );
  }, []);

  // Deleting a Section un-nests whatever's inside it (back to top-level in
  // the same group) rather than deleting those folders too — a Section is
  // just an organizational grouping, and the folders inside it are real
  // things the person still cares about even if the grouping goes away.
  const handleDeleteFolder = useCallback((id) => {
    setCustomFolders((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f) => (f.sectionId === id ? { ...f, sectionId: null } : f))
    );
  }, []);

  const handleToggleSectionCollapsed = useCallback((id) => {
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f))
    );
  }, []);

  // Links a custom folder to a real directory on disk — from then on it's
  // scanned and watched independently, and excluded from the main music
  // folder's scan (if one's set — there's no dedicated browsing view for
  // it anymore, but it can still exist as an underlying data source).
  // If the chosen folder has convertible audio files in it (.ogg, .flac,
  // .m4a, .aac, .opus, .webm — same list the standalone converter uses),
  // linking is held off and a prompt takes over instead (see
  // pendingOggLink below and OggLinkPromptModal.jsx). Worth being
  // accurate about *why* this exists: Chromium's Web Audio already
  // decodes several of these formats natively (.ogg included), so this
  // isn't about Disc being unable to play them — it's simply offering
  // the choice to convert to real .mp3 files on disk, for whatever
  // reason that matters to the person doing the linking (sharing with
  // others, a workflow that expects mp3 specifically, etc). A folder
  // with nothing convertible in it links exactly as it always has, no
  // extra step in the common case.
  const handleLinkFolderDirectory = useCallback(async (id) => {
    if (!window.disc) return;
    const chosen = await window.disc.chooseMusicFolder();
    if (!chosen) return;

    const convertiblePaths = await window.disc.scanForConvertible(chosen);
    if (convertiblePaths.length > 0) {
      setPendingOggLink({ folderId: id, folderPath: chosen, convertiblePaths });
      return;
    }

    setCustomFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, folderPath: chosen } : f))
    );
  }, []);

  // The three things the OGG-link prompt can end in:
  const handleLinkWithoutConverting = useCallback(() => {
    if (!pendingOggLink) return;
    const { folderId, folderPath } = pendingOggLink;
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, folderPath } : f))
    );
    setPendingOggLink(null);
  }, [pendingOggLink]);

  const handleCancelOggLinkPrompt = useCallback(() => {
    setPendingOggLink(null);
  }, []);

  // Links the folder so the modal can show live progress as files land in
  // it — the modal itself (OggLinkPromptModal) drives the actual convert
  // loop and calls this once, right as it starts.
  const handleConvertAndLink = useCallback(() => {
    if (!pendingOggLink) return;
    const { folderId, folderPath } = pendingOggLink;
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, folderPath } : f))
    );
  }, [pendingOggLink]);

  // Cancelling mid-conversion un-links the folder entirely — not just a
  // pause. Converting was an explicit, potentially slow choice (dozens or
  // hundreds of files), so backing out should leave things exactly as if
  // it had never been started, not a half-linked folder with only some
  // files converted.
  const handleUnlinkPendingOggFolder = useCallback(() => {
    if (!pendingOggLink) return;
    const { folderId } = pendingOggLink;
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, folderPath: null } : f))
    );
    setPendingOggLink(null);
  }, [pendingOggLink]);

  const handleUnlinkFolderDirectory = useCallback((id) => {
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, folderPath: null } : f))
    );
  }, []);

  const handleSetFolderColor = useCallback((id, color) => {
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, color } : f))
    );
  }, []);

  // Drag-to-reorder within a group, or drag between two different groups'
  // panels entirely — dropping one item onto another places the dragged
  // item right before the drop target (and, if it came from a different
  // group, moves it into the destination group); dropping in the empty
  // space below a list sends it to the end of that group. Only groupId
  // changes when moving between groups — color, linked directory, tags on
  // its tracks, everything else about the folder is untouched.
  // Drag-to-reorder within a group, drag between two different groups'
  // panels, and now also drag in/out of a Section within a group — drop
  // directly on a Section (or on a folder that's already inside one) to
  // join it; drop in the general list area (not on anything specific) to
  // land at top-level, outside any Section. Only groupId/sectionId change
  // when moving something — color, linked directory, everything else
  // about a folder is untouched. Sections themselves never get nested
  // inside another Section (one level of nesting only, kept simple).
  // Drag-to-reorder within a group, drag between two different groups'
  // panels, and drag in/out of a Section (which can now nest inside
  // another Section too, arbitrarily deep) within a group — drop
  // directly on a Section (or on an item that's already inside one) to
  // join it; drop in the general list area (not on anything specific) to
  // land at top-level, outside any Section. Only groupId/sectionId change
  // when moving something — color, linked directory, everything else
  // about a folder is untouched.
  const handleReorderFolders = useCallback((draggedId, targetId, targetGroupId, targetSectionId) => {
    if (draggedId === targetId) return;
    setCustomFolders((prev) => {
      const dragged = prev.find((f) => f.id === draggedId);
      if (!dragged) return prev;

      // A Section can't become nested inside itself or one of its own
      // descendants — that would create a cycle with no way to drag it
      // back out again, since the only path out would run back through
      // itself. Walk the target's ancestor chain; if the dragged Section
      // appears anywhere in it, reject the move entirely. The iteration
      // cap is a defensive backstop, not something that should ever
      // actually trigger — sectionId can't currently form a cycle given
      // how it's set everywhere else, but an unbounded while loop here
      // would freeze the whole renderer if that ever stopped being true
      // (corrupted data, a future bug), which is worse than a crash.
      if (dragged.type === "divider" && targetSectionId) {
        let current = prev.find((f) => f.id === targetSectionId);
        let guard = 0;
        while (current && guard < 200) {
          if (current.id === draggedId) return prev;
          current = current.sectionId ? prev.find((f) => f.id === current.sectionId) : null;
          guard += 1;
        }
      }

      let working = prev;

      // Moving a Section to a different group has to take its whole
      // subtree with it — every folder and nested Section inside it, at
      // any depth — otherwise its contents would be stranded in whatever
      // panel it just left, invisible from the Section that now lives
      // somewhere else.
      if (dragged.type === "divider" && targetGroupId && dragged.groupId !== targetGroupId) {
        const idsToMove = new Set([draggedId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const f of working) {
            if (f.sectionId && idsToMove.has(f.sectionId) && !idsToMove.has(f.id)) {
              idsToMove.add(f.id);
              grew = true;
            }
          }
        }
        working = working.map((f) => (idsToMove.has(f.id) ? { ...f, groupId: targetGroupId } : f));
      }

      const fromIndex = working.findIndex((f) => f.id === draggedId);
      if (fromIndex === -1) return prev;
      const next = [...working];
      const [moved] = next.splice(fromIndex, 1);
      if (targetGroupId && moved.groupId !== targetGroupId) {
        moved.groupId = targetGroupId;
      }
      if (targetSectionId !== undefined) {
        moved.sectionId = targetSectionId;
      }
      if (targetId == null) {
        next.push(moved);
      } else {
        const toIndex = next.findIndex((f) => f.id === targetId);
        next.splice(toIndex === -1 ? next.length : toIndex, 0, moved);
      }
      return next;
    });
  }, []);

  // Sorts a Section's direct children (folders and/or nested Sections)
  // alphabetically by name. Only one level deep — a nested Section's own
  // children aren't touched, so sorting stays predictable and each
  // Section can be sorted independently.
  const handleSortSectionAlphabetically = useCallback((sectionId) => {
    setCustomFolders((prev) => {
      const children = prev.filter((f) => f.sectionId === sectionId);
      if (children.length < 2) return prev;
      const sorted = [...children].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
      );
      const withoutChildren = prev.filter((f) => f.sectionId !== sectionId);
      const sectionIndex = withoutChildren.findIndex((f) => f.id === sectionId);
      const insertAt = sectionIndex === -1 ? withoutChildren.length : sectionIndex + 1;
      const next = [...withoutChildren];
      next.splice(insertAt, 0, ...sorted);
      return next;
    });
  }, []);

  // --- Folder groups — each one is its own independent, dockable panel --
  // (see FolderGroupPanel.jsx). "primary" is the original always-present
  // group (Favorites lives there) and
  // can't be deleted; anything else is fully user-created.
  const handleCreateFolderGroup = useCallback((name) => {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const group = { id, name: name?.trim() || "New Group", deletable: true };
    setFolderGroups((prev) => [...prev, group]);
    dockApiRef.current?.addPanel({
      id: `folder-group-${id}`,
      component: "folderGroup",
      title: group.name,
      params: { groupId: id },
      position: { referencePanel: "library", direction: "left" },
    });
    return id;
  }, []);

  const handleRenameFolderGroup = useCallback((groupId, name) => {
    const trimmed = name.trim() || "New Group";
    setFolderGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g))
    );
    // Best-effort — if this dockview version/panel doesn't support live
    // title updates, the in-panel header (driven by the same state) is
    // still always correct regardless.
    dockApiRef.current?.getPanel(`folder-group-${groupId}`)?.api?.setTitle?.(trimmed);
  }, []);

  // Soft delete: the group and its folders are removed immediately (and
  // the panel closes), but kept around for a few seconds so the action
  // can be undone before it's final.
  const handleDeleteFolderGroup = useCallback(
    (groupId) => {
      const group = folderGroups.find((g) => g.id === groupId);
      if (!group || !group.deletable) return;
      const removedFolders = customFolders.filter((f) => f.groupId === groupId);

      setFolderGroups((prev) => prev.filter((g) => g.id !== groupId));
      setCustomFolders((prev) => prev.filter((f) => f.groupId !== groupId));
      setPendingDeletedGroup({ group, folders: removedFolders });
      clearTimeout(undoGroupTimeoutRef.current);
      undoGroupTimeoutRef.current = setTimeout(() => setPendingDeletedGroup(null), 8000);

      const panelId = `folder-group-${groupId}`;
      dockApiRef.current?.getPanel(panelId)?.api?.close?.();
    },
    [folderGroups, customFolders]
  );

  const handleUndoDeleteFolderGroup = useCallback(() => {
    if (!pendingDeletedGroup) return;
    clearTimeout(undoGroupTimeoutRef.current);
    const { group, folders } = pendingDeletedGroup;
    setFolderGroups((prev) => [...prev, group]);
    setCustomFolders((prev) => [...prev, ...folders]);
    setPendingDeletedGroup(null);
    dockApiRef.current?.addPanel({
      id: `folder-group-${group.id}`,
      component: "folderGroup",
      title: group.name,
      params: { groupId: group.id },
      position: { referencePanel: "library", direction: "left" },
    });
  }, [pendingDeletedGroup]);

  // Every track Disc currently knows about, from the main folder and every
  // linked custom folder, deduped by id (a track's absolute path). Used
  // anywhere a track needs to be found regardless of which folder it's
  // showing under — Favorites and the Details panel both need this.
  const allTracks = useMemo(() => {
    const map = new Map();
    tracks.forEach((t) => map.set(t.id, t));
    Object.values(customFolderTracks).forEach((list) => {
      list.forEach((t) => map.set(t.id, t));
    });
    return Array.from(map.values());
  }, [tracks, customFolderTracks]);

  // Keep refs in sync every render so the audio element's mount-only
  // 'ended' listener and the queue handlers always see current data.
  playNextRef.current = handlePlayNext;
  allTracksRef.current = allTracks;

  const handleTogglePin = useCallback(async () => {
    if (!window.disc) return;
    const next = await window.disc.toggleAlwaysOnTop(!pinned);
    setPinned(next);
  }, [pinned]);

  const handleChooseFolder = useCallback(async () => {
    if (!window.disc) return;
    const chosen = await window.disc.chooseMusicFolder();
    if (chosen) {
      setMusicFolderPath(chosen);
      localStorage.setItem(FOLDER_STORAGE_KEY, chosen);
    }
  }, []);

  const handleEnterCompactMode = useCallback(() => {
    window.disc?.enterCompactMode();
    setCompactMode(true);
  }, []);

  const handleExitCompactMode = useCallback(() => {
    window.disc?.exitCompactMode();
    setCompactMode(false);
  }, []);

  // Stable references — dockview should be given the same component
  // identity across renders, since app state now flows in via context
  // rather than through props baked into a closure here.
  const dockComponents = {
    sidebar: FolderGroupPanel,
    folderGroup: FolderGroupPanel,
    library: LibraryPanel,
    details: DetailsPanel,
    collections: CollectionsPanel,
    pomodoro: PomodoroPanel,
  };

  const discContextValue = useMemo(
    () => ({
      musicFolderPath,
      onChooseFolder: handleChooseFolder,
      tracks,
      isScanning,
      favoriteIds,
      onToggleFavorite: handleToggleFavorite,
      onSetFavorite: handleSetFavorite,
      onDropFiles: handleDropFiles,
      onBatchMove: handleBatchMove,
      onDeleteTrack: handleDeleteTrack,
      onDeleteTracks: handleDeleteTracks,
      onRenameTrackFile: handleRenameTrackFile,
      trackNotes,
      onSetTrackNote: handleSetTrackNote,
      trackOverrides,
      onSetTrackOverride: handleSetTrackOverride,
      trackSections,
      onAddTrackSection: handleAddTrackSection,
      onDeleteTrackSection: handleDeleteTrackSection,
      healthFilter,
      onSetHealthFilter: setHealthFilter,
      preloadState,
      onStartPreload: handleStartPreload,
      onCancelPreload: handleCancelPreload,
      onResetPreload: handleResetPreload,
      preloadConcurrency,
      onSetPreloadConcurrency: setPreloadConcurrency,
      similarToTrackId,
      onFindSimilar: setSimilarToTrackId,
      collections,
      onCreateCollection: handleCreateCollection,
      onRenameCollection: handleRenameCollection,
      onDeleteCollection: handleDeleteCollection,
      onSetCollectionColor: handleSetCollectionColor,
      onAddTracksToCollection: handleAddTracksToCollection,
      onRemoveTrackFromCollection: handleRemoveTrackFromCollection,
      shortcuts,
      onSetShortcut: handleSetShortcut,
      onResetShortcuts: handleResetShortcuts,
      appearanceSettings,
      onSetAppearance: handleSetAppearance,
      missingFolderIds,
      compactMode,
      onEnterCompactMode: handleEnterCompactMode,
      onExitCompactMode: handleExitCompactMode,
      shortcutsModalOpen,
      onOpenShortcuts: () => setShortcutsModalOpen(true),
      onCloseShortcuts: () => setShortcutsModalOpen(false),
      activeFolderId,
      setActiveFolderId,
      trackOrder,
      onReorderTracks: handleReorderTracks,
      currentTrackId,
      isPlaying,
      duration,
      togglePlayPause,
      seekTo,
      playTrackSection,
      getCurrentTime,
      selectedTrackId,
      onSelectTrack: handleSelectTrack,
      customFolders,
      customFolderTracks,
      onCreateFolder: handleCreateFolder,
      onCreateFolderFromPath: handleCreateFolderFromPath,
      onRenameFolder: handleRenameFolder,
      onDeleteFolder: handleDeleteFolder,
      onLinkFolderDirectory: handleLinkFolderDirectory,
      onUnlinkFolderDirectory: handleUnlinkFolderDirectory,
      onSetFolderColor: handleSetFolderColor,
      onReorderFolders: handleReorderFolders,
      onToggleSectionCollapsed: handleToggleSectionCollapsed,
      onSortSectionAlphabetically: handleSortSectionAlphabetically,
      folderGroups,
      onCreateFolderGroup: handleCreateFolderGroup,
      onRenameFolderGroup: handleRenameFolderGroup,
      onDeleteFolderGroup: handleDeleteFolderGroup,
      pendingDeletedGroup,
      onUndoDeleteFolderGroup: handleUndoDeleteFolderGroup,
      allTracks,
      tags,
      trackTags,
      onCreateTag: handleCreateTag,
      onDeleteTag: handleDeleteTag,
      onToggleTrackTag: handleToggleTrackTag,
      onAssignTagToTracks: handleAssignTagToTracks,
      queueTrackIds,
      queueIndex,
      shuffleEnabled,
      onPlayAll: handlePlayAll,
      onPlayNext: handlePlayNext,
      onPlayPrev: handlePlayPrev,
      onToggleShuffle: handleToggleShuffle,
      analysisTick,
      onAnalysisUpdated: handleAnalysisUpdated,
    }),
    [
      musicFolderPath,
      handleChooseFolder,
      tracks,
      isScanning,
      favoriteIds,
      handleToggleFavorite,
      handleSetFavorite,
      handleDropFiles,
      handleBatchMove,
      handleDeleteTrack,
      handleDeleteTracks,
      handleRenameTrackFile,
      trackNotes,
      handleSetTrackNote,
      trackOverrides,
      handleSetTrackOverride,
      trackSections,
      handleAddTrackSection,
      handleDeleteTrackSection,
      healthFilter,
      preloadState,
      handleStartPreload,
      handleCancelPreload,
      handleResetPreload,
      preloadConcurrency,
      setPreloadConcurrency,
      similarToTrackId,
      collections,
      handleCreateCollection,
      handleRenameCollection,
      handleDeleteCollection,
      handleSetCollectionColor,
      handleAddTracksToCollection,
      handleRemoveTrackFromCollection,
      shortcuts,
      handleSetShortcut,
      handleResetShortcuts,
      appearanceSettings,
      handleSetAppearance,
      missingFolderIds,
      compactMode,
      handleEnterCompactMode,
      handleExitCompactMode,
      shortcutsModalOpen,
      activeFolderId,
      trackOrder,
      handleReorderTracks,
      currentTrackId,
      isPlaying,
      duration,
      togglePlayPause,
      seekTo,
      playTrackSection,
      getCurrentTime,
      selectedTrackId,
      handleSelectTrack,
      customFolders,
      customFolderTracks,
      handleCreateFolder,
      handleCreateFolderFromPath,
      handleRenameFolder,
      handleDeleteFolder,
      handleLinkFolderDirectory,
      handleUnlinkFolderDirectory,
      handleSetFolderColor,
      handleReorderFolders,
      handleToggleSectionCollapsed,
      handleSortSectionAlphabetically,
      folderGroups,
      handleCreateFolderGroup,
      handleRenameFolderGroup,
      handleDeleteFolderGroup,
      pendingDeletedGroup,
      handleUndoDeleteFolderGroup,
      allTracks,
      tags,
      trackTags,
      handleCreateTag,
      handleDeleteTag,
      handleToggleTrackTag,
      handleAssignTagToTracks,
      queueTrackIds,
      queueIndex,
      shuffleEnabled,
      handlePlayAll,
      handlePlayNext,
      handlePlayPrev,
      handleToggleShuffle,
      analysisTick,
      handleAnalysisUpdated,
    ]
  );

  // Tracks which panels are actually open right now, so the Windows menu
  // (see WindowsMenu.jsx) can show a checkmark next to open ones and
  // reopen closed ones — kept in sync with dockview's real panel list via
  // its layout-change event, rather than tracked manually every place a
  // panel might get added/removed.
  const [openPanelIds, setOpenPanelIds] = useState(() => new Set());

  const onDockviewReady = useCallback((event) => {
    const api = event.api;
    dockApiRef.current = api;

    function syncOpenPanels() {
      setOpenPanelIds(new Set(api.panels.map((p) => p.id)));
    }
    api.onDidLayoutChange(syncOpenPanels);

    const existingPresets = loadLayoutPresets();
    const savedDefaultName = loadDefaultLayoutName();
    const defaultLayoutJson =
      savedDefaultName && existingPresets[savedDefaultName]
        ? existingPresets[savedDefaultName]
        : null;

    let recoveredFromBrokenLayout = false;

    if (defaultLayoutJson) {
      // A default layout was explicitly set — restore it instead of the
      // hardcoded first-launch arrangement below.
      try {
        api.fromJSON(defaultLayoutJson);
        syncOpenPanels();
        return;
      } catch (err) {
        console.error("Failed to restore saved layout, falling back to default:", err);
        recoveredFromBrokenLayout = true;
        // fromJSON can partially succeed before throwing partway through
        // (e.g. a saved layout referencing a panel shape from an older
        // version of Disc) — leaving some panels already created. Clear
        // everything first so the fallback below doesn't try to create a
        // panel id that already exists, which would throw again — this
        // time uncaught, since it'd be outside this try/catch.
        try {
          [...api.panels].forEach((p) => p.api.close());
        } catch (cleanupErr) {
          console.error("Couldn't fully clean up after a failed layout restore:", cleanupErr);
        }
      }
    }

    // Defensively wrapped — this is the fallback path itself, so if
    // *this* somehow throws too (a future incompatibility, corrupted
    // folderGroups data, etc.), the rest of the app still comes up rather
    // than leaving a fully blank window with no way to recover.
    try {
      const primaryGroup = folderGroups.find((g) => g.id === "primary") || {
        id: "primary",
        name: "Sounds",
      };

      api.addPanel({
        id: "sidebar",
        component: "folderGroup",
        title: primaryGroup.name,
        params: { groupId: "primary" },
      });

      api.addPanel({
        id: "collections",
        component: "collections",
        title: "Collections",
        position: { referencePanel: "sidebar", direction: "below" },
      });

      api.addPanel({
        id: "library",
        component: "library",
        title: "Library",
        position: { referencePanel: "sidebar", direction: "right" },
      });

      api.addPanel({
        id: "details",
        component: "details",
        title: "Details",
        position: { referencePanel: "library", direction: "right" },
      });

      // Any other folder groups that already existed (created in an
      // earlier session, before a default layout was ever saved) each get
      // their own panel too, stacked next to the primary one to start —
      // fully draggable/dockable anywhere from here on, same as
      // everything else.
      folderGroups
        .filter((g) => g.id !== "primary")
        .forEach((group) => {
          api.addPanel({
            id: `folder-group-${group.id}`,
            component: "folderGroup",
            title: group.name,
            params: { groupId: group.id },
            position: { referencePanel: "sidebar", direction: "within" },
          });
        });

      // Give the library the lion's share of the width on first launch,
      // and split the left column so Folders keeps most of the vertical
      // space with Collections underneath — both independently
      // draggable/resizable/dockable from here on, this is just the
      // starting layout.
      const sidebarPanel = api.getPanel("sidebar");
      const collectionsPanel = api.getPanel("collections");
      const detailsPanel = api.getPanel("details");
      sidebarPanel?.api.setSize({ width: 220 });
      collectionsPanel?.api.setSize({ height: 220 });
      detailsPanel?.api.setSize({ width: 300 });

      // First-ever launch (or recovering from a saved layout that no
      // longer restores cleanly): capture this as the "Default" layout
      // preset so there's always something to fall back to, and mark it
      // as the layout that auto-loads. Without the recoveredFromBrokenLayout
      // check here, a broken saved layout would silently repeat this exact
      // same failed-restore-then-fallback cycle on every single future
      // launch, since a "Default" entry already existing (even a broken
      // one) would otherwise skip this self-healing step entirely.
      if (Object.keys(existingPresets).length === 0 || recoveredFromBrokenLayout) {
        existingPresets.Default = api.toJSON();
        saveLayoutPresets(existingPresets);
        setLayoutPresetNames(Object.keys(existingPresets));
        saveDefaultLayoutName("Default");
        setDefaultLayoutName("Default");
      }
    } catch (err) {
      console.error("Failed to set up the default panel layout:", err);
    }

    syncOpenPanels();
    // Empty deps is intentional: dockview's onReady fires exactly once,
    // when the dockview instance first initializes — it isn't
    // re-subscribed on every render the way a normal prop callback would
    // be. This closure correctly captures folderGroups (and everything
    // else it references) as of that one mount-time call, which is
    // exactly the value already loaded from localStorage by then. Adding
    // folderGroups here to satisfy an exhaustive-deps lint rule would
    // change this callback's identity on every folder-group change,
    // which — if dockview ever treated a changed onReady as "call it
    // again" — would be worse: the entire panel-setup/restore logic
    // re-running on every folder edit, not just once at startup.
  }, []);

  const handleSaveLayout = useCallback((name) => {
    if (!dockApiRef.current) return;
    const presets = loadLayoutPresets();
    presets[name] = dockApiRef.current.toJSON();
    saveLayoutPresets(presets);
    setLayoutPresetNames(Object.keys(presets));
  }, []);

  const handleLoadLayout = useCallback(
    (name) => {
      const api = dockApiRef.current;
      if (!api) return;
      const presets = loadLayoutPresets();
      if (!presets[name]) return;
      try {
        api.fromJSON(presets[name]);
      } catch (err) {
        console.error(`Failed to load layout "${name}" — it may be from an older version:`, err);
        try {
          [...api.panels].forEach((p) => p.api.close());
          // Rebuild a minimal working layout rather than leaving an empty
          // workspace — same core panels a fresh install starts with.
          const primaryGroup = folderGroups.find((g) => g.id === "primary") || {
            id: "primary",
            name: "Sounds",
          };
          api.addPanel({
            id: "sidebar",
            component: "folderGroup",
            title: primaryGroup.name,
            params: { groupId: "primary" },
          });
          api.addPanel({
            id: "library",
            component: "library",
            title: "Library",
            position: { referencePanel: "sidebar", direction: "right" },
          });
          api.addPanel({
            id: "details",
            component: "details",
            title: "Details",
            position: { referencePanel: "library", direction: "right" },
          });
        } catch (cleanupErr) {
          console.error("Couldn't fully recover after a failed layout load:", cleanupErr);
        }
      }
    },
    [folderGroups]
  );

  // Every panel Disc knows how to create, whether or not it's currently
  // open — used by the Windows menu to show a checkmark for open ones and
  // reconstruct closed ones on demand (closing a panel via its own × was
  // otherwise a dead end short of reloading an entire saved layout).
  const knownPanels = useMemo(() => {
    const primaryGroup = folderGroups.find((g) => g.id === "primary");
    return [
      { id: "library", title: "Library", component: "library" },
      { id: "details", title: "Details", component: "details" },
      { id: "collections", title: "Collections", component: "collections" },
      {
        id: "sidebar",
        title: primaryGroup?.name || "Sounds",
        component: "folderGroup",
        params: { groupId: "primary" },
      },
      ...folderGroups
        .filter((g) => g.id !== "primary")
        .map((g) => ({
          id: `folder-group-${g.id}`,
          title: g.name,
          component: "folderGroup",
          params: { groupId: g.id },
        })),
      { id: "pomodoro", title: "Pomodoro Timer", component: "pomodoro" },
    ];
  }, [folderGroups]);

  const handleTogglePanel = useCallback(
    (panelId) => {
      const api = dockApiRef.current;
      if (!api) return;
      const existing = api.getPanel(panelId);
      if (existing) {
        existing.api.close();
        return;
      }
      const known = knownPanels.find((p) => p.id === panelId);
      if (!known) return;
      api.addPanel({
        id: known.id,
        component: known.component,
        title: known.title,
        params: known.params,
      });
    },
    [knownPanels]
  );

  const handleDeleteLayout = useCallback((name) => {
    const presets = loadLayoutPresets();
    delete presets[name];
    saveLayoutPresets(presets);
    setLayoutPresetNames(Object.keys(presets));
    // If the deleted preset was the default, there's nothing sensible left
    // to fall back to — clear it so startup uses the hardcoded layout
    // instead of silently pointing at a preset that no longer exists.
    setDefaultLayoutName((current) => {
      if (current !== name) return current;
      saveDefaultLayoutName(null);
      return null;
    });
  }, []);

  const handleSetDefaultLayout = useCallback((name) => {
    saveDefaultLayoutName(name);
    setDefaultLayoutName(name);
  }, []);

  // Layout presets are stored keyed by their own name (there's no
  // separate id), so renaming one is a genuine rekey — move the saved
  // JSON to the new key and drop the old one. Refuses (rather than
  // silently overwriting) if something's already saved under the new
  // name, since that would destroy a different preset without asking.
  const handleRenameLayout = useCallback(
    (oldName, newName) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      const presets = loadLayoutPresets();
      if (!(oldName in presets) || trimmed in presets) return;

      const json = presets[oldName];
      delete presets[oldName];
      presets[trimmed] = json;
      saveLayoutPresets(presets);
      setLayoutPresetNames(Object.keys(presets));

      if (defaultLayoutName === oldName) {
        saveDefaultLayoutName(trimmed);
        setDefaultLayoutName(trimmed);
      }
    },
    [defaultLayoutName]
  );

  return (
    <PomodoroProvider>
      <div className="app">
        {!compactMode && (
          <TitleBar
          theme={theme}
          onThemeChange={setTheme}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          layoutPresetNames={layoutPresetNames}
          onSaveLayout={handleSaveLayout}
          onLoadLayout={handleLoadLayout}
          onDeleteLayout={handleDeleteLayout}
          onRenameLayout={handleRenameLayout}
          defaultLayoutName={defaultLayoutName}
          onSetDefaultLayout={handleSetDefaultLayout}
          volume={volume}
          onVolumeChange={setVolume}
          onThemePreviewCancel={() => applyThemeById(theme)}
          onToggleCompactMode={handleEnterCompactMode}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenHealth={() => setHealthModalOpen(true)}
          onOpenConvert={() => setConvertModalOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          preloadState={preloadState}
          knownPanels={knownPanels}
          openPanelIds={openPanelIds}
          onTogglePanel={handleTogglePanel}
        />
      )}
      <div className="app__dock">
        <DiscContext.Provider value={discContextValue}>
          {compactMode ? (
            <CompactView />
          ) : (
            <DockviewReact
              components={dockComponents}
              onReady={onDockviewReady}
              className="dockview-theme-disc"
            />
          )}
          {shortcutsModalOpen && (
            <ShortcutsModal onClose={() => setShortcutsModalOpen(false)} />
          )}
          {settingsModalOpen && (
            <SettingsModal onClose={() => setSettingsModalOpen(false)} />
          )}
          {healthModalOpen && (
            <LibraryHealthModal onClose={() => setHealthModalOpen(false)} />
          )}
          {convertModalOpen && (
            <ConvertModal onClose={() => setConvertModalOpen(false)} />
          )}
          {pendingOggLink && (
            <OggLinkPromptModal
              pendingOggLink={pendingOggLink}
              onConvertAndLink={handleConvertAndLink}
              onLinkWithoutConverting={handleLinkWithoutConverting}
              onCancelOggLinkPrompt={handleCancelOggLinkPrompt}
              onUnlinkPendingOggFolder={handleUnlinkPendingOggFolder}
            />
          )}
          {commandPaletteOpen && (
            <CommandPalette
              onClose={() => setCommandPaletteOpen(false)}
              pinned={pinned}
              onTogglePin={handleTogglePin}
              onOpenSettings={() => setSettingsModalOpen(true)}
              onOpenShortcuts={() => setShortcutsModalOpen(true)}
              onOpenHealth={() => setHealthModalOpen(true)}
              onToggleCompactMode={compactMode ? handleExitCompactMode : handleEnterCompactMode}
            />
          )}
          {pendingDeletedGroup && (
            <div className="undo-toast">
              <span>
                Deleted "{pendingDeletedGroup.group.name}" (
                {pendingDeletedGroup.folders.length} folder
                {pendingDeletedGroup.folders.length === 1 ? "" : "s"})
              </span>
              <button className="undo-toast__button" onClick={handleUndoDeleteFolderGroup}>
                Undo
              </button>
            </div>
          )}
          {showSavedToast && (
            <div className="undo-toast">
              <span>Saved</span>
            </div>
          )}
        </DiscContext.Provider>
      </div>
    </div>
    </PomodoroProvider>
  );
}
