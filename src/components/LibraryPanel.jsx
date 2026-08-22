import { useEffect, useMemo, useRef, useState } from "react";
import LibraryToolbar from "./LibraryToolbar.jsx";
import NowPlayingBar from "./NowPlayingBar.jsx";
import BatchActionBar from "./BatchActionBar.jsx";
import TrackRow from "./TrackRow.jsx";
import { useDisc } from "../context/DiscContext.jsx";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { isUnderDirectory } from "../utils/paths.js";
import { isTrackMissing as checkTrackMissing } from "../utils/missingTracks.js";
import { getEffectiveAnalysis } from "../audio/effectiveAnalysis.js";
import { getCachedAnalysis } from "../audio/analysis.js";
import { computeSimilarityScore } from "../audio/similarity.js";
import { findDuplicateIds } from "../audio/duplicates.js";
import { getCachedWaveform } from "../audio/waveform.js";
import { stripExtension } from "../utils/format.js";
import Icon from "./Icon.jsx";
import "./LibraryPanel.css";

// Must match the fixed row height set in TrackRow.css — the virtualizer
// needs a stable number to do its scroll-position math.
const ROW_HEIGHT = 50;
const DEFAULT_BPM_RANGE = [40, 220];

function getSortValue(track, key, overrides) {
  switch (key) {
    case "name":
      return track.fileName.toLowerCase();
    case "dateAdded":
      return track.addedAtMs ?? null;
    case "duration":
      return getCachedWaveform(track.id)?.duration ?? null;
    case "size":
      return track.sizeBytes ?? null;
    case "bpm":
      return getEffectiveAnalysis(track.id, overrides).bpm;
    default:
      return null;
  }
}

// Tracks missing a sort value (e.g. duration/BPM not decoded/analyzed yet)
// always sink to the bottom, regardless of direction, rather than being
// scattered by however 0/undefined happens to compare.
function sortTracks(list, key, dir, overrides) {
  if (key === "folder") return list;
  const withMeta = list.map((t, i) => ({ t, i, v: getSortValue(t, key, overrides) }));
  withMeta.sort((a, b) => {
    const aNull = a.v === null || a.v === undefined;
    const bNull = b.v === null || b.v === undefined;
    if (aNull && bNull) return a.i - b.i;
    if (aNull) return 1;
    if (bNull) return -1;
    const cmp = typeof a.v === "string" ? a.v.localeCompare(b.v) : a.v - b.v;
    return dir === "asc" ? cmp : -cmp;
  });
  return withMeta.map((x) => x.t);
}

// Applies a stored manual order (an array of track ids) on top of "Folder
// order" mode. Tracks with a remembered position sort by it; anything not
// in the stored order (a newly added file, most commonly) sorts after
// everything that is, keeping its natural relative position among other
// unordered tracks — Array.sort is stable in every engine Disc runs on,
// so ties (multiple Infinity entries) don't get shuffled.
function applyManualOrder(list, orderIds) {
  if (!orderIds || orderIds.length === 0) return list;
  const orderIndex = new Map(orderIds.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    return ai - bi;
  });
}

