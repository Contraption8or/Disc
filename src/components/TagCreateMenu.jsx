import { useEffect, useRef, useState } from "react";
import "./TagCreateMenu.css";

const PRESET_COLORS = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#94d82d", "#38d9a9",
  "#22b8cf", "#4dabf7", "#748ffc", "#e599f7", "#f783ac",
];

export default function TagCreateMenu({ onCreate, onClose }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[6]);
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

  function submit() {
    if (!name.trim()) return;
    onCreate(name, color);
    onClose();
  }

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
        }}
      />
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
      <button className="tag-create-menu__create" onClick={submit}>
        Create Tag
      </button>
    </div>
  );
}
