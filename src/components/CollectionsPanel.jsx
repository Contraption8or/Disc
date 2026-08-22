import { useEffect, useRef, useState } from "react";
import ColorPicker from "./ColorPicker.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { useDisc } from "../context/DiscContext.jsx";
import "./CollectionsPanel.css";

const COLOR_PICKER_WIDTH = 190;
const COLOR_PICKER_HEIGHT = 130;

export default function CollectionsPanel() {
  const {
    activeFolderId,
    setActiveFolderId,
    collections,
    onCreateCollection,
    onRenameCollection,
    onDeleteCollection,
    onSetCollectionColor,
  } = useDisc();

  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState(null);
  const [collectionColorPicker, setCollectionColorPicker] = useState(null); // { collectionId, x, y, color } | null
  const collectionInputRef = useRef(null);

  useEffect(() => {
    if (editingCollectionId) {
      collectionInputRef.current?.focus();
      collectionInputRef.current?.select();
    }
  }, [editingCollectionId]);

  function createCollection() {
    const id = onCreateCollection("New Collection");
    setActiveFolderId(id);
    setEditingCollectionId(id);
  }

  function openCollectionColorPicker(e, collection) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setCollectionColorPicker({
      collectionId: collection.id,
      x: Math.min(rect.left, window.innerWidth - COLOR_PICKER_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - COLOR_PICKER_HEIGHT - 8),
      color: collection.color,
    });
  }

  return (
    <div className="collections-panel">
      <div className="collections-panel__heading">
        <span>Collections</span>
        <button
          className="collections-panel__add"
          title="New collection"
          onClick={createCollection}
        >
          +
        </button>
      </div>

      <div className="collections-panel__list-area">
        <div className="collections-panel__list">
          {collections.map((c) => (
            <div key={c.id} className="collections-panel__row">
              {editingCollectionId === c.id ? (
                <input
                  ref={collectionInputRef}
                  className="collections-panel__rename-input"
                  defaultValue={c.name}
                  onBlur={(e) => {
                    onRenameCollection(c.id, e.target.value);
                    setEditingCollectionId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingCollectionId(null);
                  }}
                />
              ) : (
                <>
                  <button
                    className="collections-panel__color-dot"
                    style={{ background: c.color ?? "var(--text-tertiary)", color: c.color ?? "var(--text-tertiary)" }}
                    title="Change collection color"
                    onClick={(e) => openCollectionColorPicker(e, c)}
                  />
                  <button
                    className={
                      "collections-panel__item" +
                      (activeFolderId === c.id ? " collections-panel__item--active" : "")
                    }
                    onClick={() => setActiveFolderId(c.id)}
                    onDoubleClick={() => setEditingCollectionId(c.id)}
                  >
                    <span className="collections-panel__item-name">{c.name}</span>
                  </button>
                  <span className="collections-panel__count">{c.trackIds.length}</span>
                  <button
                    className="collections-panel__delete"
                    title="Delete collection"
                    onClick={() => setDeleteCollectionTarget(c)}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
          {collections.length === 0 && (
            <div className="collections-panel__empty">
              No collections yet — right-click any track (or select
              several) and "+ Add to Collection".
            </div>
          )}
        </div>
      </div>

      {deleteCollectionTarget && (
        <ConfirmModal
          title="Delete collection"
          message={`Delete "${deleteCollectionTarget.name}"? This won't delete any mp3 files or remove them from anywhere else — just this collection.`}
          confirmLabel="Delete"
          onConfirm={() => {
            onDeleteCollection(deleteCollectionTarget.id);
            if (activeFolderId === deleteCollectionTarget.id) setActiveFolderId("favorites");
            setDeleteCollectionTarget(null);
          }}
          onCancel={() => setDeleteCollectionTarget(null)}
        />
      )}

      {collectionColorPicker && (
        <ColorPicker
          x={collectionColorPicker.x}
          y={collectionColorPicker.y}
          color={collectionColorPicker.color}
          onChange={(color) =>
            onSetCollectionColor(collectionColorPicker.collectionId, color)
          }
          onClose={() => setCollectionColorPicker(null)}
        />
      )}
    </div>
  );
}
