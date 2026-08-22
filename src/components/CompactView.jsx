import { useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { filterTracksByQuery } from "../utils/search.js";
import { stripExtension } from "../utils/format.js";
import NowPlayingBar from "./NowPlayingBar.jsx";
import "./CompactView.css";

export default function CompactView() {
  const { allTracks, tags, trackTags, togglePlayPause, onExitCompactMode } = useDisc();
  const [query, setQuery] = useState("");

  const results = query.trim()
    ? filterTracksByQuery(allTracks, query, tags, trackTags).slice(0, 8)
    : [];

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

      <NowPlayingBar />
    </div>
  );
}
