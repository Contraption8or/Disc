import { useEffect, useRef } from "react";
import "./ThemeContextMenu.css";

export default function ThemeContextMenu({ x, y, onEdit, onDelete, onClose }) {
  const rootRef = useRef(null);

  useEffect(() => {
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

  return (
    <div className="theme-context-menu" style={{ left: x, top: y }} ref={rootRef}>
      <button
        className="theme-context-menu__option"
        onClick={() => {
          onEdit();
          onClose();
        }}
      >
        Edit theme…
      </button>
      <button
        className="theme-context-menu__option theme-context-menu__option--danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete theme
      </button>
    </div>
  );
}
