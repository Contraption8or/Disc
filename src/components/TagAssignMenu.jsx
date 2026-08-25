import { useEffect, useRef, useState } from "react";
import TagCreateMenu from "./TagCreateMenu.jsx";
import "./TagAssignMenu.css";

export default function TagAssignMenu({ availableTags, onAssign, onCreateAndAssign, onClose }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

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

  if (creating) {
    return (
      <TagCreateMenu
        onCreate={(name, color) => onCreateAndAssign(name, color)}
        onClose={onClose}
      />
    );
  }

  const filteredTags = query.trim()
    ? availableTags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : availableTags;

  return (
    <div className="tag-assign-menu" ref={rootRef}>
      {availableTags.length > 0 && (
        <input
          ref={inputRef}
          className="tag-assign-menu__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags…"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
      )}
      {availableTags.length === 0 ? (
        <div className="tag-assign-menu__empty">No other tags yet.</div>
      ) : filteredTags.length === 0 ? (
        <div className="tag-assign-menu__empty">No tags match "{query.trim()}".</div>
      ) : (
        filteredTags.map((tag) => (
          <button
            key={tag.id}
            className="tag-assign-menu__option"
            onClick={() => {
              onAssign(tag.id);
              onClose();
            }}
          >
            <span className="tag-assign-menu__dot" style={{ background: tag.color, color: tag.color }} />
            {tag.name}
          </button>
        ))
      )}
      <div className="tag-assign-menu__divider" />
      <button
        className="tag-assign-menu__option tag-assign-menu__option--accent"
        onClick={() => setCreating(true)}
      >
        + New tag
      </button>
    </div>
  );
}
