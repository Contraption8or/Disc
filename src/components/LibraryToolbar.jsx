import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import TagCreateMenu from "./TagCreateMenu.jsx";
import Dropdown from "./Dropdown.jsx";
import Icon from "./Icon.jsx";
import "./LibraryToolbar.css";

const KEYS = [
  "Any Key",
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

const SORT_OPTIONS = [
  { value: "folder", label: "Folder order" },
  { value: "name", label: "Name" },
  { value: "dateAdded", label: "Date added" },
  { value: "duration", label: "Duration" },
  { value: "size", label: "Size" },
  { value: "bpm", label: "BPM" },
];

export default function LibraryToolbar({
  query,
  onQueryChange,
  bpmRange,
  onBpmRangeChange,
  keyFilter,
  onKeyFilterChange,
  resultSummary,
  onPlayAll,
  onShufflePlay,
  playDisabled,
  sortKey,
  onSortKeyChange,
  sortDir,
  onToggleSortDir,
  showDuplicatesOnly,
  onToggleDuplicates,
  duplicateCount,
  onImportFiles,
  importDisabled,
}) {
  const { onCreateTag } = useDisc();
  const [creatingTag, setCreatingTag] = useState(false);

  // Same idea for search — the input feels instant, but the expensive
  // "search everywhere across every folder" filter only re-runs after a
  // short pause instead of on every keystroke.
  const [localQuery, setLocalQuery] = useState(query);
  const queryDebounceRef = useRef(null);

  useEffect(() => () => clearTimeout(queryDebounceRef.current), []);

  function commitQuery(next) {
    setLocalQuery(next);
    clearTimeout(queryDebounceRef.current);
    queryDebounceRef.current = setTimeout(() => onQueryChange(next), 120);
  }

  // The BPM sliders update this instantly (so dragging feels smooth), but
  // only push the real, filter-triggering value up after a short pause —
  // re-filtering the whole library on every pixel of drag was the
  // expensive part, not moving the slider itself.
  const [localBpm, setLocalBpm] = useState(bpmRange);
  const bpmDebounceRef = useRef(null);

  useEffect(() => () => clearTimeout(bpmDebounceRef.current), []);

  function commitBpmRange(next) {
    setLocalBpm(next);
    clearTimeout(bpmDebounceRef.current);
    bpmDebounceRef.current = setTimeout(() => onBpmRangeChange(next), 120);
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
          placeholder="Search everywhere (tracks + tags)…"
        />
        {resultSummary && (
          <div className="library-toolbar__result-popover">{resultSummary}</div>
        )}
      </div>

      <button
        className="library-toolbar__button library-toolbar__button--ghost"
        title={
          importDisabled
            ? "Choose a music folder first"
            : "Pick files to add — a reliable alternative if drag-and-drop isn't working"
        }
        disabled={importDisabled}
        onClick={onImportFiles}
      >
        + Import
      </button>

      <div className="library-toolbar__tag-wrap">
        <button
          className="library-toolbar__button"
          title="Create a new tag"
          onClick={() => setCreatingTag((v) => !v)}
        >
          + Add Tag
        </button>
        {creatingTag && (
          <TagCreateMenu
            onCreate={(name, color) => onCreateTag(name, color)}
            onClose={() => setCreatingTag(false)}
          />
        )}
      </div>

      <div className="library-toolbar__divider" />

      <div className="library-toolbar__bpm">
        <span className="library-toolbar__label">BPM</span>
        <span className="library-toolbar__bpm-value">{localBpm[0]}</span>
        <input
          type="range"
          min="40"
          max="220"
          value={localBpm[0]}
          onChange={(e) =>
            commitBpmRange([Number(e.target.value), localBpm[1]])
          }
        />
        <input
          type="range"
          min="40"
          max="220"
          value={localBpm[1]}
          onChange={(e) =>
            commitBpmRange([localBpm[0], Number(e.target.value)])
          }
        />
        <span className="library-toolbar__bpm-value">{localBpm[1]}</span>
      </div>

      <div className="library-toolbar__divider" />

      <Dropdown
        className="library-toolbar__key"
        value={keyFilter}
        onChange={onKeyFilterChange}
        options={KEYS.map((k) => ({ value: k, label: k }))}
      />

      <div className="library-toolbar__divider" />

      <Dropdown
        className="library-toolbar__key library-toolbar__key--sort"
        value={sortKey}
        onChange={onSortKeyChange}
        title="Sort by"
        options={SORT_OPTIONS.map((opt) => ({
          value: opt.value,
          label: `Sort: ${opt.label}`,
        }))}
      />
      {sortKey !== "folder" && (
        <button
          className="library-toolbar__button library-toolbar__button--ghost"
          title={sortDir === "asc" ? "Ascending" : "Descending"}
          onClick={onToggleSortDir}
        >
          <Icon name={sortDir === "asc" ? "arrowUp" : "arrowDown"} size={13} />
        </button>
      )}

      <div className="library-toolbar__divider" />

      <button
        className={
          "library-toolbar__button library-toolbar__button--ghost" +
          (showDuplicatesOnly ? " library-toolbar__button--active" : "")
        }
        title={
          duplicateCount > 0
            ? `${duplicateCount} possible duplicate(s) — by exact file size, or waveform-shape similarity among tracks you've already opened`
            : "No likely duplicates found"
        }
        onClick={onToggleDuplicates}
      >
        ⧉ Duplicates{duplicateCount > 0 ? ` (${duplicateCount})` : ""}
      </button>

      <div className="library-toolbar__divider" />

      <button
        className="library-toolbar__button library-toolbar__button--ghost"
        title="Play everything currently shown, in order"
        disabled={playDisabled}
        onClick={onPlayAll}
      >
        <Icon name="play" size={12} style={{ marginRight: 5 }} />
        Play All
      </button>
      <button
        className="library-toolbar__button library-toolbar__button--ghost"
        title="Shuffle-play everything currently shown"
        disabled={playDisabled}
        onClick={onShufflePlay}
      >
        <Icon name="shuffle" size={13} style={{ marginRight: 5 }} />
        Shuffle
      </button>
    </div>
  );
}
