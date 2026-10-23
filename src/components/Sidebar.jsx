import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import Icon from "./Icon.jsx";
import "./Sidebar.css";

// The one left-hand column: Library views at the top, then every folder as
// a plain name. Its width is fixed (--sidebar-width) — it never grows or
// shrinks with the window; the track list takes whatever space is left.
export default function Sidebar() {
  const {
    folders,
    activeFolderId,
    setActiveFolderId,
    missingFolderIds,
    onAddFolders,
    onRemoveFolder,
    onRenameFolder,
  } = useDisc();
  const [editingId, setEditingId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null); // folder | null
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  function commitRename(id, value) {
    setEditingId(null);
    onRenameFolder(id, value);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__scroll">
        <button
          className={"sidebar__item" + (activeFolderId === "all" ? " sidebar__item--active" : "")}
          onClick={() => setActiveFolderId("all")}
        >
          All Music
        </button>
        <button
          className={
            "sidebar__item" + (activeFolderId === "favorites" ? " sidebar__item--active" : "")
          }
          onClick={() => setActiveFolderId("favorites")}
        >
          Favorites
        </button>

        <div className="sidebar__heading">
          <span>Folders</span>
          <button className="sidebar__add" onClick={onAddFolders} title="Add folders">
            <Icon name="newGroup" size={13} />
          </button>
        </div>

        {folders.length === 0 && (
          <button className="sidebar__empty" onClick={onAddFolders}>
            + Add your music folders
          </button>
        )}

        {folders.map((folder) => (
          <div key={folder.id} className="sidebar__row">
            {editingId === folder.id ? (
              <input
                ref={inputRef}
                className="sidebar__rename"
                defaultValue={folder.name}
                onBlur={(e) => commitRename(folder.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                className={
                  "sidebar__item" +
                  (activeFolderId === folder.id ? " sidebar__item--active" : "") +
                  (missingFolderIds.has(folder.id) ? " sidebar__item--missing" : "")
                }
                onClick={() => setActiveFolderId(folder.id)}
                onDoubleClick={() => setEditingId(folder.id)}
                title={
                  missingFolderIds.has(folder.id)
                    ? `Can't reach ${folder.folderPath} right now`
                    : `${folder.folderPath} — double-click to rename`
                }
              >
                <span className="sidebar__item-name">{folder.name}</span>
              </button>
            )}
            {editingId !== folder.id && (
              <button
                className="sidebar__remove"
                title="Remove from Disc (your files aren't touched)"
                onClick={() => setRemoveTarget(folder)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Remove folder"
          message={`Remove "${removeTarget.name}" from Disc? Your files on disk aren't touched — it just stops showing here.`}
          confirmLabel="Remove"
          onConfirm={() => {
            onRemoveFolder(removeTarget.id);
            setRemoveTarget(null);
          }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </aside>
  );
}
