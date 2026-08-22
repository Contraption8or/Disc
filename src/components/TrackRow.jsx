import { memo, useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { computeWaveform, getCachedWaveform } from "../audio/waveform.js";
import { downsamplePeaks } from "../audio/downsamplePeaks.js";
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
  // Set while a native OS drag-out (to Premiere) is in progress — checked
  // by the waveform-scrub drag below so the two don't fight over the same
  // mouse gesture. See handleWaveformMouseDown/handleDragStart.
  const isNativeDraggingRef = useRef(false);
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

  // mousedown (rather than click) so a single click still seeks exactly
  // as before, but holding and moving the mouse continuously scrubs the
  // playhead instead of only being able to click one position at a time.
  // The window-level listeners (rather than only reacting on this
  // element) are what let the drag keep tracking even if the pointer
  // strays outside the waveform's own bounds mid-drag.
  //
  // This element also has a native OS drag-out (to Premiere — see
  // handleDragStart below), and the two genuinely can't share a mouse
  // gesture cleanly: once handleDragStart fires, the OS takes over
  // mouse tracking for the rest of that drag, and there's no guarantee
  // this component ever sees a normal mouseup for it. isNativeDraggingRef
  // gets set the moment that happens, so this scrub stops seeking for
  // the rest of the gesture instead of fighting the OS drag — and
  // dragend (which reliably fires once an OS-level drag concludes,
  // dropped or not) is wired up alongside mouseup specifically so the
  // window listeners always get torn down, even when mouseup itself
  // never arrives.
  function handleWaveformMouseDown(e) {
    if (isMissing || isVideo) return;
    onSelectTrack(track);
    isNativeDraggingRef.current = false;
    const container = e.currentTarget;

    function fractionAt(clientX) {
      const rect = container.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    seekTo(track, fractionAt(e.clientX));

    function handleMouseMove(moveEvent) {
      if (isNativeDraggingRef.current) return;
      seekTo(track, fractionAt(moveEvent.clientX));
    }
    function cleanup() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", cleanup);
      container.removeEventListener("dragend", cleanup);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", cleanup);
    container.addEventListener("dragend", cleanup);
  }

  // Native OS drag-out — this is what lets the waveform be dragged
  // straight onto Premiere Pro's timeline. Chromium requires
  // preventDefault() here since the actual drag is handed off to the OS
  // via startDrag in the main process, not the page's own drag system.
  function handleDragStart(e) {
    e.preventDefault();
    if (isMissing) return;
    isNativeDraggingRef.current = true;
    window.disc?.startDrag(track.filePath);
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
        draggable={!isMissing}
        onDragStart={handleDragStart}
        title={
          isMissing
            ? "File not found — the folder it's in may be unreachable"
            : isVideo
            ? "Drag into Premiere Pro (Disc doesn't preview video clips)"
            : "Click, or drag the playhead, to move around — drag out to Premiere Pro"
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
          onDelete={() => onDeleteTrack(track.filePath)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(TrackRow);
