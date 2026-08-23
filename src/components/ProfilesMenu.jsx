import { useEffect, useRef, useState } from "react";
import { collectProfileData, applyProfileData } from "../profiles/profileData.js";
import ConfirmModal from "./ConfirmModal.jsx";
import Icon from "./Icon.jsx";
import "./ProfilesMenu.css";

export default function ProfilesMenu() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingFileName, setEditingFileName] = useState(null);
  const [switchTarget, setSwitchTarget] = useState(null); // { fileName, profileName } | null
  const [deleteTarget, setDeleteTarget] = useState(null); // { fileName, profileName } | null
  const [status, setStatus] = useState(""); // brief inline feedback, e.g. "Exported"
  const rootRef = useRef(null);
  const createInputRef = useRef(null);
  const renameInputRef = useRef(null);

  async function refreshProfiles() {
    if (!window.disc) return;
    const list = await window.disc.listProfiles();
    setProfiles(list);
  }

  useEffect(() => {
    if (open) refreshProfiles();
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (editingFileName || creating) return;
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingFileName, creating]);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingFileName) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [editingFileName]);

  function flashStatus(text) {
    setStatus(text);
    setTimeout(() => setStatus(""), 2500);
  }

  async function handleSaveCurrentAsNew(name) {
    const trimmed = name.trim();
    if (!trimmed || !window.disc) return;
    const data = collectProfileData();
    const result = await window.disc.saveProfile(trimmed, data);
    if (result?.success) {
      flashStatus("Saved");
      refreshProfiles();
    }
    setCreating(false);
    setDraftName("");
  }

  async function confirmSwitch() {
    if (!switchTarget || !window.disc) return;
    const result = await window.disc.loadProfile(switchTarget.fileName);
    if (result?.success) {
      applyProfileData(result.data);
      window.location.reload();
    }
    setSwitchTarget(null);
  }

  // Overwrites a saved profile's data with whatever's currently active,
  // keeping its existing file (and thus its name) — the same "update in
  // place" idea as Layout presets' "Update with Current Layout". Passing
  // the existing fileName through to saveProfile is what makes this an
  // overwrite instead of creating a new profile.
  async function handleUpdateProfile(fileName, profileName) {
    if (!window.disc) return;
    const data = collectProfileData();
    const result = await window.disc.saveProfile(profileName, data, fileName);
    if (result?.success) {
      flashStatus("Updated");
      refreshProfiles();
    }
  }

  async function handleRename(fileName, newName) {
    setEditingFileName(null);
    const trimmed = newName.trim();
    if (!trimmed || !window.disc) return;
    await window.disc.renameProfile(fileName, trimmed);
    refreshProfiles();
  }

  async function confirmDelete() {
    if (!deleteTarget || !window.disc) return;
    await window.disc.deleteProfile(deleteTarget.fileName);
    setDeleteTarget(null);
    refreshProfiles();
  }

  async function handleExportCurrent() {
    if (!window.disc) return;
    const name = `Disc Profile ${new Date().toLocaleDateString()}`;
    const data = collectProfileData();
    const result = await window.disc.exportProfileToFile(name, data);
    if (result?.success) flashStatus("Exported");
  }

  // Importing always just adds the file to the saved profiles list —
  // it never immediately switches to it. That's a deliberate
  // simplification: a "switch right away or just save it?" choice would
  // need a three-way decision (switch / save only / truly cancel), and
  // the shared confirm-dialog component here only really supports two
  // meaningfully different outcomes without one of its buttons ending up
  // mislabeled for what it actually does. Since the same switch flow
  // (with its own confirmation) already exists for anything in the list,
  // an imported profile just becomes one more entry someone can switch
  // to from there when they're ready, using a flow that's already clear.
  async function handleImportClick() {
    if (!window.disc) return;
    const result = await window.disc.importProfileFromFile();
    if (!result) return; // cancelled
    if (!result.success) {
      flashStatus(result.error || "Couldn't read that file");
      return;
    }
    const saveResult = await window.disc.saveProfile(result.profileName, result.data);
    if (saveResult?.success) {
      flashStatus("Imported");
      refreshProfiles();
    }
  }

  return (
    <div className="profiles-menu" ref={rootRef}>
      <button
        className="titlebar__icon-button profiles-menu__trigger"
        title="Profiles"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="profile" size={14} />
      </button>

      {open && (
        <div className="profiles-menu__dropdown">
          <div className="profiles-menu__title">Profiles</div>
          <p className="profiles-menu__note">
            Switching replaces your current settings and folders — save
            first if you want to keep them.
          </p>

          {profiles.length === 0 && !creating && (
            <div className="profiles-menu__empty">No saved profiles yet.</div>
          )}

          <div className="profiles-menu__list">
            {profiles.map((p) => (
              <div key={p.fileName} className="profiles-menu__row">
                {editingFileName === p.fileName ? (
                  <input
                    ref={renameInputRef}
                    className="profiles-menu__rename-input"
                    defaultValue={p.profileName}
                    onBlur={(e) => handleRename(p.fileName, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingFileName(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      className="profiles-menu__option"
                      onClick={() => setSwitchTarget(p)}
                      title="Switch to this profile"
                    >
                      {p.profileName}
                    </button>
                    <button
                      className="profiles-menu__icon-btn"
                      title="Update with current settings"
                      onClick={() => handleUpdateProfile(p.fileName, p.profileName)}
                    >
                      <Icon name="convert" size={12} />
                    </button>
                    <button
                      className="profiles-menu__icon-btn"
                      title="Rename"
                      onClick={() => setEditingFileName(p.fileName)}
                    >
                      <Icon name="rename" size={12} />
                    </button>
                    <button
                      className="profiles-menu__icon-btn"
                      title="Delete"
                      onClick={() => setDeleteTarget(p)}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {creating ? (
            <div className="profiles-menu__create-row">
              <input
                ref={createInputRef}
                className="profiles-menu__rename-input"
                placeholder="Profile name…"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCurrentAsNew(draftName);
                  if (e.key === "Escape") {
                    setCreating(false);
                    setDraftName("");
                  }
                }}
              />
              <button
                className="profiles-menu__save-btn"
                onClick={() => handleSaveCurrentAsNew(draftName)}
              >
                <Icon name="check" size={13} />
              </button>
            </div>
          ) : (
            <button
              className="profiles-menu__option profiles-menu__option--action"
              onClick={() => setCreating(true)}
            >
              <Icon name="newGroup" size={12} style={{ marginRight: 6 }} />
              Save Current as New Profile
            </button>
          )}

          <div className="profiles-menu__divider" />

          <button
            className="profiles-menu__option profiles-menu__option--action"
            onClick={handleExportCurrent}
          >
            <Icon name="convert" size={12} style={{ marginRight: 6 }} />
            Export Current…
          </button>
          <button
            className="profiles-menu__option profiles-menu__option--action"
            onClick={handleImportClick}
          >
            <Icon name="folder" size={12} style={{ marginRight: 6 }} />
            Import…
          </button>

          {status && <p className="profiles-menu__status">{status}</p>}
        </div>
      )}

      {switchTarget && (
        <ConfirmModal
          title="Switch profile"
          message={`Switch to "${switchTarget.profileName}"? Your current settings and folders will be replaced with what's saved in that profile. Disc will reload right after.`}
          confirmLabel="Switch"
          danger={false}
          onConfirm={confirmSwitch}
          onCancel={() => setSwitchTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete profile"
          message={`Delete "${deleteTarget.profileName}"? This only removes the saved profile file — it won't touch your current settings if you're not using it right now.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
