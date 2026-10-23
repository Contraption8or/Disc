import { useEffect, useMemo, useRef, useState } from "react";
import LibraryToolbar from "./LibraryToolbar.jsx";
import TrackRow from "./TrackRow.jsx";
import { useDisc } from "../context/DiscContext.jsx";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import Icon from "./Icon.jsx";
import "./LibraryPanel.css";

// Must match the fixed row height set in TrackRow.css — the virtualizer
// needs a stable number to do its scroll-position math.
const ROW_HEIGHT = 50;

export default function LibraryPanel() {
  const {
    folders,
    folderTracks,
    allTracks,
    missingFolderIds,
    activeFolderId,
    favoriteIds,
    onToggleFavorite,
    onAddFolders,
    onDropFiles,
    onPlayAll,
  } = useDisc();

  const [query, setQuery] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const scrollContainerRef = useRef(null);

  const activeFolder = folders.find((f) => f.id === activeFolderId) || null;
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const filteredTracks = useMemo(() => {
    // A search always spans the whole library, whatever's selected.
    if (isSearching) {
      const q = trimmedQuery.toLowerCase();
      return allTracks.filter((t) => t.fileName.toLowerCase().includes(q));
    }
    if (activeFolderId === "favorites") {
      const favs = new Set(favoriteIds);
      return allTracks.filter((t) => favs.has(t.id));
    }
    if (activeFolder) {
      return (folderTracks[activeFolder.id] || []).map((t) => ({ ...t, folderId: activeFolder.id }));
    }
    return allTracks;
  }, [isSearching, trimmedQuery, allTracks, activeFolderId, activeFolder, folderTracks, favoriteIds]);

  const resultSummary = isSearching
    ? `${filteredTracks.length} result${filteredTracks.length === 1 ? "" : "s"} for "${trimmedQuery}"`
    : null;

  const range = useVirtualRows(scrollContainerRef, filteredTracks.length, ROW_HEIGHT);
  const visibleTracks = filteredTracks.slice(range.start, range.end);

  // Back to the top whenever the view or search changes.
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [activeFolderId, query]);

  // Only react to drags that positively carry real OS files, so nothing
  // else dragged across the window gets swallowed here.
  function handleDragEnter(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDraggingOver(true);
  }

  function handleDragLeave(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  }

  function handleDragOver(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }

  function handleDrop(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (!activeFolder || !window.disc) return;
    const paths = Array.from(e.dataTransfer.files)
      .filter((f) => /\.(mp3|wav|ogg|mov)$/i.test(f.name))
      .map((f) => window.disc.getPathForFile(f))
      .filter(Boolean);
    if (paths.length > 0) onDropFiles(paths, activeFolder.id);
  }

  async function handleImportFiles() {
    if (!window.disc || !activeFolder) return;
    const paths = await window.disc.chooseMp3Files();
    if (paths.length > 0) onDropFiles(paths, activeFolder.id);
  }

  const ids = () => filteredTracks.map((t) => t.id);
  const folderMissing = activeFolder && missingFolderIds.has(activeFolder.id);

  let emptyState = null;
  if (folders.length === 0) {
    emptyState = {
      icon: "folder",
      title: "No folders yet",
      text: "Add the folders where you keep your music and sound effects — they'll all show up in the column on the left.",
      action: { label: "Add Folders", onClick: onAddFolders },
    };
  } else if (filteredTracks.length === 0) {
    if (isSearching) {
      emptyState = { icon: "search", title: "No matches", text: `Nothing matches "${trimmedQuery}".` };
    } else if (activeFolderId === "favorites") {
      emptyState = {
        icon: "heartOutline",
        title: "No favorites yet",
        text: "Click the heart on a track to add it here.",
      };
    } else {
      emptyState = {
        icon: "musicNote",
        title: "No tracks found",
        text: activeFolder
          ? "Drop mp3, wav, or mov files in here, or use Import."
          : "Nothing in your folders yet.",
      };
    }
  }

  return (
    <div
      className={"library-panel" + (isDraggingOver ? " library-panel--drag-over" : "")}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <LibraryToolbar
        query={query}
        onQueryChange={setQuery}
        resultSummary={resultSummary}
        onPlayAll={() => onPlayAll(ids(), false)}
        onShufflePlay={() => onPlayAll(ids(), true)}
        playDisabled={filteredTracks.length === 0}
        onImportFiles={handleImportFiles}
        importDisabled={!activeFolder}
      />

      {folderMissing && (
        <div className="library-panel__missing-banner">
          <Icon name="warning" size={14} style={{ marginRight: 6 }} />
          This folder can't be reached right now (an unplugged or network drive, maybe). Showing
          the last-known tracks, grayed out until it's back.
        </div>
      )}

      <div className="library-panel__body" ref={scrollContainerRef}>
        {emptyState ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon name={emptyState.icon} size={28} />
              </div>
              <div className="library-empty__title">{emptyState.title}</div>
              <p className="library-empty__text">{emptyState.text}</p>
              {emptyState.action && (
                <button className="library-empty__button" onClick={emptyState.action.onClick}>
                  {emptyState.action.label}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="library-list" style={{ height: filteredTracks.length * ROW_HEIGHT }}>
            <div
              className="library-list__viewport"
              style={{ transform: `translateY(${range.start * ROW_HEIGHT}px)` }}
            >
              {visibleTracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  isFavorite={favoriteIds.includes(track.id)}
                  onToggleFavorite={onToggleFavorite}
                  isMissing={missingFolderIds.has(track.folderId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {isDraggingOver && (
        <div className="library-panel__drop-overlay">
          <div className="library-panel__drop-message">
            {activeFolder ? `Drop to add to ${activeFolder.name}` : "Pick a folder first"}
          </div>
        </div>
      )}
    </div>
  );
}
