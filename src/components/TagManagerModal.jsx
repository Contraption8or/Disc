import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDisc } from "../context/DiscContext.jsx";
import { TAG_COLORS } from "../tags/tagColors.js";
import Icon from "./Icon.jsx";
import "./TagManagerModal.css";

const POPOVER_WIDTH = 180;

export default function TagManagerModal({ onClose }) {
  const {
    tags,
    trackTags,
    onRenameTag,
    onRecolorTag,
    onDeleteTag,
    onMergeTags,
    onSetTagFilter,
  } = useDisc();

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  // Popovers are portaled straight onto <body> (see the color/merge
  // dropdowns below) rather than positioned relative to their row, since
  // .tag-manager__list scrolls its own content — anything absolutely
  // positioned inside a scrolling container gets clipped to it the moment
  // it would extend past the container's edge, which is exactly what was
  // cutting these off. Each popover's `rect` is the trigger button's own
  // getBoundingClientRect(), captured at open time.
  const [colorPicker, setColorPicker] = useState(null); // { tagId, rect } | null
  const [mergeMenu, setMergeMenu] = useState(null); // { tagId, rect } | null
  const [deleteArmedId, setDeleteArmedId] = useState(null);

  useEffect(() => {
    searchRef.current?.focus();
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // A scrolled list invalidates whatever rect a popover was positioned
  // from, since the trigger button has moved out from under it.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function closePopovers() {
      setColorPicker(null);
      setMergeMenu(null);
    }
    el.addEventListener("scroll", closePopovers);
    return () => el.removeEventListener("scroll", closePopovers);
  }, []);

  const usageCounts = useMemo(() => {
    const counts = new Map();
    for (const ids of Object.values(trackTags)) {
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [trackTags]);

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  const filteredTags = query.trim()
    ? sortedTags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sortedTags;

  function startRename(tag) {
    setEditingId(tag.id);
    setEditValue(tag.name);
    setColorPicker(null);
    setMergeMenu(null);
    setDeleteArmedId(null);
  }

  function commitRename() {
    if (editingId) onRenameTag(editingId, editValue);
    setEditingId(null);
  }

  function viewTracks(tag) {
    onSetTagFilter(tag.id);
    onClose();
  }

  return (
    <div className="tag-manager__backdrop">
      <div className="tag-manager" ref={rootRef}>
        <div className="tag-manager__title">Manage Tags</div>
        <p className="tag-manager__subtitle">
          {tags.length} tag{tags.length === 1 ? "" : "s"} · rename, recolor, merge, or delete
        </p>

        <input
          ref={searchRef}
          className="tag-manager__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags…"
        />

        <div className="tag-manager__list" ref={listRef}>
          {tags.length === 0 ? (
            <div className="tag-manager__empty">
              No tags yet — create one from a track's Details panel.
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="tag-manager__empty">No tags match "{query.trim()}".</div>
          ) : (
            filteredTags.map((tag) => (
              <div key={tag.id} className="tag-manager__row">
                <button
                  className="tag-manager__swatch"
                  style={{ background: tag.color }}
                  title="Change color"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMergeMenu(null);
                    setColorPicker((cur) =>
                      cur?.tagId === tag.id ? null : { tagId: tag.id, rect }
                    );
                  }}
                />

                {editingId === tag.id ? (
                  <input
                    className="tag-manager__rename-input"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    className="tag-manager__name"
                    title="Click to rename"
                    onClick={() => startRename(tag)}
                  >
                    {tag.name}
                  </button>
                )}

                <span className="tag-manager__count">
                  {usageCounts.get(tag.id) || 0} track
                  {(usageCounts.get(tag.id) || 0) === 1 ? "" : "s"}
                </span>

                <button
                  className="tag-manager__view-button"
                  disabled={!usageCounts.get(tag.id)}
                  title="Show only tracks with this tag"
                  onClick={() => viewTracks(tag)}
                >
                  View
                </button>

                <button
                  className="tag-manager__icon-button"
                  title="Merge into another tag"
                  disabled={tags.length < 2}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setColorPicker(null);
                    setMergeMenu((cur) =>
                      cur?.tagId === tag.id ? null : { tagId: tag.id, rect }
                    );
                  }}
                >
                  <Icon name="arrowRight" size={13} />
                </button>

                <button
                  className={
                    "tag-manager__icon-button tag-manager__icon-button--danger" +
                    (deleteArmedId === tag.id ? " tag-manager__icon-button--armed" : "")
                  }
                  title={deleteArmedId === tag.id ? "Click again to delete forever" : "Delete tag"}
                  onClick={() => {
                    if (deleteArmedId === tag.id) {
                      onDeleteTag(tag.id);
                      setDeleteArmedId(null);
                    } else {
                      setDeleteArmedId(tag.id);
                    }
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        <button className="tag-manager__close" onClick={onClose}>
          Close
        </button>
      </div>

      {colorPicker &&
        createPortal(
          <div
            className="tag-manager__color-popover"
            style={popoverStyle(colorPicker.rect)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                className="tag-manager__color-swatch"
                style={{ background: c }}
                onClick={() => {
                  onRecolorTag(colorPicker.tagId, c);
                  setColorPicker(null);
                }}
              />
            ))}
          </div>,
          document.body
        )}

      {mergeMenu &&
        createPortal(
          <div
            className="tag-manager__merge-popover"
            style={popoverStyle(mergeMenu.rect)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="tag-manager__merge-title">
              Merge "{tags.find((t) => t.id === mergeMenu.tagId)?.name}" into…
            </div>
            {sortedTags
              .filter((t) => t.id !== mergeMenu.tagId)
              .map((t) => (
                <button
                  key={t.id}
                  className="tag-manager__merge-option"
                  onClick={() => {
                    onMergeTags(mergeMenu.tagId, t.id);
                    setMergeMenu(null);
                  }}
                >
                  <span className="tag-manager__color-swatch" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// Portaled onto <body>, so these are fixed/viewport coordinates — clamp
// horizontally so a popover near the right edge doesn't render off-screen.
function popoverStyle(rect) {
  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
  return { position: "fixed", left, top: rect.bottom + 6 };
}
