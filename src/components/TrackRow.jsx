import { memo, useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { computeWaveform, getCachedWaveform } from "../audio/waveform.js";
import { downsamplePeaks } from "../audio/downsamplePeaks.js";
import { getSectionDragPath, prepareSectionDrag } from "../audio/sectionDrag.js";
import { useElementWidth } from "../hooks/useElementWidth.js";
import { formatSize, formatDuration, stripExtension } from "../utils/format.js";
import TrackContextMenu from "./TrackContextMenu.jsx";
import Icon from "./Icon.jsx";
import "./TrackRow.css";

const BAR_PX = 3; // target width+gap per bar, in pixels

function TrackRow({
  track,
  isFavorite,
  onToggleFavorite,
  isMissing,
  isMultiSelected,
  selectionCount,
  onDeleteSelection,
  onRowClick,
  canManuallyReorder,
  isDragOver,
  isBeingDragged,
  onTrackDragStart,
  onTrackDragOver,
  onTrackDrop,
  onTrackDragEnd,
}) {
  const {
    currentTrackId,
    isPlaying,
    duration,
    togglePlayPause,
    seekTo,
    playTrackSection,
    trackSections,
    getCurrentTime,
    onSelectTrack,
    onDeleteTrack,
    onRenameTrackFile,
    activeFolderId,
    collections,
    onAddTracksToCollection,
    onCreateCollection,
    onRemoveTrackFromCollection,
  } = useDisc();

  const isActive = currentTrackId === track.id;
  const isVideo = track.fileType === "video";
  const [waveformData, setWaveformData] = useState(() =>
    isVideo ? null : getCachedWaveform(track.id)
  );
  const [contextMenu, setContextMenu] = useState(null); // { x, y } | null
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef(null);
  const waveformRef = useRef(null);
  const progressRef = useRef(null);
  const waveformWidth = useElementWidth(waveformRef);
  const barCount = Math.max(12, Math.floor(waveformWidth / BAR_PX));

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  function commitRename(value) {
    setIsRenaming(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === stripExtension(track.fileName)) return;
    onRenameTrackFile(track, trimmed);
  }

  // Lazily decode the real waveform once this row scrolls near the viewport,
  // instead of decoding every track in the library up front. Video clips
  // don't get this at all — Disc has no video-aware decode/playback
  // pipeline (that's a materially different feature, not built here).
  useEffect(() => {
    if (waveformData || isMissing || isVideo) return;
    const el = waveformRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          computeWaveform(track).then((data) => {
            if (data) setWaveformData(data);
          });
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [track, waveformData, isMissing, isVideo]);

  // Start preparing every marked section's trimmed clip as soon as this
  // row's own waveform is ready (i.e. it's actually been visible on
  // screen), rather than waiting for a hover right before a drag. Hover
  // alone (see handleWaveformMouseEnter below) often doesn't leave enough
  // lead time — trimming still means decoding the whole source file first,
  // which can take a moment — so a drag started right after hovering in
  // could otherwise beat the render and silently fall back to dragging
  // the whole track. Tying this to waveformData reuses the same "only
  // do this for rows that have actually scrolled into view" gate the
  // waveform decode above already uses, rather than eagerly rendering
  // clips for the entire library up front.
  useEffect(() => {
    if (isMissing || isVideo || !waveformData) return;
    (trackSections[track.id] || []).forEach((section, i) =>
      prepareSectionDrag(track, section, i).catch((err) =>
        console.error("Couldn't prepare section for drag:", err)
      )
    );
  }, [waveformData, trackSections, track, isMissing, isVideo]);

  // While this row's track is the one actually playing (not just loaded/
  // paused), drive the progress overlay directly via rAF (not React
  // state) so it doesn't re-render on every frame.
  useEffect(() => {
    if (isVideo) return;
    if (!isActive) {
      if (progressRef.current) progressRef.current.style.width = "0%";
      return;
    }
    if (!isPlaying) return; // paused: leave the bar exactly where it is

    let raf;
    const trackDuration = waveformData?.duration || duration || 0;
    function tick() {
      const t = getCurrentTime();
      const pct = trackDuration > 0 ? Math.min(100, (t / trackDuration) * 100) : 0;
      if (progressRef.current) progressRef.current.style.width = `${pct}%`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isActive, isPlaying, waveformData, duration, getCurrentTime, isVideo]);

  function handlePlayClick(e) {
    if (isMissing || isVideo) return;
    onSelectTrack(track);
    if (e.ctrlKey || e.metaKey) {
      playTrackSection(track, trackSections[track.id]);
    } else if (e.shiftKey) {
      togglePlayPause(track, { forceFromStart: true });
    } else {
      togglePlayPause(track);
    }
  }

  // A plain click (no movement in between) seeks to that point in the
  // track. Any real drag never reaches this handler at all — once the
  // browser recognizes a drag gesture (see handleDragStart) it stops
  // dispatching click for that same press, so click-to-seek and
  // drag-out-to-Premiere can't collide with each other.
  function handleWaveformClick(e) {
    if (isMissing || isVideo || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSelectTrack(track);
    seekTo(track, fraction);
  }

  // Right/middle click: let the context menu handle it. Chromium's native
  // drag-candidate detection isn't gated to the primary button — it runs
  // off the `draggable` attribute regardless of which button is held — so
  // a right-click-and-move could otherwise still pick the track up as a
  // native OS drag underneath the context menu. Explicitly turning
  // dragging off for the duration of a non-left press (restored on
  // release) is what stops that.
  function handleWaveformMouseDown(e) {
    if (isMissing || isVideo || e.button === 0) return;
    const container = e.currentTarget;
    container.draggable = false;
    const restore = () => {
      container.draggable = true;
      window.removeEventListener("mouseup", restore);
    };
    window.addEventListener("mouseup", restore);
  }

  // Hovering the waveform starts preparing every marked section's trimmed
  // clip in the background (cached — see sectionDrag.js), so that by the
  // time an actual drag starts, dragging from within a highlighted band
  // can hand off just that section instead of the whole file. This can't
  // happen inside dragstart itself: Electron's startDrag must be called
  // synchronously from that event, and trimming+encoding isn't instant.
  function handleWaveformMouseEnter() {
    if (isMissing || isVideo) return;
    (trackSections[track.id] || []).forEach((section, i) =>
      prepareSectionDrag(track, section, i).catch((err) =>
        console.error("Couldn't prepare section for drag:", err)
      )
    );
  }

  // Native OS drag-out — this is what lets the waveform be dragged
  // straight onto Premiere Pro's timeline. Chromium requires
  // preventDefault() here since the actual drag is handed off to the OS
  // via startDrag in the main process, not the page's own drag system.
  //
  // If the drag started from within a marked section's highlighted band,
  // that section's own trimmed clip is dragged instead of the whole
  // track — but only once it's actually ready (see handleWaveformMouseEnter
  // above); a grab so fast it beats the render just falls back to
  // dragging the whole file, same as dragging from anywhere else on the
  // waveform.
  function handleDragStart(e) {
    e.preventDefault();
    if (isMissing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const section = (trackSections[track.id] || []).find(
      (s) => fraction >= s.startFraction && fraction <= s.endFraction
    );
    const sectionPath = section ? getSectionDragPath(track, section) : null;
    window.disc?.startDrag(sectionPath || track.filePath);
  }

  function handleInfoClick(e) {
    if (onRowClick) onRowClick(e, track);
    else onSelectTrack(track);
  }

  function handleContextMenu(e) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  const trackDuration = waveformData?.duration || (isActive ? duration : null);
  const durationLabel = formatDuration(trackDuration);

  return (
    <div
      className={
        "track-row" +
        (isActive ? " track-row--active" : "") +
        (isMultiSelected ? " track-row--multi-selected" : "") +
        (isMissing ? " track-row--missing" : "") +
        (isDragOver ? " track-row--drag-over" : "") +
        (isBeingDragged ? " track-row--dragging" : "")
      }
      onContextMenu={handleContextMenu}
      onDragOver={canManuallyReorder ? (e) => onTrackDragOver(e, track) : undefined}
      onDrop={canManuallyReorder ? (e) => onTrackDrop(e, track) : undefined}
    >
      {canManuallyReorder && (
        <div
          className="track-row__grip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onTrackDragStart(track);
          }}
          onDragEnd={onTrackDragEnd}
          title="Drag to reorder within this folder"
        >
          <Icon name="gripDots" size={13} />
        </div>
      )}
      <button
        className="track-row__play"
        onClick={handlePlayClick}
        title={
          isMissing
            ? "File not found"
            : isVideo
            ? "Video clips can't be previewed in Disc — drag it out to preview in Premiere"
            : isActive && isPlaying
            ? "Pause · Shift-click to restart · Ctrl-click to cycle marked sections"
            : "Play · Shift-click to restart · Ctrl-click to cycle marked sections"
        }
        disabled={isMissing || isVideo}
      >
        <Icon name={isVideo ? "video" : isActive && isPlaying ? "pause" : "play"} size={13} />
      </button>

      <div
        className="track-row__waveform"
        ref={waveformRef}
        onMouseDown={handleWaveformMouseDown}
        onMouseEnter={handleWaveformMouseEnter}
        onClick={handleWaveformClick}
        draggable={!isMissing}
        onDragStart={handleDragStart}
        title={
          isMissing
            ? "File not found — the folder it's in may be unreachable"
            : isVideo
            ? "Drag into Premiere Pro (Disc doesn't preview video clips)"
            : (trackSections[track.id] || []).length > 0
            ? "Click to seek — drag a highlighted section to send just that section to Premiere Pro, drag anywhere else for the whole track"
            : "Click to seek — drag out to Premiere Pro"
        }
      >
        {isMissing ? null : isVideo ? (
          <div className="track-row__video-placeholder">
            <Icon name="video" size={12} style={{ marginRight: 5 }} />
            Video clip — drag to use
          </div>
        ) : waveformData ? (
          <div className="track-row__bars-in" key="loaded">
            {downsamplePeaks(waveformData.peaks, barCount).map((peak, i) => (
              <span key={i} style={{ height: `${6 + peak * 94}%` }} />
            ))}
          </div>
        ) : null}
        {!isVideo &&
          (trackSections[track.id] || []).map((section) => (
            <div
              key={section.id}
              className="track-row__section-highlight"
              style={{
                left: `${section.startFraction * 100}%`,
                width: `${(section.endFraction - section.startFraction) * 100}%`,
              }}
            />
          ))}
        <div className="track-row__progress" ref={progressRef} />
      </div>

      <div className="track-row__info" onClick={isRenaming ? undefined : handleInfoClick}>
        <div className="track-row__name">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="track-row__rename-input"
              defaultValue={stripExtension(track.fileName)}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setIsRenaming(false);
              }}
            />
          ) : (
            stripExtension(track.fileName)
          )}
          {isMissing && (
            <span className="track-row__missing-badge">
              <Icon name="warning" size={11} style={{ marginRight: 3 }} />
              Missing
            </span>
          )}
        </div>
        <div className="track-row__meta">
          {track.relativeDir ? `${track.relativeDir} · ` : ""}
          {!isVideo && durationLabel ? `${durationLabel} · ` : ""}
          {formatSize(track.sizeBytes)}
        </div>
      </div>

      <button
        className={
          "track-row__favorite" + (isFavorite ? " track-row__favorite--active" : "")
        }
        onClick={() => onToggleFavorite(track.id)}
        title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      >
        <Icon name={isFavorite ? "heartFilled" : "heartOutline"} size={14} />
      </button>

      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={track.filePath}
          collections={collections}
          onAddToCollection={(collectionId) =>
            onAddTracksToCollection([track.id], collectionId)
          }
          onCreateCollection={(name) => {
            const id = onCreateCollection(name);
            onAddTracksToCollection([track.id], id);
          }}
          inCollectionName={
            collections.find((c) => c.id === activeFolderId)?.name || null
          }
          onRemoveFromCollection={() =>
            onRemoveTrackFromCollection(track.id, activeFolderId)
          }
          onRename={isMissing ? null : () => setIsRenaming(true)}
          deleteCount={isMultiSelected && selectionCount > 1 ? selectionCount : 1}
          onDelete={
            isMultiSelected && selectionCount > 1
              ? onDeleteSelection
              : () => onDeleteTrack(track.filePath)
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(TrackRow);
