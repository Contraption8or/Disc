import { useEffect, useRef, useState } from "react";
import LayoutContextMenu from "./LayoutContextMenu.jsx";
import Icon from "./Icon.jsx";
import "./LayoutPresets.css";

export default function LayoutPresets({
  presetNames,
  onSave,
  onLoad,
  onDelete,
  onRenameLayout,
  defaultLayoutName,
  onSetDefault,
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { x, y, name } | null
  const [editingName, setEditingName] = useState(null); // the preset name currently being renamed, or null
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (editingName) return;
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingName]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingName) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [editingName]);

  function commitRename(oldName, value) {
    setEditingName(null);
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldName) return;
    onRenameLayout(oldName, trimmed);
  }

  function submitNewPreset() {
    const name = draftName.trim();
    if (name) onSave(name);
    setDraftName("");
    setCreating(false);
  }

  return (
    <div className="layout-presets" ref={rootRef}>
      <button
        className="layout-presets__trigger"
        onClick={() => setOpen((o) => !o)}
        title="Layout presets"
      >
        <Icon name="windowGrid" size={13} style={{ marginRight: 5 }} />
        Layout
      </button>

      {open && (
        <div className="layout-presets__menu">
          {presetNames.length === 0 && (
            <div className="layout-presets__empty">No presets yet</div>
          )}

          {presetNames.map((name) => (
            <div
              key={name}
              className="layout-presets__row"
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, name });
              }}
            >
              {editingName === name ? (
                <input
                  ref={renameInputRef}
                  className="layout-presets__rename-input"
                  defaultValue={name}
                  onBlur={(e) => commitRename(name, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingName(null);
                  }}
                />
              ) : (
                <>
                  <button
                    className="layout-presets__option"
                    title={
                      name === defaultLayoutName
                        ? `"${name}" loads automatically on startup`
                        : `Right-click for options`
                    }
                    onClick={() => {
                      onLoad(name);
                      setOpen(false);
                    }}
                  >
                    {name === defaultLayoutName && (
                      <span className="layout-presets__default-star">
                        <Icon name="starFilled" size={11} />
                      </span>
                    )}
                    {name}
                  </button>
                  <button
                    className="layout-presets__delete"
                    title={`Delete "${name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(name);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="layout-presets__divider" />

          {creating ? (
            <div className="layout-presets__create">
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Preset name…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewPreset();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setDraftName("");
                  }
                }}
              />
              <button
                className="layout-presets__save-btn"
                onClick={submitNewPreset}
                title="Save preset"
              >
                <Icon name="check" size={13} />
              </button>
            </div>
          ) : (
            <button
              className="layout-presets__option layout-presets__option--accent"
              onClick={() => setCreating(true)}
            >
              + Save current as…
            </button>
          )}
        </div>
      )}

      {contextMenu && (
        <LayoutContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDefault={contextMenu.name === defaultLayoutName}
          onSetDefault={() => onSetDefault(contextMenu.name)}
          onRename={() => setEditingName(contextMenu.name)}
          onUpdateWithCurrent={() => onSave(contextMenu.name)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
