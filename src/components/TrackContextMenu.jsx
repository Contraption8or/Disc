import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./TrackContextMenu.css";

const MENU_WIDTH = 200;
const MENU_HEIGHT = 170;

export default function TrackContextMenu({ x, y, filePath, onRename, onDelete, onClose }) {
  const [copied, setCopied] = useState(false);
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

  // Portaled onto <body>, so these fixed coordinates are relative to the
  // real viewport — clamp so it can't render off-screen.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  return createPortal(
    <div className="track-context-menu" style={{ left, top }} ref={rootRef}>
      <button
        className="track-context-menu__option"
        disabled={!onRename}
        title={!onRename ? "Can't rename — this file isn't reachable right now" : undefined}
        onClick={() => {
          onRename?.();
          onClose();
        }}
      >
        Rename
      </button>
      <button
        className="track-context-menu__option"
        onClick={() => {
          window.disc?.copyToClipboard(filePath);
          setCopied(true);
          setTimeout(onClose, 500);
        }}
      >
        {copied ? "Copied!" : "Copy File Path"}
      </button>
      <button
        className="track-context-menu__option"
        onClick={() => {
          window.disc?.revealInExplorer(filePath);
          onClose();
        }}
      >
        Reveal in Explorer
      </button>

      <div className="track-context-menu__divider" />
      <button
        className={
          "track-context-menu__option track-context-menu__option--danger" +
          (armed ? " track-context-menu__option--armed" : "")
        }
        onClick={() => {
          if (armed) {
            onDelete();
            onClose();
          } else {
            setArmed(true);
          }
        }}
      >
        {armed ? "Click again to move it to Trash" : "Delete Song…"}
      </button>
    </div>,
    document.body
  );
}
