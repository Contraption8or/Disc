import { useEffect, useMemo, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { filterTracksByQuery } from "../utils/search.js";
import { stripExtension } from "../utils/format.js";
import Dropdown from "./Dropdown.jsx";
import Icon from "./Icon.jsx";
import NowPlayingBar from "./NowPlayingBar.jsx";
import "./CompactView.css";

export default function CompactView() {
  const {
    allTracks,
    tags,
    trackTags,
    togglePlayPause,
    onExitCompactMode,
    customFolders,
    customFolderTracks,
    favoriteIds,
    onPlayAll,
    volume,
    onVolumeChange,
  } = useDisc();
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("favorites");
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef(null);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);

  useEffect(() => {
    if (!volumeOpen) return;
    function handleClickOutside(e) {
      if (volumeRef.current && !volumeRef.current.contains(e.target)) setVolumeOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [volumeOpen]);

  useEffect(() => {
    window.disc?.isPomodoroWindowOpen().then(setPomodoroOpen);
    return window.disc?.onPomodoroWindowState(setPomodoroOpen);
  }, []);

  const volumeIcon = volume === 0 ? "volumeMute" : volume < 0.5 ? "volumeLow" : "volumeHigh";

  const results = query.trim()
    ? filterTracksByQuery(allTracks, query, tags, trackTags).slice(0, 8)
    : [];

  // Only real linked folders (skip Sections/dividers, and any folder that
  // hasn't actually been linked to a directory yet, since neither has
  // real tracks to play) — same restriction the Library panel's own
  // folder-order dragging already relies on elsewhere.
  const folderOptions = useMemo(() => {
    const options = [{ value: "favorites", label: "Favorites" }];
    customFolders
      .filter((f) => f.type !== "divider" && f.folderPath)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => options.push({ value: f.id, label: f.name }));
    return options;
  }, [customFolders]);

  const folderTrackIds = useMemo(() => {
    if (selectedFolderId === "favorites") return favoriteIds;
    return (customFolderTracks[selectedFolderId] || []).map((t) => t.id);
  }, [selectedFolderId, favoriteIds, customFolderTracks]);

  return (
    <div className="compact-view">
      <div className="compact-view__top">
        <span className="compact-view__mark">◎</span>
        <input
          className="compact-view__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks + tags…"
          autoFocus
        />
        <button
          className={
            "compact-view__exit" + (pomodoroOpen ? " compact-view__exit--active" : "")
          }
          title={
            pomodoroOpen
              ? "Close the floating Pomodoro timer"
              : "Open a small floating Pomodoro timer window — can be pinned on top of other windows"
          }
          onClick={() => window.disc?.togglePomodoroWindow()}
        >
          <Icon name="windowRestore" size={13} />
        </button>
        <button
          className="compact-view__exit"
          title="Exit compact mode"
          onClick={onExitCompactMode}
        >
          ⤢
        </button>
        <button
          className="compact-view__close"
          title="Close Disc"
          onClick={() => window.disc?.windowClose()}
        >
          ×
        </button>
      </div>

      {results.length > 0 && (
        <div className="compact-view__results">
          {results.map((track) => (
            <button
              key={track.id}
              className="compact-view__result"
              onClick={() => {
                togglePlayPause(track);
                setQuery("");
              }}
            >
              {stripExtension(track.fileName)}
            </button>
          ))}
        </div>
      )}

      <div className="compact-view__folder-row">
        <Dropdown
          className="compact-view__folder-select"
          value={selectedFolderId}
          onChange={setSelectedFolderId}
          options={folderOptions}
        />
        <button
          className="compact-view__folder-btn"
          title={
            folderTrackIds.length === 0
              ? "No tracks in this folder yet"
              : "Play this folder in order"
          }
          disabled={folderTrackIds.length === 0}
          onClick={() => onPlayAll(folderTrackIds, false)}
        >
          <Icon name="play" size={12} />
        </button>
        <button
          className="compact-view__folder-btn"
          title={
            folderTrackIds.length === 0
              ? "No tracks in this folder yet"
              : "Shuffle this folder"
          }
          disabled={folderTrackIds.length === 0}
          onClick={() => onPlayAll(folderTrackIds, true)}
        >
          <Icon name="shuffle" size={12} />
        </button>

        <div className="compact-view__volume-wrap" ref={volumeRef}>
          <button
            className={
              "compact-view__folder-btn" +
              (volumeOpen ? " compact-view__folder-btn--active" : "")
            }
            title="Volume"
            onClick={() => setVolumeOpen((v) => !v)}
          >
            <Icon name={volumeIcon} size={13} />
          </button>
          {volumeOpen && (
            <div className="compact-view__volume-popover">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="compact-view__volume-slider"
                autoFocus
              />
            </div>
          )}
        </div>
      </div>

      <NowPlayingBar />
    </div>
  );
}
