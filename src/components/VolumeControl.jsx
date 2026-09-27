import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import "./VolumeControl.css";

export default function VolumeControl({ volume, onChange }) {
  const iconName = volume === 0 ? "volumeMute" : volume < 0.5 ? "volumeLow" : "volumeHigh";
  // Right-clicking opens a small box for typing an exact percentage,
  // rather than trying to land it with the slider.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  function openEditor(e) {
    e.preventDefault();
    setDraft(String(Math.round(volume * 100)));
    setEditing(true);
  }

  function commit() {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) {
      onChange(Math.min(100, Math.max(0, n)) / 100);
    }
    setEditing(false);
  }

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setEditing(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing]);

  return (
    <div
      className="volume-control"
      title="Volume — right-click to type an exact percentage"
      ref={rootRef}
      onContextMenu={openEditor}
    >
      <span className="volume-control__icon">
        <Icon name={iconName} size={15} />
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        className="volume-control__slider"
      />

      {editing && (
        <div className="volume-control__editor">
          <input
            ref={inputRef}
            className="volume-control__editor-input"
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setEditing(false);
              // Keep the app's global shortcuts (space = play/pause, etc.)
              // from firing while typing a number.
              e.stopPropagation();
            }}
          />
          <span className="volume-control__editor-unit">%</span>
        </div>
      )}
    </div>
  );
}
