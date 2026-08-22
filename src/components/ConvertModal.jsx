import { useState, useRef } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { convertToMp3 } from "../audio/audioConverter.js";
import Dropdown from "./Dropdown.jsx";
import Icon from "./Icon.jsx";
import "./SettingsModal.css";
import "./ConvertModal.css";

const SOURCE_EXTENSION_PATTERN = /\.(ogg|wav|flac|m4a|aac|opus|webm)$/i;

function baseName(filePath) {
  return filePath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || filePath;
}

export default function ConvertModal({ onClose }) {
  const { customFolders } = useDisc();
  const linkedFolders = customFolders.filter((f) => f.folderPath && !f.system);

  const [sourcePaths, setSourcePaths] = useState([]);
  const [destFolderId, setDestFolderId] = useState(linkedFolders[0]?.id ?? "");
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ completed: 0, total: 0, currentName: "" });
  const [results, setResults] = useState({ succeeded: [], skipped: [], failed: [], wasCancelled: false });
  const cancelRef = useRef(false);

  const destFolder = linkedFolders.find((f) => f.id === destFolderId);

  async function handleChooseFiles() {
    if (!window.disc) return;
    const paths = await window.disc.chooseConvertibleFiles();
    if (paths.length > 0) setSourcePaths(paths);
  }

  async function handleChooseFolder() {
    if (!window.disc) return;
    const folder = await window.disc.chooseConvertibleFolder();
    if (!folder) return;
    const found = await window.disc.scanForConvertible(folder);
    setSourcePaths(found);
  }

  async function handleConvert() {
    if (!destFolder || sourcePaths.length === 0 || status === "running") return;
    setStatus("running");
    cancelRef.current = false;
    const succeeded = [];
    const skipped = [];
    const failed = [];
    let stoppedAt = sourcePaths.length;

    for (let i = 0; i < sourcePaths.length; i++) {
      if (cancelRef.current) {
        stoppedAt = i;
        break;
      }
      const filePath = sourcePaths[i];
      const name = baseName(filePath);
      setProgress({ completed: i, total: sourcePaths.length, currentName: name });

      try {
        const { mp3Bytes } = await convertToMp3(filePath);
        if (cancelRef.current) {
          stoppedAt = i;
          break;
        }
        const outputName = name.replace(SOURCE_EXTENSION_PATTERN, "") + ".mp3";
        const writeResult = await window.disc.writeConvertedMp3(
          destFolder.folderPath,
          outputName,
          mp3Bytes
        );
        if (writeResult?.success) {
          succeeded.push(name);
        } else if (writeResult?.skipped) {
          skipped.push(name);
        } else {
          failed.push({ name, reason: writeResult?.error || "Unknown error" });
        }
      } catch (err) {
        failed.push({ name, reason: err.message || "Couldn't decode this file" });
      }
    }

    // Reflects what actually happened rather than always claiming the
    // full batch finished — if this was cancelled at file 40 of 200, the
    // progress bar and count should say 40, not silently jump to 200.
    setProgress({ completed: stoppedAt, total: sourcePaths.length, currentName: "" });
    setResults({ succeeded, skipped, failed, wasCancelled: stoppedAt < sourcePaths.length });
    setStatus("done");
  }

  function handleCancelConversion() {
    cancelRef.current = true;
  }

  function handleReset() {
    setSourcePaths([]);
    setStatus("idle");
    setProgress({ completed: 0, total: 0, currentName: "" });
    setResults({ succeeded: [], skipped: [], failed: [], wasCancelled: false });
  }

  return (
    <div className="settings-modal__backdrop">
      <div className="convert-modal">
        <div className="settings-modal__title">Convert audio to .mp3</div>

        {status === "idle" && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              Supports .ogg, .wav, .flac, .m4a, .aac, .opus, and .webm.
              Existing files with the same name in the destination folder
              won't be overwritten.
            </p>

            <label className="settings-modal__label">Source</label>
            <div className="convert-modal__source-buttons">
              <button className="settings-modal__cancel" onClick={handleChooseFiles}>
                Choose Files…
              </button>
              <button className="settings-modal__cancel" onClick={handleChooseFolder}>
                Choose a Folder…
              </button>
            </div>
            <p className="settings-modal__note settings-modal__note--top">
              {sourcePaths.length === 0
                ? "No files selected yet."
                : `${sourcePaths.length} audio file${sourcePaths.length === 1 ? "" : "s"} found.`}
            </p>

            <label className="settings-modal__label">Convert into</label>
            {linkedFolders.length === 0 ? (
              <p className="settings-modal__note settings-modal__note--top">
                No linked folders yet — link a folder to a real directory
                first (
                <Icon name="folder" size={11} style={{ margin: "0 2px" }} />
                icon next to any folder), then come back here.
              </p>
            ) : (
              <Dropdown
                className="settings-modal__select"
                value={destFolderId}
                onChange={setDestFolderId}
                options={linkedFolders.map((f) => ({ value: f.id, label: f.name }))}
              />
            )}

            <div className="settings-modal__actions">
              <button className="settings-modal__cancel" style={{ flex: 1 }} onClick={onClose}>
                Close
              </button>
              <button
                className="settings-modal__save"
                style={{ flex: 1 }}
                disabled={sourcePaths.length === 0 || !destFolder}
                onClick={handleConvert}
              >
                Convert {sourcePaths.length > 0 ? sourcePaths.length : ""} File
                {sourcePaths.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}

        {status === "running" && (
          <>
            <div className="settings-modal__progress-track">
              <div
                className="settings-modal__progress-fill"
                style={{
                  width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="settings-modal__note settings-modal__note--top">
              {progress.completed} / {progress.total}
              {progress.currentName ? ` — converting "${progress.currentName}"…` : ""}
            </p>
            <div className="settings-modal__actions">
              <button
                className="settings-modal__cancel"
                style={{ flex: 1 }}
                onClick={handleCancelConversion}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              {results.wasCancelled ? "Cancelled. " : "Done. "}
              {results.succeeded.length} converted
              {results.skipped.length > 0 ? `, ${results.skipped.length} skipped (already existed)` : ""}
              {results.failed.length > 0 ? `, ${results.failed.length} failed` : ""}
              {results.wasCancelled
                ? ` before it was stopped (${sourcePaths.length - progress.completed} file${
                    sourcePaths.length - progress.completed === 1 ? "" : "s"
                  } never got to).`
                : "."}
              {destFolder && results.succeeded.length > 0
                ? ` They'll show up in "${destFolder.name}" automatically.`
                : ""}
            </p>
            {results.failed.length > 0 && (
              <div className="convert-modal__failed-list">
                {results.failed.map((f) => (
                  <div key={f.name} className="convert-modal__failed-item">
                    <strong>{f.name}</strong> — {f.reason}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-modal__actions">
              <button className="settings-modal__cancel" style={{ flex: 1 }} onClick={handleReset}>
                Convert More
              </button>
              <button className="settings-modal__save" style={{ flex: 1 }} onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
