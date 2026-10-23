import { memo, useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { computeWaveform, getCachedWaveform } from "../audio/waveform.js";
import { downsamplePeaks } from "../audio/downsamplePeaks.js";
import { useElementWidth } from "../hooks/useElementWidth.js";
import { useVisualTick } from "../hooks/useVisualTick.js";
import { formatSize, formatDuration, stripExtension } from "../utils/format.js";
import TrackContextMenu from "./TrackContextMenu.jsx";
import Icon from "./Icon.jsx";
import "./TrackRow.css";

const BAR_PX = 3; // target width+gap per bar, in pixels

function TrackRow({ track, isFavorite, onToggleFavorite, isMissing }) {
  const {
    currentTrackId,
    isPlaying,
    duration,
    togglePlayPause,
    seekTo,
    getCurrentTime,
    onDeleteTrack,
    onRenameTrackFile,
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

  // Lazily decode the real waveform once this row scrolls near the
  // viewport, instead of decoding the whole library up front. Video clips
  // aren't decoded at all.
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

  // The progress overlay is driven straight from the audio element (not
  // React state) so it doesn't re-render every frame.
  useEffect(() => {
    if (!isVideo && !isActive && progressRef.current) progressRef.current.style.width = "0%";
  }, [isActive, isVideo]);

  // Paused: leave the bar exactly where it is. See useVisualTick for why
  // this slows down while the window isn't focused.
  useVisualTick(() => {
    const trackDuration = waveformData?.duration || duration || 0;
    const pct = trackDuration > 0 ? Math.min(100, (getCurrentTime() / trackDuration) * 100) : 0;
    if (progressRef.current) progressRef.current.style.width = `${pct}%`;
  }, !isVideo && isActive && isPlaying);

  function handlePlayClick(e) {
    if (isMissing || isVideo) return;
    togglePlayPause(track, { forceFromStart: e.shiftKey });
  }

  // A plain click (no movement) seeks to that point. A real drag never
  // reaches this — once the browser recognizes a drag gesture it stops
  // dispatching click for that press, so seek and drag-out can't collide.
  function handleWaveformClick(e) {
    if (isMissing || isVideo || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(track, fraction);
  }

  // Chromium's native drag detection runs off the `draggable` attribute
  // regardless of which button is held, so a right-click-and-move could
  // pick the track up as a drag under the context menu. Turn dragging off
  // for the duration of any non-left press.
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

  // Native OS drag-out — this is what lets the waveform be dragged straight
  // onto Premiere Pro's timeline. The actual drag is handed to the OS via
  // startDrag in the main process, so the page's own drag is cancelled.
  function handleDragStart(e) {
    e.preventDefault();
    if (isMissing) return;
    window.disc?.startDrag(track.filePath);
  }

  const trackDuration = waveformData?.duration || (isActive ? duration : null);
  const durationLabel = formatDuration(trackDuration);

  return (
    <div
      className={
        "track-row" +
        (isActive ? " track-row--active" : "") +
        (isMissing ? " track-row--missing" : "")
      }
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button
        className="track-row__play"
        onClick={handlePlayClick}
        title={
          isMissing
            ? "File not found"
            : isVideo
            ? "Video clips can't be previewed — drag it out to preview in Premiere"
            : isActive && isPlaying
            ? "Pause"
            : "Play"
        }
        disabled={isMissing || isVideo}
      >
        <Icon name={isVideo ? "video" : isActive && isPlaying ? "pause" : "play"} size={13} />
      </button>

      <div
        className="track-row__waveform"
        ref={waveformRef}
        onMouseDown={handleWaveformMouseDown}
        onClick={handleWaveformClick}
        draggable={!isMissing}
        onDragStart={handleDragStart}
        title={
          isMissing
            ? "File not found — its folder may be unreachable"
            : isVideo
            ? "Drag into Premiere Pro (video clips aren't previewed here)"
            : "Click to seek — drag out to Premiere Pro"
        }
      >
        {isMissing ? null : isVideo ? (
          <div className="track-row__video-placeholder">
            <Icon name="video" size={12} style={{ marginRight: 5 }} />
            Video clip — drag to use
          </div>
        ) : waveformData?.tooLarge ? (
          <div
            className="track-row__video-placeholder"
            title="Over 50MB — plays normally, just skipped for waveform to avoid a very large decode"
          >
            Too large to analyze — drag to use
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

      <div className="track-row__info">
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
        className={"track-row__favorite" + (isFavorite ? " track-row__favorite--active" : "")}
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
          onRename={isMissing ? null : () => setIsRenaming(true)}
          onDelete={() => onDeleteTrack(track.filePath)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(TrackRow);
