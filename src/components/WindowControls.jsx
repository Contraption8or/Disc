import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import "./WindowControls.css";

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!window.disc) return;
    window.disc.windowIsMaximized().then(setIsMaximized);
    return window.disc.onWindowMaximizedChanged(setIsMaximized);
  }, []);

  return (
    <div className="window-controls" onDoubleClick={(e) => e.stopPropagation()}>
      <button
        className="window-controls__button"
        title="Minimize"
        onClick={() => window.disc?.windowMinimize()}
      >
        <Icon name="windowMinimize" size={13} />
      </button>
      <button
        className="window-controls__button"
        title={isMaximized ? "Restore" : "Maximize"}
        onClick={async () => {
          const next = await window.disc?.windowToggleMaximize();
          if (typeof next === "boolean") setIsMaximized(next);
        }}
      >
        <Icon name={isMaximized ? "windowRestore" : "windowMaximize"} size={12} />
      </button>
      <button
        className="window-controls__button window-controls__button--close"
        title="Close"
        onClick={() => window.disc?.windowClose()}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
