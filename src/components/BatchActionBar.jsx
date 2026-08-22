import { useEffect, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import TagCreateMenu from "./TagCreateMenu.jsx";
import Icon from "./Icon.jsx";
import "./BatchActionBar.css";

export default function BatchActionBar({ selectedIds, onClear }) {
  const {
    tags,
    onSetFavorite,
    onAssignTagToTracks,
    onCreateTag,
    onBatchMove,
    customFolders,
    collections,
    onAddTracksToCollection,
    onCreateCollection,
    onDeleteTracks,
  } = useDisc();

  const [tagListOpen, setTagListOpen] = useState(false);
  const [tagCreateOpen, setTagCreateOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [collectionListOpen, setCollectionListOpen] = useState(false);
  const [collectionCreateOpen, setCollectionCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  // Armed on the first click, only actually deletes on a second — same
  // double-click-to-confirm pattern as the per-track context menu, so a
  // batch delete (which can wipe out a lot at once) is hard to trigger by
  // accident.
  const [deleteArmed, setDeleteArmed] = useState(false);

  const ids = Array.from(selectedIds);

  // Un-arm the delete confirmation whenever the selection itself changes,
  // so a stray second click can't land on a completely different batch of
  // tracks than the one that was actually armed.
  useEffect(() => {
    setDeleteArmed(false);
  }, [selectedIds]);

  const moveTargets = customFolders
    .filter((f) => f.folderPath)
    .map((f) => ({ id: f.id, name: f.name, path: f.folderPath }));

  function handleCreateAndAssignTag(name, color) {
    const id = onCreateTag(name, color);
    if (id) onAssignTagToTracks(ids, id);
  }

  function handleCreateAndAddToCollection() {
    if (!newCollectionName.trim()) return;
    const id = onCreateCollection(newCollectionName.trim());
    onAddTracksToCollection(ids, id);
    setNewCollectionName("");
    setCollectionCreateOpen(false);
  }

  return (
    <div className="batch-bar">
      <div className="batch-bar__count">{ids.length} selected</div>

      <button
        className="batch-bar__button"
        onClick={() => onSetFavorite(ids, true)}
        title="Add all selected to Favorites"
      >
        <Icon name="heartFilled" size={13} style={{ marginRight: 5 }} />
        Favorite
      </button>
      <button
        className="batch-bar__button"
        onClick={() => onSetFavorite(ids, false)}
        title="Remove all selected from Favorites"
      >
        <Icon name="heartOutline" size={13} style={{ marginRight: 5 }} />
        Unfavorite
      </button>

      <div className="batch-bar__wrap">
        <button
          className="batch-bar__button"
          onClick={() => setTagListOpen((v) => !v)}
        >
          + Tag
        </button>
        {tagListOpen && (
          <div className="batch-bar__tag-menu">
            {tags.length === 0 ? (
              <div className="batch-bar__tag-empty">No tags yet.</div>
            ) : (
              tags.map((tag) => (
                <button
                  key={tag.id}
                  className="batch-bar__tag-option"
                  onClick={() => {
                    onAssignTagToTracks(ids, tag.id);
                    setTagListOpen(false);
                  }}
                >
                  <span className="batch-bar__tag-dot" style={{ background: tag.color, color: tag.color }} />
                  {tag.name}
                </button>
              ))
            )}
            <div className="batch-bar__tag-divider" />
            <button
              className="batch-bar__tag-option batch-bar__tag-option--accent"
              onClick={() => {
                setTagListOpen(false);
                setTagCreateOpen(true);
              }}
            >
              + New tag
            </button>
          </div>
        )}
        {tagCreateOpen && (
          <TagCreateMenu
            onCreate={handleCreateAndAssignTag}
            onClose={() => setTagCreateOpen(false)}
          />
        )}
      </div>

      <div className="batch-bar__wrap">
        <button
          className="batch-bar__button"
          onClick={() => setCollectionListOpen((v) => !v)}
        >
          + Collection
        </button>
        {collectionListOpen && (
          <div className="batch-bar__tag-menu">
            {collections.length === 0 ? (
              <div className="batch-bar__tag-empty">No collections yet.</div>
            ) : (
              collections.map((c) => (
                <button
                  key={c.id}
                  className="batch-bar__tag-option"
                  onClick={() => {
                    onAddTracksToCollection(ids, c.id);
                    setCollectionListOpen(false);
                  }}
                >
                  <span
                    className="batch-bar__tag-dot"
                    style={{ background: c.color ?? "var(--text-tertiary)", color: c.color ?? "var(--text-tertiary)" }}
                  />
                  {c.name}
                </button>
              ))
            )}
            <div className="batch-bar__tag-divider" />
            <button
              className="batch-bar__tag-option batch-bar__tag-option--accent"
              onClick={() => {
                setCollectionListOpen(false);
                setCollectionCreateOpen(true);
              }}
            >
              + New collection
            </button>
          </div>
        )}
        {collectionCreateOpen && (
          <div className="batch-bar__tag-menu">
            <input
              autoFocus
              className="batch-bar__create-input"
              value={newCollectionName}
              placeholder="Collection name…"
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAndAddToCollection();
                if (e.key === "Escape") setCollectionCreateOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="batch-bar__wrap">
        <button
          className="batch-bar__button"
          onClick={() => setMoveMenuOpen((v) => !v)}
          disabled={moveTargets.length === 0}
          title={
            moveTargets.length === 0
              ? "No folders with a real directory to move into"
              : "Move selected files to a folder"
          }
        >
          <Icon name="arrowRight" size={13} style={{ marginRight: 5 }} />
          Move to folder
        </button>
        {moveMenuOpen && (
          <div className="batch-bar__tag-menu">
            {moveTargets.map((target) => (
              <button
                key={target.id}
                className="batch-bar__tag-option"
                onClick={() => {
                  onBatchMove(ids, target.path);
                  setMoveMenuOpen(false);
                  onClear();
                }}
              >
                {target.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className={"batch-bar__button batch-bar__button--danger" + (deleteArmed ? " batch-bar__button--armed" : "")}
        onClick={() => {
          if (deleteArmed) {
            onDeleteTracks(ids);
            setDeleteArmed(false);
            onClear();
          } else {
            setDeleteArmed(true);
          }
        }}
        title="Move all selected files to the OS Trash/Recycle Bin (recoverable)"
      >
        <Icon name="trash" size={13} style={{ marginRight: 5 }} />
        {deleteArmed ? `Click again to delete ${ids.length}` : "Delete"}
      </button>

      <button className="batch-bar__clear" onClick={onClear} title="Clear selection">
        × Clear
      </button>
    </div>
  );
}
