import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import TitleBar from "./components/TitleBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LibraryPanel from "./components/LibraryPanel.jsx";
import NowPlayingBar from "./components/NowPlayingBar.jsx";
import { DiscContext } from "./context/DiscContext.jsx";
import { toMediaUrl } from "./utils/paths.js";
import "./App.css";

const FOLDERS_KEY = "lite.folders";
const FAVORITES_KEY = "disc.favorites";
const VOLUME_KEY = "disc.volume";
const SHUFFLE_KEY = "disc.shuffle";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function loadFolders() {
  const parsed = loadJson(FOLDERS_KEY, []);
  return Array.isArray(parsed) ? parsed.filter((f) => f && f.id && f.folderPath) : [];
}

function folderNameFromPath(p) {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function App() {
  // --- Folders + tracks ----------------------------------------------
  const [folders, setFolders] = useState(loadFolders);
  const [folderTracks, setFolderTracks] = useState({});
  const [missingFolderIds, setMissingFolderIds] = useState(() => new Set());
  const [activeFolderId, setActiveFolderId] = useState("all"); // "all" | "favorites" | a folder id
  const [favoriteIds, setFavoriteIds] = useState(() => {
    const parsed = loadJson(FAVORITES_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  });
  const [pinned, setPinned] = useState(false);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const watchedIdsRef = useRef(new Set());

  useEffect(() => {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  // Scans one folder. A null result means the directory itself is
  // unreachable (an unplugged drive, say) — keep the last-known tracks and
  // just flag it, rather than making them vanish.
  const scanOne = useCallback(async (folder) => {
    if (!window.disc || !folder?.folderPath) return;
    const found = await window.disc.scanFolder(folder.folderPath);
    setMissingFolderIds((prev) => {
      const isMissing = found === null;
      if (prev.has(folder.id) === isMissing) return prev;
      const next = new Set(prev);
      if (isMissing) next.add(folder.id);
      else next.delete(folder.id);
      return next;
    });
    if (found !== null) setFolderTracks((prev) => ({ ...prev, [folder.id]: found }));
  }, []);

  const scanAll = useCallback(() => {
    foldersRef.current.forEach((f) => scanOne(f));
  }, [scanOne]);

  // Keep every folder scanned + watched, and stop watching removed ones.
  useEffect(() => {
    if (!window.disc) return;
    const currentIds = new Set(folders.map((f) => f.id));
    folders.forEach((folder) => {
      if (watchedIdsRef.current.has(folder.id)) return;
      scanOne(folder);
      window.disc.watchFolder(folder.id, folder.folderPath);
    });
    for (const id of watchedIdsRef.current) {
      if (!currentIds.has(id)) {
        window.disc.unwatchFolder(id);
        setFolderTracks((prev) => {
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
    watchedIdsRef.current = currentIds;
  }, [folders, scanOne]);

  // A watched folder changed on disk — rescan just that one.
  useEffect(() => {
    if (!window.disc) return;
    return window.disc.onFolderChanged((key) => {
      const folder = foldersRef.current.find((f) => f.id === key);
      if (folder) scanOne(folder);
    });
  }, [scanOne]);

  const allTracks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const f of folders) {
      for (const t of folderTracks[f.id] || []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push({ ...t, folderId: f.id });
      }
    }
    return out;
  }, [folders, folderTracks]);
  const allTracksRef = useRef(allTracks);
  allTracksRef.current = allTracks;

  const handleAddFolders = useCallback(async () => {
    if (!window.disc) return;
    const picked = await window.disc.chooseFolders();
    if (!picked || picked.length === 0) return;
    const existing = new Set(foldersRef.current.map((f) => f.folderPath.toLowerCase()));
    const fresh = picked
      .filter((p) => !existing.has(p.toLowerCase()))
      .map((p) => ({
        id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: folderNameFromPath(p),
        folderPath: p,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    if (fresh.length === 0) return;
    setFolders((prev) => [...prev, ...fresh]);
    if (fresh.length === 1) setActiveFolderId(fresh[0].id);
  }, []);

  const handleRemoveFolder = useCallback((id) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setActiveFolderId((cur) => (cur === id ? "all" : cur));
  }, []);

  const handleRenameFolder = useCallback((id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
  }, []);

  const handleToggleFavorite = useCallback((trackId) => {
    setFavoriteIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  }, []);

  const handleDropFiles = useCallback(
    async (sourcePaths, folderId) => {
      const folder = foldersRef.current.find((f) => f.id === folderId);
      if (!folder || !window.disc || sourcePaths.length === 0) return;
      await window.disc.copyFilesIntoFolder(folder.folderPath, sourcePaths);
      scanOne(folder);
    },
    [scanOne]
  );

  const handleDeleteTrack = useCallback(
    async (filePath) => {
      if (!window.disc || !filePath) return;
      await window.disc.deleteFile(filePath);
      scanAll();
    },
    [scanAll]
  );

  // A track's id *is* its file path, so renaming the file changes its id —
  // carry its favorite status across or it would silently disappear.
  const handleRenameTrackFile = useCallback(
    async (track, newStem) => {
      if (!window.disc || !track || !newStem?.trim()) return { success: false };
      const result = await window.disc.renameTrackFile(track.filePath, newStem.trim());
      if (!result?.success) return result;
      if (track.id !== result.newPath) {
        setFavoriteIds((prev) => prev.map((id) => (id === track.id ? result.newPath : id)));
      }
      scanAll();
      return result;
    },
    [scanAll]
  );

  // --- Playback --------------------------------------------------------
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }
  const currentTrackRef = useRef(null);
  // Guards against a slow-to-resolve loadAndPlay finishing after a newer
  // one has taken over (clicking through tracks quickly).
  const loadRequestIdRef = useRef(0);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const raw = localStorage.getItem(VOLUME_KEY);
    return raw !== null ? Number(raw) : 0.8;
  });
  const [queueTrackIds, setQueueTrackIds] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [shuffleEnabled, setShuffleEnabled] = useState(
    () => localStorage.getItem(SHUFFLE_KEY) === "true"
  );
  const queueRef = useRef({ ids: [], index: -1 });
  const playNextRef = useRef(() => {});

  useEffect(() => {
    localStorage.setItem(SHUFFLE_KEY, String(shuffleEnabled));
  }, [shuffleEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      playNextRef.current();
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onError = () => console.error("Disc Lite: audio playback error", audio.error);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    const timer = setTimeout(() => localStorage.setItem(VOLUME_KEY, String(volume)), 200);
    return () => clearTimeout(timer);
  }, [volume]);

  const loadAndPlay = useCallback(async (track, seekFraction = 0) => {
    if (!window.disc) return;
    const audio = audioRef.current;
    const isNewTrack = currentTrackRef.current?.id !== track.id;

    if (isNewTrack) {
      const requestId = ++loadRequestIdRef.current;
      // Streams straight off disk via the disc-media:// protocol (see
      // electron/main.js) rather than reading the whole file over IPC.
      audio.src = toMediaUrl(track.filePath);
      currentTrackRef.current = track;
      setCurrentTrackId(track.id);

      // MP3s without a duration header report Infinity at loadedmetadata
      // and only settle on a real value at durationchange; seeking needs a
      // real duration. canplay is a bounded fallback for unresolvable ones.
      await new Promise((resolve) => {
        function checkReady() {
          if (Number.isFinite(audio.duration)) done();
        }
        function done() {
          audio.removeEventListener("durationchange", checkReady);
          audio.removeEventListener("canplay", done);
          resolve();
        }
        if (Number.isFinite(audio.duration) && audio.readyState >= 1) {
          resolve();
          return;
        }
        audio.addEventListener("durationchange", checkReady);
        audio.addEventListener("canplay", done, { once: true });
      });

      if (loadRequestIdRef.current !== requestId) return;
    }

    // Only seek on a real position change — re-seeking to 0 on a fresh
    // track forces an MP3 decode restart, audible as a repeated first beat.
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
      // Interrupted by a rapid follow-up call; safe to ignore.
    }
  }, []);

  const togglePlayPause = useCallback(
    (track, { forceFromStart = false } = {}) => {
      const audio = audioRef.current;
      const isSameTrack = currentTrackRef.current?.id === track.id;
      if (isSameTrack && forceFromStart) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      if (isSameTrack) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      } else {
        loadAndPlay(track, 0);
      }
    },
    [loadAndPlay]
  );

  const seekTo = useCallback(
    (track, fraction) => {
      const audio = audioRef.current;
      if (currentTrackRef.current?.id === track.id) {
        if (Number.isFinite(audio.duration)) audio.currentTime = fraction * audio.duration;
        if (audio.paused) audio.play().catch(() => {});
      } else {
        loadAndPlay(track, fraction);
      }
    },
    [loadAndPlay]
  );

  const getCurrentTime = useCallback(() => audioRef.current?.currentTime || 0, []);

  const seekRelative = useCallback((deltaSeconds) => {
    const audio = audioRef.current;
    if (!currentTrackRef.current || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + deltaSeconds));
  }, []);

  // Starts a queue from a list of track ids (whatever the library is
  // currently showing) and plays the first one.
  const handlePlayAll = useCallback(
    (trackIds, shuffle) => {
      if (!trackIds || trackIds.length === 0) return;
      const ordered = shuffle ? shuffleArray(trackIds) : [...trackIds];
      // Don't let a fresh shuffle open on the track already playing — that
      // reads as "it repeated".
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
      // With Shuffle on, the end of the queue reshuffles and keeps going so
      // a shuffled playlist can run indefinitely.
      if (shuffleEnabled) {
        const reshuffled = shuffleArray(ids);
        if (reshuffled.length > 1 && reshuffled[0] === ids[index]) {
          [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
        }
        queueRef.current = { ids: reshuffled, index: 0 };
        setQueueTrackIds(reshuffled);
        setQueueIndex(0);
        const track = allTracksRef.current.find((t) => t.id === reshuffled[0]);
        if (track) loadAndPlay(track, 0);
        return;
      }
      queueRef.current = { ids: [], index: -1 };
      setQueueTrackIds([]);
      setQueueIndex(-1);
      return;
    }
    const nextTrack = allTracksRef.current.find((t) => t.id === ids[nextIndex]);
    queueRef.current = { ids, index: nextIndex };
    setQueueIndex(nextIndex);
    if (nextTrack) loadAndPlay(nextTrack, 0);
  }, [loadAndPlay, shuffleEnabled]);
  playNextRef.current = handlePlayNext;

  const handlePlayPrev = useCallback(() => {
    const { ids, index } = queueRef.current;
    if (!ids || ids.length === 0 || index <= 0) return;
    const prevIndex = index - 1;
    const prevTrack = allTracksRef.current.find((t) => t.id === ids[prevIndex]);
    queueRef.current = { ids, index: prevIndex };
    setQueueIndex(prevIndex);
    if (prevTrack) loadAndPlay(prevTrack, 0);
  }, [loadAndPlay]);

  const handleToggleShuffle = useCallback(() => setShuffleEnabled((v) => !v), []);

  // Keyboard: Space play/pause, ←/→ seek 5s, ↑/↓ volume, S shuffle,
  // Ctrl+F or / jumps to search. Ignored while typing in a field.
  useEffect(() => {
    function isTyping() {
      const el = document.activeElement;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    }
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.querySelector(".library-toolbar__search input")?.focus();
        return;
      }
      if (isTyping()) return;
      if (e.key === " ") {
        e.preventDefault();
        if (currentTrackRef.current) togglePlayPause(currentTrackRef.current);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume((v) => Math.min(1, Math.round((v + 0.05) * 100) / 100));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume((v) => Math.max(0, Math.round((v - 0.05) * 100) / 100));
      } else if (e.key.toLowerCase() === "s") {
        handleToggleShuffle();
      } else if (e.key === "/") {
        e.preventDefault();
        document.querySelector(".library-toolbar__search input")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlayPause, seekRelative, handleToggleShuffle]);

  const handleTogglePin = useCallback(async () => {
    if (!window.disc) return;
    const result = await window.disc.toggleAlwaysOnTop(!pinned);
    setPinned(Boolean(result));
  }, [pinned]);

  // The window-snap preview (electron/main.js) tints itself with the
  // theme's accent — Disc Lite's is always white.
  useEffect(() => {
    window.disc?.setSnapAccentColor("#ffffff");
  }, []);

  const discContextValue = useMemo(
    () => ({
      folders,
      folderTracks,
      allTracks,
      missingFolderIds,
      activeFolderId,
      setActiveFolderId,
      favoriteIds,
      onToggleFavorite: handleToggleFavorite,
      onAddFolders: handleAddFolders,
      onRemoveFolder: handleRemoveFolder,
      onRenameFolder: handleRenameFolder,
      onDropFiles: handleDropFiles,
      onDeleteTrack: handleDeleteTrack,
      onRenameTrackFile: handleRenameTrackFile,
      currentTrackId,
      isPlaying,
      duration,
      togglePlayPause,
      seekTo,
      getCurrentTime,
      volume,
      setVolume,
      queueTrackIds,
      queueIndex,
      shuffleEnabled,
      onPlayAll: handlePlayAll,
      onPlayNext: handlePlayNext,
      onPlayPrev: handlePlayPrev,
      onToggleShuffle: handleToggleShuffle,
    }),
    [
      folders,
      folderTracks,
      allTracks,
      missingFolderIds,
      activeFolderId,
      favoriteIds,
      handleToggleFavorite,
      handleAddFolders,
      handleRemoveFolder,
      handleRenameFolder,
      handleDropFiles,
      handleDeleteTrack,
      handleRenameTrackFile,
      currentTrackId,
      isPlaying,
      duration,
      togglePlayPause,
      seekTo,
      getCurrentTime,
      volume,
      queueTrackIds,
      queueIndex,
      shuffleEnabled,
      handlePlayAll,
      handlePlayNext,
      handlePlayPrev,
      handleToggleShuffle,
    ]
  );

  return (
    <DiscContext.Provider value={discContextValue}>
      <div className="app">
        <TitleBar pinned={pinned} onTogglePin={handleTogglePin} />
        <div className="app__body">
          <Sidebar />
          <main className="app__main">
            <LibraryPanel />
          </main>
        </div>
        <NowPlayingBar />
      </div>
    </DiscContext.Provider>
  );
}
