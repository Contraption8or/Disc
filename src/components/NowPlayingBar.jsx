import { useEffect, useRef } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { stripExtension } from "../utils/format.js";
import Icon from "./Icon.jsx";
import "./NowPlayingBar.css";

export default function NowPlayingBar() {
  const {
    allTracks,
    currentTrackId,
    isPlaying,
    duration,
    togglePlayPause,
    playTrackSection,
    trackSections,
    getCurrentTime,
    queueTrackIds,
    queueIndex,
    shuffleEnabled,
    onPlayNext,
    onPlayPrev,
    onToggleShuffle,
  } = useDisc();

  const progressRef = useRef(null);
  const track = allTracks.find((t) => t.id === currentTrackId) || null;

  useEffect(() => {
    if (!track || !isPlaying) return; // paused: leave the bar exactly where it is
    let raf;
    function tick() {
      const pct = duration > 0 ? Math.min(100, (getCurrentTime() / duration) * 100) : 0;
      if (progressRef.current) progressRef.current.style.width = `${pct}%`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [track, isPlaying, duration, getCurrentTime]);

  if (!track) return null;

  const hasQueue = queueTrackIds.length > 0;

  return (
    <div className="now-playing">
      <div className="now-playing__progress-track">
        <div className="now-playing__progress-fill" ref={progressRef} />
      </div>
      <div className="now-playing__row">
        {hasQueue && (
          <button
            className="now-playing__skip"
            onClick={onPlayPrev}
            disabled={queueIndex <= 0}
            title="Previous"
          >
            <Icon name="skipBack" size={15} />
          </button>
        )}
        <button
          className="now-playing__play"
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              playTrackSection(track, trackSections[track.id]);
            } else if (e.shiftKey) {
              togglePlayPause(track, { forceFromStart: true });
            } else {
              togglePlayPause(track);
            }
          }}
          title={
            (isPlaying ? "Pause" : "Play") +
            " · Shift-click to restart · Ctrl-click to cycle marked sections"
          }
        >
          <Icon name={isPlaying ? "pause" : "play"} size={17} />
        </button>
        {hasQueue && (
          <button className="now-playing__skip" onClick={onPlayNext} title="Next">
            <Icon name="skipForward" size={15} />
          </button>
        )}

        <div className="now-playing__name" title={track.fileName}>
          {stripExtension(track.fileName)}
        </div>

        {hasQueue && (
          <div className="now-playing__queue-pos">
            {queueIndex + 1} / {queueTrackIds.length}
          </div>
        )}

        <button
          className={
            "now-playing__shuffle" + (shuffleEnabled ? " now-playing__shuffle--active" : "")
          }
          onClick={onToggleShuffle}
          title={shuffleEnabled ? "Shuffle on" : "Shuffle off"}
        >
          <Icon name="shuffle" size={15} />
        </button>
      </div>
    </div>
  );
}
