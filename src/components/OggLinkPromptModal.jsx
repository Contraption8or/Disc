import { useState, useRef } from "react";
import { convertToMp3 } from "../audio/audioConverter.js";
import "./SettingsModal.css";
import "./ConvertModal.css";

function baseName(filePath) {
  return filePath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || filePath;
}

// Strips whatever extension is actually there, generically — the
// detected files can be .ogg, .flac, .m4a, .aac, .opus, or .webm, so a
// hardcoded ".ogg"-only strip would leave something like
// "song.flac.mp3" behind for anything that isn't literally .ogg.
function stripAnyExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

export default function OggLinkPromptModal({
  pendingOggLink,
  onConvertAndLink,
  onLinkWithoutConverting,
  onCancelOggLinkPrompt,
  onUnlinkPendingOggFolder,
}) {
  const [status, setStatus] = useState("prompt"); // prompt | converting | done
  const [progress, setProgress] = useState({ completed: 0, total: 0, currentName: "" });
  const [results, setResults] = useState({ succeeded: 0, failed: 0 });
  const cancelRef = useRef(false);

  const { folderPath, convertiblePaths } = pendingOggLink;

  async function startConversion() {
    onConvertAndLink(); // actually links the folder now, so progress lands somewhere real
    setStatus("converting");
    cancelRef.current = false;

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < convertiblePaths.length; i++) {
      if (cancelRef.current) break;
      const filePath = convertiblePaths[i];
      const name = baseName(filePath);
      setProgress({ completed: i, total: convertiblePaths.length, currentName: name });

      try {
        const { mp3Bytes } = await convertToMp3(filePath);
        if (cancelRef.current) break;
        const outputName = stripAnyExtension(name) + ".mp3";
        const writeResult = await window.disc.writeConvertedMp3(folderPath, outputName, mp3Bytes);
        if (writeResult?.success) succeeded += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    if (cancelRef.current) {
      // Cancelling mid-way un-links the folder entirely, as requested —
      // no half-converted, half-linked folder left behind.
      onUnlinkPendingOggFolder();
      return;
    }

    setProgress({ completed: convertiblePaths.length, total: convertiblePaths.length, currentName: "" });
    setResults({ succeeded, failed });
    setStatus("done");
  }

  function handleCancelDuringConversion() {
    cancelRef.current = true;
  }

  return (
    <div className="settings-modal__backdrop">
      <div className="convert-modal">
        <div className="settings-modal__title">
          {status === "prompt" && "This folder has convertible audio files"}
          {status === "converting" && "Converting…"}
          {status === "done" && "Done"}
        </div>

        {status === "prompt" && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              Found {convertiblePaths.length} file{convertiblePaths.length === 1 ? "" : "s"} in
              this folder that Disc can convert to mp3 (ogg, flac, m4a, aac, opus, or webm).
              Want to convert {convertiblePaths.length === 1 ? "it" : "them all"} before
              linking? This can take a while for a lot of files, so there's a cancel option
              once it starts, right on the progress screen — cancelling un-links the folder
              too, so you're never left with a half-done conversion sitting there linked.
            </p>
            <div className="settings-modal__actions">
              <button className="settings-modal__cancel" style={{ flex: 1 }} onClick={onCancelOggLinkPrompt}>
                Cancel
              </button>
              <button
                className="settings-modal__cancel"
                style={{ flex: 1 }}
                onClick={onLinkWithoutConverting}
              >
                Link As-Is
              </button>
              <button className="settings-modal__save" style={{ flex: 1 }} onClick={startConversion}>
                Convert & Link
              </button>
            </div>
          </>
        )}

        {status === "converting" && (
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
                onClick={handleCancelDuringConversion}
              >
                Cancel & Unlink Folder
              </button>
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              {results.succeeded} converted
              {results.failed > 0 ? `, ${results.failed} failed` : ""}. The folder's
              linked and everything will show up in its track list automatically.
            </p>
            <div className="settings-modal__actions">
              <button
                className="settings-modal__save"
                style={{ flex: 1 }}
                onClick={onCancelOggLinkPrompt}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
