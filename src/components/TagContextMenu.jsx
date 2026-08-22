import { useEffect, useRef, useState } from "react";
import "./TagContextMenu.css";

export default function TagContextMenu({ x, y, tagName, onRemoveFromTrack, onDeleteForever, onClose }) {
  const [armed, setArmed] = useState(false);
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
    <div className="tag-context-menu" style={{ left: x, top: y }} ref={rootRef}>
      <div className="tag-context-menu__title">"{tagName}"</div>

      <button
        className="tag-context-menu__option"
        onClick={() => {
          onRemoveFromTrack();
          onClose();
        }}
      >
        Remove from this track
      </button>

      <button
        className={
          "tag-context-menu__option tag-context-menu__option--danger" +
          (armed ? " tag-context-menu__option--armed" : "")
        }
        onClick={() => {
          if (armed) {
            onDeleteForever();
            onClose();
          } else {
            setArmed(true);
          }
        }}
      >
        {armed ? "Click again to delete forever" : "Delete tag completely…"}
      </button>
    </div>
  );
}
