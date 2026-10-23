import { useEffect } from "react";
import WindowControls from "./WindowControls.jsx";
import Icon from "./Icon.jsx";
import "./TitleBar.css";

export default function TitleBar({ pinned, onTogglePin }) {
  // The window-snap system (see electron/main.js) needs to know exactly
  // when a title-bar drag actually ends, not just "no movement for a
  // while" — that's only a fallback there. A real OS-level window drag
  // still delivers this window's own mouseup once the button is released,
  // so a plain document-level listener catches it; main.js only acts on it
  // if a drag was actually in progress.
  useEffect(() => {
    function handleMouseUp() {
      window.disc?.notifyMouseUp();
    }
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div className="titlebar" onDoubleClick={() => window.disc?.windowToggleMaximize()}>
      <div className="titlebar__brand">
        <span className="titlebar__name">Disc</span>
      </div>

      {/* stopPropagation: the outer bar maximizes on double-click, and
          no-drag only tells the OS this isn't a drag handle — it doesn't
          stop React's double-click from bubbling up to that handler. */}
      <div className="titlebar__actions" onDoubleClick={(e) => e.stopPropagation()}>
        <button
          className={"titlebar__pin" + (pinned ? " titlebar__pin--active" : "")}
          onClick={onTogglePin}
          title={pinned ? "Unpin from top" : "Keep Disc on top of other windows"}
        >
          <Icon name={pinned ? "lockClosed" : "lockOpen"} size={13} />
          {pinned ? "Pinned" : "Pin on top"}
        </button>
        <div className="titlebar__divider" />
        <WindowControls />
      </div>
    </div>
  );
}
