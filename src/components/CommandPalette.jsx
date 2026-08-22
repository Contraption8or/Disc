import { useEffect, useMemo, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { stripExtension } from "../utils/format.js";
import "./CommandPalette.css";

export default function CommandPalette({
  onClose,
  pinned,
  onTogglePin,
  onOpenSettings,
  onOpenShortcuts,
  onOpenHealth,
  onToggleCompactMode,
}) {
  const {
    allTracks,
    customFolders,
    collections,
    setActiveFolderId,
    onSelectTrack,
    togglePlayPause,
    onPlayAll,
    onChooseFolder,
  } = useDisc();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const staticActions = useMemo(
    () => [
      { id: "act-settings", type: "action", label: "Open Settings", run: onOpenSettings },
      { id: "act-shortcuts", type: "action", label: "Show Keyboard Shortcuts", run: onOpenShortcuts },
      { id: "act-health", type: "action", label: "Open Library Health", run: onOpenHealth },
      { id: "act-compact", type: "action", label: "Toggle Compact Mode", run: onToggleCompactMode },
      {
        id: "act-pin",
        type: "action",
        label: pinned ? "Unpin from Top" : "Pin on Top",
        run: onTogglePin,
      },
      { id: "act-choose-folder", type: "action", label: "Choose Music Folder…", run: onChooseFolder },
      {
        id: "act-play-all",
        type: "action",
        label: "Play All Tracks",
        run: () => onPlayAll(allTracks.map((t) => t.id), false),
      },
      {
        id: "act-shuffle-all",
        type: "action",
        label: "Shuffle All Tracks",
        run: () => onPlayAll(allTracks.map((t) => t.id), true),
      },
    ],
    [
      onOpenSettings,
      onOpenShortcuts,
      onOpenHealth,
      onToggleCompactMode,
      onTogglePin,
      pinned,
      onChooseFolder,
      onPlayAll,
      allTracks,
    ]
  );

  const folderItems = useMemo(
    () => [
      { id: "favorites", type: "folder", label: 'Go to "Favorites"' },
      ...customFolders
        .filter((f) => f.type !== "divider")
        .map((f) => ({ id: f.id, type: "folder", label: `Go to "${f.name}"` })),
    ],
    [customFolders]
  );

  const collectionItems = useMemo(
    () =>
      collections.map((c) => ({
        id: c.id,
        type: "collection",
        label: `Go to Collection "${c.name}"`,
      })),
    [collections]
  );

  const results = useMemo(() => {
    const staticItems = [...staticActions, ...folderItems, ...collectionItems];
    const q = query.trim().toLowerCase();
    if (!q) return staticItems.slice(0, 12);

    const matches = staticItems.filter((item) => item.label.toLowerCase().includes(q));
    const trackMatches = allTracks
      .filter((t) => t.fileName.toLowerCase().includes(q))
      .slice(0, 20)
      .map((t) => ({ id: t.id, type: "track", label: stripExtension(t.fileName), track: t }));
    return [...matches, ...trackMatches].slice(0, 30);
  }, [query, staticActions, folderItems, collectionItems, allTracks]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function runItem(item) {
    if (item.type === "action") item.run();
    else if (item.type === "folder" || item.type === "collection") setActiveFolderId(item.id);
    else if (item.type === "track") {
      onSelectTrack(item.track);
      togglePlayPause(item.track);
    }
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) runItem(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="command-palette__backdrop">
      <div className="command-palette" ref={rootRef}>
        <input
          ref={inputRef}
          className="command-palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command, folder, collection, or track name…"
        />
        <div className="command-palette__results">
          {results.length === 0 && (
            <div className="command-palette__empty">No matches.</div>
          )}
          {results.map((item, i) => (
            <button
              key={item.type + item.id}
              className={
                "command-palette__result" +
                (i === selectedIndex ? " command-palette__result--active" : "")
              }
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => runItem(item)}
            >
              <span className="command-palette__result-type">{item.type}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
