import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { SHORTCUT_LABELS, displayKey } from "../shortcuts/shortcutStorage.js";
import "./ShortcutsModal.css";

const ACTION_ORDER = [
  "playPause",
  "seekBack",
  "seekForward",
  "volumeUp",
  "volumeDown",
  "focusSearch",
  "next",
  "prev",
  "shuffle",
  "showShortcuts",
];

export default function ShortcutsModal({ onClose }) {
  const { shortcuts, onSetShortcut, onResetShortcuts } = useDisc();
  const [recordingAction, setRecordingAction] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target) && !recordingAction) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, recordingAction]);

  // While recording, capture the very next keypress anywhere (capture
  // phase, so it runs before — and via stopPropagation, instead of — the
  // app's normal shortcut handler) and bind it.
  useEffect(() => {
    if (!recordingAction) return;
    function handleKeyDown(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key !== "Escape") {
        onSetShortcut(recordingAction, e.key);
      }
      setRecordingAction(null);
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingAction, onSetShortcut]);

  // Plain Escape closes the modal, but only when not actively recording
  // (recording's own listener above handles Escape as "cancel" instead).
  useEffect(() => {
    if (recordingAction) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, recordingAction]);

  return (
    <div className="shortcuts-modal__backdrop">
      <div className="shortcuts-modal" ref={rootRef}>
        <div className="shortcuts-modal__title">Keyboard shortcuts</div>
        <div className="shortcuts-modal__list">
          {ACTION_ORDER.map((action) => (
            <div key={action} className="shortcuts-modal__row">
              <span className="shortcuts-modal__desc">{SHORTCUT_LABELS[action]}</span>
              <button
                className={
                  "shortcuts-modal__keys" +
                  (recordingAction === action ? " shortcuts-modal__keys--recording" : "")
                }
                onClick={() => setRecordingAction(action)}
              >
                {recordingAction === action
                  ? "Press a key…"
                  : shortcuts[action]
                  ? displayKey(shortcuts[action])
                  : "—"}
              </button>
            </div>
          ))}
        </div>
        <p className="shortcuts-modal__note">
          Click a binding to rebind it — press any key, or Escape to
          cancel. Ctrl/Cmd+K isn't remappable.
        </p>
        <div className="shortcuts-modal__actions">
          <button className="shortcuts-modal__reset" onClick={onResetShortcuts}>
            Reset to Defaults
          </button>
          <button className="shortcuts-modal__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
