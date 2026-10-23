import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import "./LibraryToolbar.css";

export default function LibraryToolbar({
  query,
  onQueryChange,
  resultSummary,
  onPlayAll,
  onShufflePlay,
  playDisabled,
  onImportFiles,
  importDisabled,
}) {
  // The input feels instant, but the library-wide filter only re-runs
  // after a short pause rather than on every keystroke.
  const [localQuery, setLocalQuery] = useState(query);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function commitQuery(next) {
    setLocalQuery(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onQueryChange(next), 120);
  }

  return (
    <div className="library-toolbar">
      <div className="library-toolbar__search">
        <span className="library-toolbar__search-icon">
          <Icon name="search" size={13} />
        </span>
        <input
          value={localQuery}
          onChange={(e) => commitQuery(e.target.value)}
          placeholder="Search all music…"
        />
        {resultSummary && <div className="library-toolbar__result-popover">{resultSummary}</div>}
      </div>

      <div className="library-toolbar__spacer" />

      <button
        className="library-toolbar__button library-toolbar__button--ghost"
        title={importDisabled ? "Pick a folder first to add files to it" : "Add files to this folder"}
        disabled={importDisabled}
        onClick={onImportFiles}
      >
        + Import
      </button>
      <button
        className="library-toolbar__button library-toolbar__button--ghost"
        title="Play everything shown, in order"
        disabled={playDisabled}
        onClick={onPlayAll}
      >
        <Icon name="play" size={12} />
        Play
      </button>
      <button
        className="library-toolbar__button"
        title="Shuffle-play everything shown"
        disabled={playDisabled}
        onClick={onShufflePlay}
      >
        <Icon name="shuffle" size={13} />
        Shuffle
      </button>
    </div>
  );
}