export default function LibraryPanel() {
  const {
    musicFolderPath,
    onChooseFolder,
    tracks,
    isScanning,
    favoriteIds,
    onToggleFavorite,
    onDropFiles,
    activeFolderId,
    customFolders,
    customFolderTracks,
    trackOrder,
    onReorderTracks,
    onLinkFolderDirectory,
    allTracks,
    tags,
    trackTags,
    onPlayAll,
    onSelectTrack,
    analysisTick,
    missingFolderIds,
    trackOverrides,
    healthFilter,
    onSetHealthFilter,
    collections,
    similarToTrackId,
    onFindSimilar,
  } = useDisc();

  const [query, setQuery] = useState("");
  const [bpmRange, setBpmRange] = useState(DEFAULT_BPM_RANGE);
  const [keyFilter, setKeyFilter] = useState("Any Key");
  const [sortKey, setSortKey] = useState("folder");
  const [sortDir, setSortDir] = useState("asc");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [draggedTrackId, setDraggedTrackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const scrollContainerRef = useRef(null);
  const lastClickedIndexRef = useRef(null);

  const isSystemFolder = activeFolderId === "all" || activeFolderId === "favorites";
  const activeCustomFolder = customFolders.find((f) => f.id === activeFolderId);
  const activeCollection = collections.find((c) => c.id === activeFolderId);
  const linkedFolders = useMemo(
    () => customFolders.filter((f) => f.folderPath),
    [customFolders]
  );

  // "Misc. Music" is everything in the main music folder EXCEPT whatever a
  // linked custom folder has already claimed, so a track never shows up
  // twice.
  const miscTracks = useMemo(() => {
    if (linkedFolders.length === 0) return tracks;
    return tracks.filter(
      (t) => !linkedFolders.some((f) => isUnderDirectory(t.filePath, f.folderPath))
    );
  }, [tracks, linkedFolders]);

  const folderFiltered = useMemo(() => {
    if (activeFolderId === "favorites") {
      return allTracks.filter((t) => favoriteIds.includes(t.id));
    }
    if (activeFolderId === "all" || !activeFolderId) {
      return miscTracks;
    }
    if (activeCollection) {
      const idSet = new Set(activeCollection.trackIds);
      return allTracks.filter((t) => idSet.has(t.id));
    }
    if (activeCustomFolder?.folderPath) {
      return customFolderTracks[activeFolderId] || [];
    }
    // Custom folder with nothing linked yet.
    return [];
  }, [
    activeFolderId,
    allTracks,
    favoriteIds,
    miscTracks,
    activeCustomFolder,
    activeCollection,
    customFolderTracks,
  ]);

  const trimmedQuery = query.trim();
  const isGlobalSearch = trimmedQuery.length > 0;
  const hasBpmFilter = bpmRange[0] > DEFAULT_BPM_RANGE[0] || bpmRange[1] < DEFAULT_BPM_RANGE[1];
  const hasKeyFilter = keyFilter !== "Any Key";
  const isHealthFiltering = healthFilter === "untagged" || healthFilter === "unanalyzed" || healthFilter === "missing";
  const isSimilarMode = Boolean(similarToTrackId);
  const isFiltering =
    isGlobalSearch || hasBpmFilter || hasKeyFilter || showDuplicatesOnly || isHealthFiltering || isSimilarMode;

  // Manual drag-to-reorder only makes sense while looking at one real,
  // stable folder (or Favorites) — not search results, a Collection, a
  // Find Similar ranking, or a health-filtered view spanning the whole
  // library, none of which represent a single ordered list something
  // could meaningfully be "dragged within."
  const orderFolderKey =
    !isFiltering && !activeCollection && (activeFolderId === "favorites" || activeCustomFolder)
      ? activeFolderId
      : null;
  const canManuallyReorder = sortKey === "folder" && Boolean(orderFolderKey);

  // The Health Dashboard's "duplicates" category is just the existing
  // Duplicates toggle — translate the signal and clear it immediately so
  // it doesn't also linger as a separate always-on filter.
  useEffect(() => {
    if (healthFilter === "duplicates") {
      setShowDuplicatesOnly(true);
      onSetHealthFilter(null);
    }
  }, [healthFilter, onSetHealthFilter]);

  // Picking a folder is a clear signal the person wants to go back to
  // normal browsing, so drop any active health filter or similar-to view
  // at that point.
  useEffect(() => {
    if (healthFilter) onSetHealthFilter(null);
    if (similarToTrackId) onFindSimilar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  // A non-empty search (or an active health filter) spans every folder,
  // not just the one currently selected in the sidebar.
  const searchFiltered = useMemo(() => {
    let result = isGlobalSearch || isHealthFiltering ? allTracks : folderFiltered;

    if (isGlobalSearch) {
      const q = trimmedQuery.toLowerCase();
      const matchingTagIds = new Set(
        tags.filter((t) => t.name.toLowerCase().includes(q)).map((t) => t.id)
      );
      result = result.filter(
        (t) =>
          t.fileName.toLowerCase().includes(q) ||
          (trackTags[t.id] || []).some((tagId) => matchingTagIds.has(tagId))
      );
    }

    if (hasBpmFilter) {
      result = result.filter((t) => {
        const effective = getEffectiveAnalysis(t.id, trackOverrides);
        return (
          effective.bpm != null &&
          effective.bpm >= bpmRange[0] &&
          effective.bpm <= bpmRange[1]
        );
      });
    }

    if (hasKeyFilter) {
      result = result.filter(
        (t) => getEffectiveAnalysis(t.id, trackOverrides).key === keyFilter
      );
    }

    if (healthFilter === "untagged") {
      result = result.filter((t) => !(trackTags[t.id] || []).length);
    } else if (healthFilter === "unanalyzed") {
      result = result.filter((t) => {
        const effective = getEffectiveAnalysis(t.id, trackOverrides);
        return effective.bpm == null && effective.key == null;
      });
    } else if (healthFilter === "missing") {
      result = result.filter((t) =>
        checkTrackMissing(t, missingFolderIds, musicFolderPath, customFolders)
      );
    }

    return result;
    // analysisTick isn't read directly, but its purpose is to force this
    // memo to re-run when the (module-level) analysis cache changes.
  }, [
    isGlobalSearch,
    isHealthFiltering,
    allTracks,
    folderFiltered,
    trimmedQuery,
    tags,
    trackTags,
    hasBpmFilter,
    bpmRange,
    hasKeyFilter,
    keyFilter,
    analysisTick,
    trackOverrides,
    healthFilter,
    missingFolderIds,
    musicFolderPath,
    customFolders,
  ]);

  // Likely duplicates — exact file-size match (works for every track,
  // decode-free) plus waveform-shape similarity for tracks whose waveform
  // has already been decoded (catches a re-encoded/renamed copy that
  // doesn't share a file size). Re-scans whenever the Duplicates toggle
  // is flipped, so browsing more of the library and re-toggling it picks
  // up newly-decoded waveforms.
  const duplicateIds = useMemo(
    () => findDuplicateIds(allTracks),
    [allTracks, showDuplicatesOnly]
  );

  const duplicateFiltered = useMemo(() => {
    if (!showDuplicatesOnly) return searchFiltered;
    return searchFiltered.filter((t) => duplicateIds.has(t.id));
  }, [searchFiltered, showDuplicatesOnly, duplicateIds]);

  // "Find Similar" ranks the whole library by a real-feature similarity
  // score (BPM, key relatedness, timbral chroma shape, brightness/energy,
  // shared tags) against one reference track — not genre classification,
  // just signal-similarity. Only tracks that have already been analyzed
  // can be scored (same lazy-decode limitation as everywhere else), and
  // this replaces the normal filter/sort pipeline entirely rather than
  // composing with it, since it needs its own fixed order (by score).
  const similarResults = useMemo(() => {
    if (!similarToTrackId) return null;
    const referenceAnalysis = getCachedAnalysis(similarToTrackId);
    if (!referenceAnalysis) return [];
    const refTagIds = trackTags[similarToTrackId] || [];
    return allTracks
      .filter((t) => t.id !== similarToTrackId)
      .map((t) => {
        const a = getCachedAnalysis(t.id);
        if (!a) return null;
        return {
          track: t,
          score: computeSimilarityScore(referenceAnalysis, a, refTagIds, trackTags[t.id] || []),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [similarToTrackId, allTracks, trackTags, analysisTick]);

  const similarReferenceTrack = similarToTrackId
    ? allTracks.find((t) => t.id === similarToTrackId)
    : null;

  const filteredTracks = useMemo(() => {
    if (isSimilarMode) return (similarResults || []).map((r) => r.track);
    const sorted = sortTracks(duplicateFiltered, sortKey, sortDir, trackOverrides);
    if (canManuallyReorder && trackOrder[orderFolderKey]) {
      return applyManualOrder(sorted, trackOrder[orderFolderKey]);
    }
    return sorted;
    // analysisTick covers BPM re-sorting; duration sort updates lazily as
    // rows get decoded and won't force a re-sort on its own.
  }, [
    isSimilarMode,
    similarResults,
    duplicateFiltered,
    sortKey,
    sortDir,
    analysisTick,
    trackOverrides,
    canManuallyReorder,
    orderFolderKey,
    trackOrder,
  ]);

  const resultSummary = useMemo(() => {
    if (!isGlobalSearch && !hasBpmFilter && !hasKeyFilter) return null;
    const parts = [];
    if (isGlobalSearch) parts.push(`"${trimmedQuery}"`);
    if (hasKeyFilter) parts.push(`Key: ${keyFilter}`);
    if (hasBpmFilter) parts.push(`${bpmRange[0]}–${bpmRange[1]} BPM`);
    const n = filteredTracks.length;
    return `${n} result${n === 1 ? "" : "s"} for ${parts.join(" · ")}`;
  }, [isGlobalSearch, trimmedQuery, hasKeyFilter, keyFilter, hasBpmFilter, bpmRange, filteredTracks.length]);

  // Which real directories are currently unreachable, for per-track
  // "missing" flagging regardless of which view is showing them.
  const missingDirs = useMemo(() => {
    const dirs = [];
    if (missingFolderIds.has("main") && musicFolderPath) dirs.push(musicFolderPath);
    customFolders.forEach((f) => {
      if (f.folderPath && missingFolderIds.has(f.id)) dirs.push(f.folderPath);
    });
    return dirs;
  }, [missingFolderIds, musicFolderPath, customFolders]);

  function isTrackMissing(track) {
    return missingDirs.some((dir) => isUnderDirectory(track.filePath, dir));
  }

  const currentFolderMissing =
    (activeFolderId === "all" && missingFolderIds.has("main")) ||
    (activeCustomFolder && missingFolderIds.has(activeCustomFolder.id));

  const range = useVirtualRows(scrollContainerRef, filteredTracks.length, ROW_HEIGHT);

  // Jump back to the top when the folder or search changes, so the
  // virtualizer isn't left showing a stale scroll position for a
  // completely different list.
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [activeFolderId, query]);

  // Clear multi-select whenever the underlying list changes shape (folder
  // switch, new search, etc.) so stale selections don't linger invisibly.
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }, [activeFolderId, trimmedQuery, sortKey, showDuplicatesOnly]);

  const visibleTracks = filteredTracks.slice(range.start, range.end);

  function handleRowClick(e, track) {
    const idx = filteredTracks.findIndex((t) => t.id === track.id);
    if (e.shiftKey && lastClickedIndexRef.current != null) {
      const [start, end] = [lastClickedIndexRef.current, idx].sort((a, b) => a - b);
      const rangeIds = filteredTracks.slice(start, end + 1).map((t) => t.id);
      setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      lastClickedIndexRef.current = idx;
    } else {
      setSelectedIds(new Set());
      lastClickedIndexRef.current = idx;
      onSelectTrack(track);
    }
  }

  // Manual drag-to-reorder — only ever wired up (see TrackRow's own
  // draggable prop below) while canManuallyReorder is true, so these
  // don't need their own internal guard against running in the wrong
  // sort mode or view.
  function handleTrackDragStart(track) {
    setDraggedTrackId(track.id);
  }

  // draggedTrackId is a fully reliable "is this drag ours" signal here —
  // unlike folder dragging, track reorder never touches dataTransfer at
  // all (it's always within this same component instance, no need to
  // carry an id across a component boundary), so if it's not set, this
  // definitely isn't one of ours — most likely a dockview panel drag
  // passing over the library's content, which needs to be left
  // completely alone rather than intercepted.
  function handleTrackRowDragOver(e, track) {
    if (!draggedTrackId) return;
    e.preventDefault();
    setDragOverTrackId(track.id);
  }

  function handleTrackDrop(e, track) {
    if (!draggedTrackId) return;
    e.preventDefault();
    if (draggedTrackId !== track.id) {
      const currentIds = filteredTracks.map((t) => t.id);
      const fromIndex = currentIds.indexOf(draggedTrackId);
      if (fromIndex !== -1) {
        const next = [...currentIds];
        next.splice(fromIndex, 1);
        const toIndex = next.indexOf(track.id);
        next.splice(toIndex === -1 ? next.length : toIndex, 0, draggedTrackId);
        onReorderTracks(orderFolderKey, next);
      }
    }
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  }

  function handleTrackDragEnd() {
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  }

  // These four handle files dragged in from Explorer — same principle as
  // the folder panel's own drag handling: only intervene (preventDefault,
  // counter tracking, state changes) for a drag that's positively
  // identified as carrying real OS files, so a dockview panel drag (or
  // this same panel's own track-reorder drag, which never sets a "Files"
  // type) passes through untouched instead of getting swallowed here.
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

    const targetFolder = activeCustomFolder?.folderPath || musicFolderPath;
    if (!targetFolder || !window.disc) return;
    const paths = Array.from(e.dataTransfer.files)
      .filter((f) => /\.(mp3|wav|mov)$/i.test(f.name))
      .map((f) => window.disc.getPathForFile(f))
      .filter(Boolean);

    if (paths.length > 0) onDropFiles(paths, targetFolder);
  }

  function handlePlayAllClick() {
    onPlayAll(filteredTracks.map((t) => t.id), false);
  }

  function handleShufflePlayClick() {
    onPlayAll(filteredTracks.map((t) => t.id), true);
  }

  // A reliable alternative to drag-and-drop for adding mp3s — some
  // third-party window-manager tools can interfere with OS-level file
  // drag delivery, so this native picker doesn't depend on that at all.
  async function handleImportFiles() {
    if (!window.disc) return;
    const targetFolder = activeCustomFolder?.folderPath || musicFolderPath;
    if (!targetFolder) return;
    const paths = await window.disc.chooseMp3Files();
    if (paths.length > 0) onDropFiles(paths, targetFolder);
  }

  const isUnlinkedCustomFolder =
    !isSystemFolder && !activeCollection && !activeCustomFolder?.folderPath;

  return (
    <div
      className={
        "library-panel" + (isDraggingOver ? " library-panel--drag-over" : "")
      }
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <LibraryToolbar
        query={query}
        onQueryChange={setQuery}
        bpmRange={bpmRange}
        onBpmRangeChange={setBpmRange}
        keyFilter={keyFilter}
        onKeyFilterChange={setKeyFilter}
        resultSummary={resultSummary}
        onPlayAll={handlePlayAllClick}
        onShufflePlay={handleShufflePlayClick}
        playDisabled={filteredTracks.length === 0}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        showDuplicatesOnly={showDuplicatesOnly}
        onToggleDuplicates={() => setShowDuplicatesOnly((v) => !v)}
        duplicateCount={duplicateIds.size}
        onImportFiles={handleImportFiles}
        importDisabled={!musicFolderPath && !activeCustomFolder?.folderPath}
      />

      {selectedIds.size > 0 ? (
        <BatchActionBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
      ) : (
        <NowPlayingBar />
      )}

      {isSimilarMode && (
        <div className="library-panel__missing-banner">
          Similar to "{similarReferenceTrack ? stripExtension(similarReferenceTrack.fileName) : "…"}"
          {" "}— ranked by BPM, key, timbre, energy, and shared tags (not
          genre), among the {(similarResults || []).length} tracks you've
          already opened.{" "}
          <button
            className="library-panel__clear-health"
            onClick={() => onFindSimilar(null)}
          >
            Clear
          </button>
        </div>
      )}

      {healthFilter && (
        <div className="library-panel__missing-banner">
          Showing:{" "}
          {healthFilter === "untagged"
            ? "tracks with no tags"
            : healthFilter === "unanalyzed"
            ? "tracks with no BPM/Key detected yet"
            : "missing/unreachable tracks"}{" "}
          across your whole library.{" "}
          <button
            className="library-panel__clear-health"
            onClick={() => onSetHealthFilter(null)}
          >
            Clear
          </button>
        </div>
      )}

      {currentFolderMissing && (
        <div className="library-panel__missing-banner">
          <Icon name="warning" size={14} style={{ marginRight: 4 }} />
          This folder's directory can't be reached right now (maybe an
          external or network drive is unplugged). Showing the last-known
          tracks — they're grayed out until it's reachable again.
        </div>
      )}

      <div className="library-panel__body" ref={scrollContainerRef}>
        {!musicFolderPath && isSystemFolder && !isFiltering ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon name="musicNote" size={30} />
              </div>
              <div className="library-empty__title">No music folder yet</div>
              <p className="library-empty__text">
                Point Disc at the folder where you keep your music/clips and tracks
                will show up here automatically.
              </p>
              <button className="library-empty__button" onClick={onChooseFolder}>
                Choose Music Folder
              </button>
            </div>
          </div>
        ) : isScanning && isSystemFolder && !isFiltering ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon name="musicNote" size={30} />
              </div>
              <div className="library-empty__title">Scanning folder…</div>
            </div>
          </div>
        ) : isUnlinkedCustomFolder && !isFiltering ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon name="folder" size={28} />
              </div>
              <div className="library-empty__title">No directory linked</div>
              <p className="library-empty__text">
                Link "{activeCustomFolder?.name}" to a real folder on disk —
                its tracks will show up here once it's linked.
              </p>
              <button
                className="library-empty__button"
                onClick={() => onLinkFolderDirectory(activeFolderId)}
              >
                Link Folder Directory
              </button>
            </div>
          </div>
        ) : filteredTracks.length === 0 && isFiltering ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon name="search" size={28} />
              </div>
              <div className="library-empty__title">No matches</div>
              <p className="library-empty__text">
                {isSimilarMode
                  ? "No other tracks have been analyzed yet — open a few more in Details, then try Find Similar again."
                  : showDuplicatesOnly
                  ? "No likely duplicates found in this view."
                  : healthFilter === "untagged"
                  ? "Every track in your library has at least one tag. Nice."
                  : healthFilter === "unanalyzed"
                  ? "Every track has a BPM/Key already (detected or manually set)."
                  : healthFilter === "missing"
                  ? "No missing/unreachable tracks right now."
                  : hasBpmFilter || hasKeyFilter
                  ? "Nothing matches these filters — note BPM/Key filtering only considers tracks that have already been analyzed (open a track in Details at least once)."
                  : `Nothing matches "${trimmedQuery}".`}
              </p>
            </div>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="library-panel__center">
            <div className="library-empty">
              <div className="library-empty__icon">
                <Icon
                  name={
                    activeFolderId === "favorites"
                      ? "heartOutline"
                      : activeCollection
                      ? "diamond"
                      : "musicNote"
                  }
                  size={28}
                />
              </div>
              <div className="library-empty__title">
                {activeFolderId === "favorites"
                  ? "No favorites yet"
                  : activeCollection
                  ? "Nothing in this collection yet"
                  : "No tracks found"}
              </div>
              <p className="library-empty__text">
                {activeFolderId === "favorites"
                  ? "Click the heart on a track to add it here."
                  : activeCollection
                  ? "Select tracks anywhere in your library and use \"+ Collection\" (right-click, or select multiple) to add them here."
                  : "Drag mp3, wav, or mov files in here, or drop them into the folder — Disc is watching it either way."}
              </p>
              {activeFolderId !== "favorites" && !activeCollection && (
                <button className="library-empty__button" onClick={handleImportFiles}>
                  Import Files
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className="library-list"
            style={{ height: filteredTracks.length * ROW_HEIGHT }}
          >
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
                  isMissing={isTrackMissing(track)}
                  isMultiSelected={selectedIds.has(track.id)}
                  onRowClick={handleRowClick}
                  canManuallyReorder={canManuallyReorder}
                  isDragOver={dragOverTrackId === track.id}
                  isBeingDragged={draggedTrackId === track.id}
                  onTrackDragStart={handleTrackDragStart}
                  onTrackDragOver={handleTrackRowDragOver}
                  onTrackDrop={handleTrackDrop}
                  onTrackDragEnd={handleTrackDragEnd}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {isDraggingOver && (
        <div className="library-panel__drop-overlay">
          <div className="library-panel__drop-message">
            {activeCustomFolder?.folderPath || musicFolderPath
              ? "Drop to add to your library"
              : "Choose a music folder first"}
          </div>
        </div>
      )}
    </div>
  );
}
