import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import "./WindowsMenu.css";

export default function WindowsMenu({ knownPanels, openPanelIds, onTogglePanel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="windows-menu" ref={rootRef}>
      <button
        className="titlebar__icon-button"
        title="Windows — show/hide panels"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="panels" size={15} />
      </button>
      {open && (
        <div className="windows-menu__dropdown">
          <div className="windows-menu__title">Panels</div>
          {knownPanels.map((panel) => {
            const isOpen = openPanelIds.has(panel.id);
            return (
              <button
                key={panel.id}
                className="windows-menu__option"
                onClick={() => onTogglePanel(panel.id)}
              >
                <span className="windows-menu__check">
                  {isOpen && <Icon name="check" size={11} />}
                </span>
                {panel.title}
              </button>
            );
          })}
          <p className="windows-menu__hint">
            Closed a panel by mistake? Check it here to bring it back.
          </p>
        </div>
      )}
    </div>
  );
}
