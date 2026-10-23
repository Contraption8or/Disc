import { useRef } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { useVisualTick } from "../hooks/useVisualTick.js";
import { stripExtension } from "../utils/format.js";
import VolumeControl from "./VolumeControl.jsx";
import Icon from "./Icon.jsx";
import "./NowPlayingBar.css";

// The bottom bar: transport controls, what's playing, shuffle, and volume.
// Always rendered (showing "Nothing playing" when idle) so the layout above
// it doesn't jump when the first track starts.
export default function NowPlayingBar() {
  const {
    allTracks,
    currentTrackId,
    isPlaying,
    duration,
    togglePlayPause,
    getCurrentTime,
    queueTrackIds,
    queueIndex,
    shuffleEnabled,
    onPlayNext,
    onPlayPrev,
    onToggleShuffle,
    volume,
    setVolume,
  } = useDisc();

  const progressRef = useRef(null);
  const track = allTracks.find((t) => t.id === currentTrackId) || null;

  // Paused: leave the bar exactly where it is. Driven directly (not React
  // state) so it doesn't re-render per frame; see useVisualTick for why it
  // slows down while the window isn't focused.
  useVisualTick(() => {
    const pct = duration > 0 ? Math.min(100, (getCurrentTime() / duration) * 100) : 0;
    if (progressRef.current) progressRef.current.style.width = `${pct}%`;
  }, Boolean(track) && isPlaying);

  const hasQueue = queueTrackIds.length > 0;

  return (
    <div className="now-playing">
      <div className="now-playing__progress-track">
        <div className="now-playing__progress-fill" ref={progressRef} />
      </div>
      <div className="now-playing__row">
        <button
          className="now-playing__skip"
          onClick={onPlayPrev}
          disabled={!hasQueue || queueIndex <= 0}
          title="Previous"
        >
          <Icon name="skipBack" size={15} />
        </button>
        <button
          className="now-playing__play"
          disabled={!track}
          onClick={(e) => track && togglePlayPause(track, { forceFromStart: e.shiftKey })}
          title={isPlaying ? "Pause" : "Play"}
        >
          <Icon name={isPlaying ? "pause" : "play"} size={17} />
        </button>
        <button
          className="now-playing__skip"
          onClick={onPlayNext}
          disabled={!hasQueue}
          title="Next"
        >
          <Icon name="skipForward" size={15} />
        </button>

        <div className="now-playing__name" title={track?.fileName}>
          {track ? stripExtension(track.fileName) : "Nothing playing"}
        </div>

        {hasQueue && (
          <div className="now-playing__queue-pos">
            {queueIndex + 1} / {queueTrackIds.length}
          </div>
        )}

        <button
          className={"now-playing__shuffle" + (shuffleEnabled ? " now-playing__shuffle--active" : "")}
          onClick={onToggleShuffle}
          title={shuffleEnabled ? "Shuffle on (S)" : "Shuffle off (S)"}
        >
          <Icon name="shuffle" size={15} />
        </button>
        <VolumeControl volume={volume} onChange={setVolume} />
      </div>
    </div>
  );
}
