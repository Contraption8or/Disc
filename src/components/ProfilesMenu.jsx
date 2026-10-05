import { useEffect, useRef, useState } from "react";
import {
  collectProfileData,
  applyProfileData,
  resetProfileData,
  HIDE_DEFAULT_PROFILE_KEY,
} from "../profiles/profileData.js";
import { getTrackKey } from "../sync/trackKey.js";
import ConfirmModal from "./ConfirmModal.jsx";
import Icon from "./Icon.jsx";
import "./ProfilesMenu.css";

// musicFolderPath/allTracks/customFolders come in as props, not useDisc() —
// this renders inside TitleBar, which sits outside <DiscContext.Provider>
// (the provider only wraps the dockview panel area), same reason every
// other thing TitleBar needs is already threaded through as a prop.
export default function ProfilesMenu({ musicFolderPath, allTracks, customFolders }) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingFileName, setEditingFileName] = useState(null);
  const [switchTarget, setSwitchTarget] = useState(null); // { fileName, profileName } | null
  const [deleteTarget, setDeleteTarget] = useState(null); // { fileName, profileName } | null
  const [status, setStatus] = useState(""); // brief inline feedback, e.g. "Exported"
  const [exportingMusic, setExportingMusic] = useState(false);
  const [importing, setImporting] = useState(false);
  // { phase: "export" | "import", done, total } while a with-music zip is
  // being written or extracted (see sendZipProgress in electron/main.js),
  // so a big library reads as "Zipping 212/600…" rather than looking stuck.
  const [zipProgress, setZipProgress] = useState(null);
  // The built-in Default profile (see resetProfileData) is always there, but
  // its row can be tucked away for anyone who'd rather not see it.
  const [hideDefault, setHideDefault] = useState(() => {
    try {
      return localStorage.getItem(HIDE_DEFAULT_PROFILE_KEY) === "true";
    } catch {
      return false;
    }
  });
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
    return window.disc?.onProfileZipProgress?.((p) => {
      setZipProgress(p.total > 0 ? p : null);
    });
  }, []);

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

  function toggleHideDefault() {
    const next = !hideDefault;
    setHideDefault(next);
    try {
      localStorage.setItem(HIDE_DEFAULT_PROFILE_KEY, String(next));
    } catch {
      // Preference just won't persist — not worth failing over.
    }
  }

  async function confirmSwitch() {
    if (!switchTarget) return;
    if (switchTarget.isDefault) {
      resetProfileData();
      window.location.reload();
      return;
    }
    if (!window.disc) return;
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

  // Same export, but also bundles every track Disc currently knows about
  // (main folder + every linked custom folder) into the archive, so
  // importing it elsewhere doesn't need any of the same files to already
  // exist there — see docs on disc:export-profile-with-music in main.js
  // for the trackKey/manifest scheme that makes that work. Can take a
  // while for a large library (every file gets read and re-zipped), so
  // this disables the button and says so rather than looking stuck.
  async function handleExportCurrentWithMusic() {
    if (!window.disc || exportingMusic) return;
    setExportingMusic(true);
    try {
      const name = `Disc Profile ${new Date().toLocaleDateString()}`;
      const data = collectProfileData();
      const tracks = allTracks
        .map((t) => ({
          filePath: t.filePath,
          trackKey: getTrackKey(t.filePath, { musicFolderPath, customFolders }),
        }))
        .filter((t) => t.trackKey);
      const result = await window.disc.exportProfileWithMusic(name, data, tracks);
      if (result?.success) flashStatus(`Exported with ${result.trackCount} track(s)`);
      else if (!result?.cancelled) flashStatus(result?.error || "Export failed");
    } finally {
      setExportingMusic(false);
    }
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
    if (!window.disc || importing) return;
    setImporting(true);
    try {
      // A plain .json resolves almost instantly; a .discprofile.zip can
      // mean copying a whole library's worth of files to wherever the
      // person picks in the dialog this triggers — importing stays true
      // the whole time either way so the button reads "Importing…"
      // rather than looking stuck on the slow path.
      const result = await window.disc.importProfileFromFile();
      if (!result) return; // cancelled
      if (!result.success) {
        if (!result.cancelled) flashStatus(result.error || "Couldn't read that file");
        return;
      }
      const saveResult = await window.disc.saveProfile(result.profileName, result.data);
      if (saveResult?.success) {
        flashStatus(
          typeof result.trackCount === "number"
            ? `Imported with ${result.trackCount} track(s)`
            : "Imported"
        );
        refreshProfiles();
      }
    } finally {
      setImporting(false);
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

          {profiles.length === 0 && !creating && hideDefault && (
            <div className="profiles-menu__empty">No saved profiles yet.</div>
          )}

          <div className="profiles-menu__list">
            {!hideDefault && (
              <div className="profiles-menu__row">
                <button
                  className="profiles-menu__option"
                  onClick={() => setSwitchTarget({ isDefault: true, profileName: "Default" })}
                  title="Reset Disc to its factory defaults"
                >
                  Default
                  <span className="profiles-menu__badge">Built-in</span>
                </button>
                <button
                  className="profiles-menu__icon-btn"
                  title="Hide the Default profile"
                  onClick={toggleHideDefault}
                >
                  <Icon name="eyeOff" size={13} />
                </button>
              </div>
            )}

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
            onClick={handleExportCurrentWithMusic}
            disabled={exportingMusic}
            title="Bundles every track Disc currently knows about into the exported file — the person importing it won't need any of the same music already on their machine."
          >
            <Icon name="musicNote" size={12} style={{ marginRight: 6 }} />
            {exportingMusic
              ? zipProgress?.phase === "export"
                ? `Zipping ${zipProgress.done}/${zipProgress.total}…`
                : "Zipping…"
              : "Export Current (with Music)…"}
          </button>
          <button
            className="profiles-menu__option profiles-menu__option--action"
            onClick={handleImportClick}
            disabled={importing}
          >
            <Icon name="folder" size={12} style={{ marginRight: 6 }} />
            {importing
              ? zipProgress?.phase === "import"
                ? `Importing ${zipProgress.done}/${zipProgress.total}…`
                : "Importing…"
              : "Import…"}
          </button>

          {hideDefault && (
            <button
              className="profiles-menu__option profiles-menu__option--action"
              onClick={toggleHideDefault}
            >
              <Icon name="eye" size={12} style={{ marginRight: 6 }} />
              Show Default Profile
            </button>
          )}

          {status && <p className="profiles-menu__status">{status}</p>}
        </div>
      )}

      {switchTarget && (
        <ConfirmModal
          title="Switch profile"
          message={
            switchTarget.isDefault
              ? "Reset Disc to its factory defaults? Your current theme, layout, settings, folders, and tags will be cleared — save them as a profile first if you want to keep them. Disc will reload right after."
              : `Switch to "${switchTarget.profileName}"? Your current settings and folders will be replaced with what's saved in that profile. Disc will reload right after.`
          }
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
