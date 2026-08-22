import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import "./TrackContextMenu.css";

const MENU_WIDTH = 200;
const MENU_HEIGHT = 250;

export default function TrackContextMenu({
  x,
  y,
  filePath,
  collections,
  onAddToCollection,
  onCreateCollection,
  inCollectionName,
  onRemoveFromCollection,
  onRename,
  onDelete,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
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

  // Rendered by a portal straight onto <body>, so these fixed coordinates
  // are relative to the real viewport — clamp so it can't render off-screen
  // near the right/bottom edge.
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

      {creatingCollection ? (
        <div className="track-context-menu__create-row">
          <input
            autoFocus
            className="track-context-menu__create-input"
            value={newCollectionName}
            placeholder="Collection name…"
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCollectionName.trim()) {
                onCreateCollection(newCollectionName.trim());
                onClose();
              }
            }}
          />
        </div>
      ) : collectionMenuOpen ? (
        <>
          {collections.length === 0 && (
            <div className="track-context-menu__empty">No collections yet.</div>
          )}
          {collections.map((c) => (
            <button
              key={c.id}
              className="track-context-menu__option"
              onClick={() => {
                onAddToCollection(c.id);
                onClose();
              }}
            >
              <span
                className="track-context-menu__dot"
                style={{ background: c.color ?? "var(--text-tertiary)", color: c.color ?? "var(--text-tertiary)" }}
              />
              {c.name}
            </button>
          ))}
          <button
            className="track-context-menu__option track-context-menu__option--accent"
            onClick={() => setCreatingCollection(true)}
          >
            + New Collection
          </button>
        </>
      ) : (
        <button
          className="track-context-menu__option"
          onClick={() => setCollectionMenuOpen(true)}
        >
          + Add to Collection
          <Icon name="chevronRight" size={11} style={{ marginLeft: 4 }} />
        </button>
      )}

      {inCollectionName && (
        <button
          className="track-context-menu__option"
          onClick={() => {
            onRemoveFromCollection();
            onClose();
          }}
        >
          Remove from "{inCollectionName}"
        </button>
      )}

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
        {armed ? "Click again to move to Trash" : "Delete Song…"}
      </button>
    </div>,
    document.body
  );
}
