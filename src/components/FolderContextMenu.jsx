import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import "./FolderContextMenu.css";

// Rough worst-case size (all rows shown, export status text) — same
// clamp-to-viewport approach as TrackContextMenu, needed because this is
// `position: fixed` off raw click coordinates: without it, right-clicking
// near the bottom/right of the window (or the taskbar, if the window
// itself sits near the bottom of the screen) renders the menu partly
// off-screen instead of flipping to fit.
const MENU_WIDTH = 220;
const MENU_HEIGHT = 175;

export default function FolderContextMenu({ x, y, folder, onUnlink, onRename, onDelete, onClose }) {
  const { customFolderTracks } = useDisc();
  const [exportStatus, setExportStatus] = useState(null); // null | "exporting" | "success" | "error"
  const rootRef = useRef(null);

  const isDivider = folder.type === "divider";
  const isLinked = Boolean(folder.folderPath);
  const trackList = isDivider ? [] : customFolderTracks[folder.id] || [];

  useEffect(() => {
    function handleClickOutside(e) {
      // Don't let an in-progress or just-finished export get dismissed by
      // an incidental click — only close on outside-click while idle.
      if (exportStatus === "exporting") return;
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape" && exportStatus !== "exporting") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, exportStatus]);

  async function handleExport() {
    if (exportStatus === "exporting" || !window.disc) return;
    setExportStatus("exporting");
    const files = trackList.map((t) => ({
      filePath: t.filePath,
      fileName: t.fileName,
      relativeDir: t.relativeDir,
    }));
    const result = await window.disc.exportFolderZip(folder.name, files);
    if (result?.cancelled) {
      setExportStatus(null); // they backed out of the save dialog — let them retry
    } else if (result?.success) {
      setExportStatus("success");
      setTimeout(onClose, 1200);
    } else {
      setExportStatus("error");
    }
  }

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  return (
    <div className="folder-context-menu" style={{ left, top }} ref={rootRef}>
      <button
        className="folder-context-menu__option"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename
      </button>
      {isLinked && (
        <button
          className="folder-context-menu__option"
          onClick={() => {
            onUnlink();
            onClose();
          }}
        >
          Unlink Directory
        </button>
      )}
      {!isDivider && (
        <button
          className="folder-context-menu__option"
          disabled={trackList.length === 0 || exportStatus === "exporting"}
          title={
            trackList.length === 0
              ? "Nothing to export — this folder has no tracks"
              : `Zip up all ${trackList.length} track(s) and save them somewhere`
          }
          onClick={handleExport}
        >
          {exportStatus === "exporting"
            ? "Exporting…"
            : exportStatus === "success"
            ? "Exported!"
            : exportStatus === "error"
            ? "Export failed — try again"
            : `Export Folder (${trackList.length})…`}
        </button>
      )}
      <button
        className="folder-context-menu__option folder-context-menu__option--danger"
        disabled={exportStatus === "exporting"}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {isDivider ? "Delete Section…" : "Delete Folder…"}
      </button>
    </div>
  );
}
