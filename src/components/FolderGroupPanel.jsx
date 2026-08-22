import { useEffect, useRef, useState } from "react";
import FolderCreateMenu from "./FolderCreateMenu.jsx";
import FolderContextMenu from "./FolderContextMenu.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ColorPicker from "./ColorPicker.jsx";
import Icon from "./Icon.jsx";
import { useDisc } from "../context/DiscContext.jsx";
import "./Sidebar.css";

const SYSTEM_FOLDERS = [{ id: "favorites", name: "Favorites", system: true, color: "#ff6fa5" }];

const MENU_WIDTH = 200;
const MENU_HEIGHT = 90;
const COLOR_PICKER_WIDTH = 190;
const COLOR_PICKER_HEIGHT = 130;

export default function FolderGroupPanel({ params }) {
  const groupId = params?.groupId ?? "primary";
  const isPrimary = groupId === "primary";

  const {
    activeFolderId,
    setActiveFolderId,
    customFolders,
    onCreateFolder,
    onCreateFolderFromPath,
    onRenameFolder,
    onDeleteFolder,
    onLinkFolderDirectory,
    onUnlinkFolderDirectory,
    onSetFolderColor,
    onReorderFolders,
    onToggleSectionCollapsed,
    onSortSectionAlphabetically,
    folderGroups,
    onCreateFolderGroup,
    onRenameFolderGroup,
    onDeleteFolderGroup,
  } = useDisc();

  const group = folderGroups.find((g) => g.id === groupId) || {
    id: groupId,
    name: "Group",
    deletable: true,
  };
  const groupFolders = customFolders.filter((f) => f.groupId === groupId);
  // Top-level: Sections themselves, plus any folder that isn't nested
  // inside one. Order follows the underlying array, same as before.
  // Top-level: no parent Section at all, regardless of type — this now
  // matters for Sections too, not just folders, since a Section can be
  // nested inside another Section.
  const topLevelItems = groupFolders.filter((f) => !f.sectionId);

  const [editingId, setEditingId] = useState(null); // folder/section id being renamed
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [createMenu, setCreateMenu] = useState(null); // { x, y } | null
  const [deleteTarget, setDeleteTarget] = useState(null); // item | null
  const [sortTarget, setSortTarget] = useState(null); // section | null
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null); // folder | null
  const [colorPicker, setColorPicker] = useState(null); // { folderId, x, y, color } | null
  const [folderContextMenu, setFolderContextMenu] = useState(null); // { x, y, item } | null
  const [draggedId, setDraggedId] = useState(null);
  // Two distinct drop indicators: dragOverId means "insert before this
  // item" (a line), dragOverSectionId means "drop INTO this Section" (a
  // highlight on the Section's header) — only one is ever active, driven
  // by whichever handler last fired.
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverSectionId, setDragOverSectionId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const inputRef = useRef(null);
  const groupNameInputRef = useRef(null);
  const listDragCounterRef = useRef(0);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  function itemMatchesQuery(item) {
    return item.name.toLowerCase().includes(trimmedQuery);
  }

  // Does this item match, or — if it's a Section — does anything nested
  // inside it (at any depth) match? This is what lets search surface a
  // folder buried inside a collapsed Section: the Section itself counts
  // as "matching" if any descendant does, so it stays visible and gets
  // force-expanded while searching. The depth cap is a defensive
  // backstop — drag-time cycle prevention (see handleReorderFolders in
  // App.jsx) should make a cyclic sectionId reference impossible, but
  // this is genuine recursion, so if that assumption were ever wrong,
  // an unbounded version of this would stack-overflow rather than just
  // hang.
  function subtreeMatches(item, depth = 0) {
    if (depth > 50) return false;
    if (itemMatchesQuery(item)) return true;
    if (item.type !== "divider") return false;
    return groupFolders.some((f) => f.sectionId === item.id && subtreeMatches(f, depth + 1));
  }

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (editingGroupName) {
      groupNameInputRef.current?.focus();
      groupNameInputRef.current?.select();
    }
  }, [editingGroupName]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  // Select a custom folder, hit Delete/Backspace, confirm, gone. Sections
  // are deleted via their own trash button instead, since they're never
  // "selected" as a library filter. Ignored while typing in a text field.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const folder = groupFolders.find(
        (f) => f.id === activeFolderId && f.type !== "divider"
      );
      if (folder) setDeleteTarget(folder);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFolderId, groupFolders]);

  function createFolder() {
    const id = onCreateFolder("folder", groupId);
    setActiveFolderId(id);
    setEditingId(id);
  }

  function createSection() {
    const id = onCreateFolder("divider", groupId);
    setEditingId(id);
  }

  function deleteItem(id) {
    onDeleteFolder(id);
    if (activeFolderId === id) setActiveFolderId("favorites");
  }

  // Right-click on the empty space (not on a folder/Section itself) opens
  // the "New Folder / New Section" menu at the cursor.
  function handleContextMenu(e) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setCreateMenu({
      x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 8),
    });
  }

  function openColorPicker(e, folder) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setColorPicker({
      folderId: folder.id,
      x: Math.min(rect.left, window.innerWidth - COLOR_PICKER_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - COLOR_PICKER_HEIGHT - 8),
      color: folder.color,
    });
  }

  // Right-click directly on a folder or Section (not the empty space)
  // opens a small menu with Unlink (if applicable) and Delete.
  function handleFolderContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({ x: e.clientX, y: e.clientY, item });
  }

  // --- Drag-to-reorder, drag-between-groups, AND drag-into/out-of a -----
  // --- Section --------------------------------------------------------
  // draggedId (local state) drives this panel's own "being dragged"
  // visual dimming, but the actual move logic always reads from
  // e.dataTransfer — that's the one thing that reliably carries the
  // dragged folder's id across to a *different* panel instance (a
  // different group's panel is a completely separate React component; it
  // has no way to see this panel's local state, but dataTransfer works at
  // the browser level regardless of which component is on which end).
  //
  // The id is carried under a custom MIME type — "application/x-disc-
  // folder-id" — rather than the generic "text/plain". That distinction
  // actually matters: dockview's own panel-tab dragging also sets
  // "text/plain" on its dataTransfer (a common practice for drag
  // sources), so checking for that generic type isn't specific enough to
  // tell "someone's reordering a folder" apart from "someone's moving a
  // whole panel" — a real bug this ran into once already. A custom,
  // namespaced type is something only Disc's own drag-start would ever
  // set, so there's no ambiguity. Dragging a real folder in from Explorer
  // (or any OS file browser) is a third, completely different kind of
  // drag — OS-originated drags always include a "Files" entry in
  // dataTransfer.types, which nothing else sets either. Paths have to be
  // extracted synchronously, right in the drop handler — dataTransfer
  // becomes unreliable to read from after any await, so that part never
  // awaits anything itself; the actual directory check and folder
  // creation happen asynchronously afterward in onCreateFolderFromPath,
  // once the event object is no longer needed at all.

  // Disc has more than one drag-and-drop system running at once — this
  // one (folder reordering + OS drops) and dockview's own panel-dragging,
  // which can pass right over a folder panel's content while someone's
  // moving a whole panel around the layout. Every handler below checks
  // this first and does *nothing* — no preventDefault, no state changes —
  // for any drag that isn't positively identified as one of ours (see the
  // custom MIME type note above for why a generic type check wasn't
  // actually enough to guarantee that on its own).
  function isRelevantDrag(e) {
    return (
      Boolean(draggedId) ||
      e.dataTransfer.types.includes("application/x-disc-folder-id") ||
      e.dataTransfer.types.includes("Files")
    );
  }

  function handleExternalFolderDrop(e, targetSectionId) {
    if (!e.dataTransfer.types.includes("Files") || !window.disc) return false;
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.disc.getPathForFile(f))
      .filter(Boolean);
    paths.forEach((p) => onCreateFolderFromPath(p, groupId, targetSectionId));
    return true;
  }

  function handleItemDragStart(e, id) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-disc-folder-id", id);
    setDraggedId(id);
  }

  // Hovering a folder row: "insert before this folder" — and, since a
  // folder carries a sectionId (or null for top-level), dropping here
  // also joins whatever Section that folder itself is (or isn't) in.
  function handleItemDragOver(e, id) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(id);
    setDragOverSectionId(null);
  }

  function handleItemDrop(e, id, sectionId) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (handleExternalFolderDrop(e, sectionId ?? null)) {
      resetDragState();
      return;
    }
    const sourceId = e.dataTransfer.getData("application/x-disc-folder-id") || draggedId;
    if (sourceId && sourceId !== id) onReorderFolders(sourceId, id, groupId, sectionId ?? null);
    resetDragState();
  }

  // Hovering a Section's own header row: "drop INTO this Section" —
  // distinct from inserting before a folder, so it gets its own
  // indicator (a highlight on the header) instead of an insertion line.
  function handleSectionHeaderDragOver(e, sectionId) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverSectionId(sectionId);
    setDragOverId(null);
  }

  function handleSectionHeaderDrop(e, sectionId) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (handleExternalFolderDrop(e, sectionId)) {
      resetDragState();
      return;
    }
    const sourceId = e.dataTransfer.getData("application/x-disc-folder-id") || draggedId;
    if (sourceId && sourceId !== sectionId) {
      onReorderFolders(sourceId, null, groupId, sectionId);
    }
    resetDragState();
  }

  function handleDragEnd() {
    resetDragState();
  }

  function resetDragState() {
    listDragCounterRef.current = 0;
    setDraggedId(null);
    setDragOverId(null);
    setDragOverSectionId(null);
  }

  // The drop-position indicator needs to clear itself the moment the drag
  // leaves this panel entirely — otherwise it's left stuck showing
  // wherever it last was if the drag moves on to a different group's
  // panel without ever dropping here. A plain dragleave on each row isn't
  // reliable for that on its own — moving the pointer across a row's own
  // child elements fires spurious enter/leave pairs even though the
  // pointer never actually left the row — so this is tracked once at the
  // whole list's level with a counter instead (enter/leave events for
  // children within the same container always balance out to zero; only
  // truly leaving the container leaves it negative/at zero).
  function handleListAreaDragEnter(e) {
    if (isRelevantDrag(e)) {
      listDragCounterRef.current += 1;
    }
  }

  function handleListAreaDragLeave() {
    listDragCounterRef.current -= 1;
    if (listDragCounterRef.current <= 0) {
      listDragCounterRef.current = 0;
      setDragOverId(null);
      setDragOverSectionId(null);
    }
  }

  // Dropping in the empty space below the list sends the item to the end
  // of *this* group, outside any Section (top-level).
  function handleListAreaDragOver(e) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
  }

  function handleListAreaDrop(e) {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    if (handleExternalFolderDrop(e, null)) {
      resetDragState();
      return;
    }
    const sourceId = e.dataTransfer.getData("application/x-disc-folder-id") || draggedId;
    if (sourceId) onReorderFolders(sourceId, null, groupId, null);
    resetDragState();
  }

  function renderFolderRow(folder, { depth = 0 } = {}) {
    const isDraggable = !folder.system && editingId !== folder.id;
    const isDragOver = dragOverId === folder.id;
    const dragHandlers = folder.system
      ? {}
      : {
          draggable: isDraggable,
          onDragStart: (e) => handleItemDragStart(e, folder.id),
          onDragOver: (e) => handleItemDragOver(e, folder.id),
          onDrop: (e) => handleItemDrop(e, folder.id, folder.sectionId ?? null),
          onDragEnd: handleDragEnd,
          onContextMenu: (e) => handleFolderContextMenu(e, folder),
        };
    return (
      <div
        key={folder.id}
        className={
          "sidebar__row" +
          (isDragOver ? " sidebar__row--drag-over" : "") +
          (draggedId === folder.id ? " sidebar__row--dragging" : "")
        }
        style={depth > 0 ? { "--indent-depth": depth } : undefined}
        {...dragHandlers}
      >
        {editingId === folder.id ? (
          <input
            ref={inputRef}
            className="sidebar__rename-input"
            defaultValue={folder.name}
            onBlur={(e) => {
              onRenameFolder(folder.id, e.target.value);
              setEditingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <>
            {folder.system ? (
              <span
                className="sidebar__dot"
                style={{
                  background: folder.color ?? "var(--text-tertiary)",
                  color: folder.color ?? "var(--text-tertiary)",
                }}
              />
            ) : (
              <button
                className="sidebar__color-dot"
                style={{
                  background: folder.color ?? "var(--text-tertiary)",
                  color: folder.color ?? "var(--text-tertiary)",
                }}
                title="Change folder color"
                onClick={(e) => openColorPicker(e, folder)}
              />
            )}

            <button
              className={
                "sidebar__item" +
                (activeFolderId === folder.id ? " sidebar__item--active" : "")
              }
              onClick={() => setActiveFolderId(folder.id)}
              onDoubleClick={() => !folder.system && setEditingId(folder.id)}
              title={!folder.system ? "Drag to reorder or move into/out of a Section" : undefined}
            >
              <span className="sidebar__item-name">{folder.name}</span>
            </button>

            {!folder.system && (
              <div className="sidebar__row-actions">
                <button
                  className={
                    "sidebar__link" + (folder.folderPath ? " sidebar__link--active" : "")
                  }
                  title={
                    folder.folderPath
                      ? `Linked to:\n${folder.folderPath}\nClick to change`
                      : "Link a folder directory"
                  }
                  onClick={() => onLinkFolderDirectory(folder.id)}
                >
                  <Icon name="folder" size={13} />
                </button>
                {folder.folderPath && (
                  <button
                    className="sidebar__unlink"
                    title="Unlink directory"
                    onClick={() => setUnlinkTarget(folder)}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Renders whatever's inside a Section (or the top level) — folders and/
  // or nested Sections, in whatever order they currently sit in — calling
  // itself for each nested Section, so nesting can go arbitrarily deep.
  // While searching, only items whose subtree contains a match render at
  // all — everything else (and its clutter) drops out of view entirely.
  // The depth cap is the same defensive backstop as subtreeMatches above
  // — should be unreachable given drag-time cycle prevention, but this is
  // genuine recursion during render, so an unbounded version would crash
  // rather than just misbehave if that assumption were ever wrong.
  function renderChildren(items, depth) {
    if (depth > 50) return null;
    const visible = isSearching ? items.filter((i) => subtreeMatches(i)) : items;
    return visible.map((item) =>
      item.type === "divider" ? renderSection(item, depth) : renderFolderRow(item, { depth })
    );
  }

  function renderSection(section, depth = 0) {
    const isDraggable = editingId !== section.id;
    const isDragOver = dragOverId === section.id;
    const isDropTarget = dragOverSectionId === section.id;
    const children = groupFolders.filter((f) => f.sectionId === section.id);
    // Force-expanded while searching, regardless of its actual saved
    // collapsed state, so a match nested inside it is never hidden —
    // reverts to the real state the moment the search is cleared.
    const isCollapsed = isSearching ? false : Boolean(section.collapsed);

    return (
      <div key={section.id} className="sidebar__section-block">
        <div
          className={
            "sidebar__divider" +
            (isDragOver ? " sidebar__divider--drag-over" : "") +
            (isDropTarget ? " sidebar__divider--drop-target" : "") +
            (draggedId === section.id ? " sidebar__row--dragging" : "")
          }
          style={depth > 0 ? { "--indent-depth": depth } : undefined}
          draggable={isDraggable}
          onDragStart={(e) => handleItemDragStart(e, section.id)}
          onDragOver={(e) => handleSectionHeaderDragOver(e, section.id)}
          onDrop={(e) => handleSectionHeaderDrop(e, section.id)}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => handleFolderContextMenu(e, section)}
        >
          {editingId === section.id ? (
            <input
              ref={inputRef}
              className="sidebar__rename-input"
              defaultValue={section.name}
              onBlur={(e) => {
                onRenameFolder(section.id, e.target.value);
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <>
              <button
                className="sidebar__section-toggle"
                title={isCollapsed ? "Expand" : "Collapse"}
                onClick={() => onToggleSectionCollapsed(section.id)}
              >
                <Icon
                  name="chevronRight"
                  size={11}
                  className="sidebar__section-chevron"
                  style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
                />
              </button>
              <Icon name="section" size={12} className="sidebar__section-icon" />
              <span
                className="sidebar__divider-label"
                onDoubleClick={() => setEditingId(section.id)}
                title="Double-click to rename · drag to reorder, move between groups, or nest inside another Section"
              >
                {section.name}
              </span>
              {children.length > 0 && (
                <span className="sidebar__section-count">{children.length}</span>
              )}
              {children.length > 1 && (
                <button
                  className="sidebar__divider-sort"
                  title="Sort this Section's contents alphabetically"
                  onClick={() => setSortTarget(section)}
                >
                  <Icon name="sortAlpha" size={12} />
                </button>
              )}
              <button
                className="sidebar__divider-delete"
                title="Delete Section (folders inside move back to top-level, not deleted)"
                onClick={() => setDeleteTarget(section)}
              >
                ×
              </button>
            </>
          )}
        </div>

        <div
          className={
            "sidebar__section-children-wrap" +
            (isCollapsed ? " sidebar__section-children-wrap--collapsed" : "")
          }
        >
          <div className="sidebar__section-children-inner">
            <div
              className={
                "sidebar__section-children" +
                (isDropTarget ? " sidebar__section-children--drop-target" : "")
              }
              onDragOver={(e) => handleSectionHeaderDragOver(e, section.id)}
              onDrop={(e) => handleSectionHeaderDrop(e, section.id)}
            >
              {(isSearching ? children.filter(subtreeMatches).length : children.length) === 0 ? (
                <div
                  className="sidebar__section-empty"
                  style={depth > 0 ? { "--indent-depth": depth + 1 } : undefined}
                >
                  {isSearching ? "No matches in here" : "Drag a folder here"}
                </div>
              ) : (
                renderChildren(children, depth + 1)
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displaySystemFolders = isPrimary ? SYSTEM_FOLDERS : [];

  return (
    <div className="sidebar">
      <div className="sidebar__section sidebar__section--grow">
        <div className="sidebar__heading">
          {editingGroupName ? (
            <input
              ref={groupNameInputRef}
              className="sidebar__rename-input"
              defaultValue={group.name}
              onBlur={(e) => {
                onRenameFolderGroup(groupId, e.target.value);
                setEditingGroupName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingGroupName(false);
              }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditingGroupName(true)}
              title="Double-click to rename this group"
            >
              {group.name}
            </span>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={"sidebar__add" + (searchOpen ? " sidebar__add--active" : "")}
              title="Search folders in this panel"
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            >
              <Icon name="search" size={12} />
            </button>
            <button className="sidebar__add" title="New folder" onClick={createFolder}>
              +
            </button>
            <button
              className="sidebar__add"
              title="New Section — collapsible, drag folders in and out of it"
              onClick={createSection}
            >
              <Icon name="section" size={12} />
            </button>
            <button
              className="sidebar__add"
              title="Create a new group — its own independent, dockable panel"
              onClick={() => onCreateFolderGroup("New Group")}
            >
              <Icon name="newGroup" size={13} />
            </button>
            {group.deletable && (
              <button
                className="sidebar__add"
                title="Delete this group"
                onClick={() => setDeleteGroupConfirm(true)}
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        </div>

        {searchOpen && (
          <div className="sidebar__search-row">
            <Icon name="search" size={12} className="sidebar__search-icon" />
            <input
              ref={searchInputRef}
              className="sidebar__search-input"
              placeholder="Search folders & Sections in this panel…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
            />
            <button
              className="sidebar__search-close"
              title="Close search"
              onClick={closeSearch}
            >
              ×
            </button>
          </div>
        )}

        <div
          className="sidebar__list-area"
          onContextMenu={handleContextMenu}
          onDragEnter={handleListAreaDragEnter}
          onDragLeave={handleListAreaDragLeave}
          onDragOver={handleListAreaDragOver}
          onDrop={handleListAreaDrop}
        >
          <div className="sidebar__list">
            {(isSearching ? displaySystemFolders.filter(itemMatchesQuery) : displaySystemFolders).map(
              (folder) => renderFolderRow(folder)
            )}
            {renderChildren(topLevelItems, 0)}
            {isSearching &&
              !displaySystemFolders.some(itemMatchesQuery) &&
              !topLevelItems.some(subtreeMatches) && (
                <div className="sidebar__search-empty">
                  No folders match "{searchQuery.trim()}"
                </div>
              )}
          </div>
        </div>
      </div>

      {createMenu && (
        <FolderCreateMenu
          x={createMenu.x}
          y={createMenu.y}
          onCreateFolder={createFolder}
          onCreateDivider={createSection}
          onClose={() => setCreateMenu(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={deleteTarget.type === "divider" ? "Delete Section" : "Delete folder"}
          message={
            deleteTarget.type === "divider"
              ? `Delete the "${deleteTarget.name}" Section? Folders inside it move back to top-level — they won't be deleted.`
              : `Delete "${deleteTarget.name}"? This won't delete any files themselves, just the folder in Disc.`
          }
          confirmLabel="Delete"
          onConfirm={() => {
            deleteItem(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {sortTarget && (
        <ConfirmModal
          title="Sort alphabetically"
          message={`Sort everything directly inside "${sortTarget.name}" alphabetically by name? This reorders them — anything nested further inside a sub-Section stays as it is, only this Section's own direct contents move.`}
          confirmLabel="Sort"
          danger={false}
          onConfirm={() => {
            onSortSectionAlphabetically(sortTarget.id);
            setSortTarget(null);
          }}
          onCancel={() => setSortTarget(null)}
        />
      )}

      {deleteGroupConfirm && (
        <ConfirmModal
          title="Delete group"
          message={`Delete the "${group.name}" group and close its panel? Its folders go with it — but you'll get an "Undo" prompt at the bottom of the screen for a few seconds after, in case that was a mistake.`}
          confirmLabel="Delete Group"
          onConfirm={() => {
            onDeleteFolderGroup(groupId);
            setDeleteGroupConfirm(false);
          }}
          onCancel={() => setDeleteGroupConfirm(false)}
        />
      )}

      {unlinkTarget && (
        <ConfirmModal
          title="Unlink folder"
          message={`Unlink "${unlinkTarget.name}" from its directory? Its tracks won't show up anywhere in Disc anymore unless they happen to also be inside your main music folder (if you have one set).`}
          confirmLabel="Unlink"
          danger={false}
          onConfirm={() => {
            onUnlinkFolderDirectory(unlinkTarget.id);
            setUnlinkTarget(null);
          }}
          onCancel={() => setUnlinkTarget(null)}
        />
      )}

      {colorPicker && (
        <ColorPicker
          x={colorPicker.x}
          y={colorPicker.y}
          color={colorPicker.color}
          onChange={(color) => onSetFolderColor(colorPicker.folderId, color)}
          onClose={() => setColorPicker(null)}
        />
      )}

      {folderContextMenu && (
        <FolderContextMenu
          x={folderContextMenu.x}
          y={folderContextMenu.y}
          folder={folderContextMenu.item}
          onUnlink={() => setUnlinkTarget(folderContextMenu.item)}
          onRename={() => setEditingId(folderContextMenu.item.id)}
          onDelete={() => setDeleteTarget(folderContextMenu.item)}
          onClose={() => setFolderContextMenu(null)}
        />
      )}
    </div>
  );
}
