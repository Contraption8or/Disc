import { useEffect, useRef } from "react";
import "./ContextMenu.css";

export default function ContextMenu({ x, y, message, onConfirm, onCancel }) {
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        onCancel();
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onConfirm, onCancel]);

  return (
    <div className="context-menu" style={{ left: x, top: y }} ref={rootRef}>
      <div className="context-menu__message">{message}</div>
      <div className="context-menu__actions">
        <button className="context-menu__no" onClick={onCancel}>
          No
        </button>
        <button className="context-menu__yes" onClick={onConfirm}>
          Yes
        </button>
      </div>
    </div>
  );
}
