import { useEffect, useMemo, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { TAG_COLORS as PRESET_COLORS } from "../tags/tagColors.js";
import { findExactTag, suggestTags } from "../tags/tagSuggestions.js";
import "./TagCreateMenu.css";

// onUseExisting is optional: menus that create a tag *and* attach it to
// something (the batch bar, the per-track assign menu) pass it so picking a
// suggestion can attach the existing tag directly. Without it (the plain
// "+ Add Tag" toolbar button) a suggestion just corrects the typed text.
export default function TagCreateMenu({ onCreate, onClose, onUseExisting }) {
  const { tags } = useDisc();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[6]);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const exact = useMemo(() => findExactTag(name, tags), [name, tags]);
  const suggestions = useMemo(
    () => suggestTags(name, tags).filter((t) => t.id !== exact?.id),
    [name, tags, exact]
  );

  useEffect(() => {
    inputRef.current?.focus();
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

  function pickExisting(tag) {
    if (onUseExisting) {
      onUseExisting(tag);
      onClose();
    } else {
      // Nothing to attach it to here — just fix the spelling in the box.
      setName(tag.name);
      inputRef.current?.focus();
    }
  }

  function submit() {
    if (!name.trim()) return;
    if (exact) {
      // Never create a second tag with the same name.
      if (onUseExisting) pickExisting(exact);
      return;
    }
    onCreate(name, color);
    onClose();
  }

  const primaryLabel = exact
    ? onUseExisting
      ? `Use "${exact.name}"`
      : "Tag already exists"
    : "Create Tag";

  return (
    <div className="tag-create-menu" ref={rootRef}>
      <input
        ref={inputRef}
        className="tag-create-menu__input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tag name…"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          // Tab accepts the top suggestion, like autocomplete.
          if (e.key === "Tab" && suggestions.length > 0 && !e.shiftKey) {
            e.preventDefault();
            pickExisting(suggestions[0]);
          }
        }}
      />

      {(exact || suggestions.length > 0) && (
        <div className="tag-create-menu__suggest">
          <div className="tag-create-menu__suggest-label">
            {exact ? "A tag with this name already exists" : "Did you mean"}
          </div>
          <div className="tag-create-menu__suggest-list">
            {exact && (
              <button
                className="tag-create-menu__chip tag-create-menu__chip--exact"
                onClick={() => pickExisting(exact)}
              >
                <span className="tag-create-menu__chip-dot" style={{ background: exact.color }} />
                {exact.name}
              </button>
            )}
            {suggestions.map((t) => (
              <button
                key={t.id}
                className="tag-create-menu__chip"
                onClick={() => pickExisting(t)}
                title={onUseExisting ? "Use this existing tag" : "Use this spelling"}
              >
                <span className="tag-create-menu__chip-dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
          {!exact && suggestions.length > 0 && (
            <div className="tag-create-menu__suggest-hint">Tab to accept the first</div>
          )}
        </div>
      )}

      <div className="tag-create-menu__swatches">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={
              "tag-create-menu__swatch" +
              (c === color ? " tag-create-menu__swatch--active" : "")
            }
            style={{ background: c, color: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <button
        className="tag-create-menu__create"
        onClick={submit}
        disabled={Boolean(exact) && !onUseExisting}
      >
        {primaryLabel}
      </button>
    </div>
  );
}
