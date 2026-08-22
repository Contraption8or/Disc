import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import "./LayoutContextMenu.css";

export default function LayoutContextMenu({
  x,
  y,
  isDefault,
  onSetDefault,
  onRename,
  onUpdateWithCurrent,
  onClose,
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="layout-context-menu" style={{ left: x, top: y }} ref={rootRef}>
      <button
        className="layout-context-menu__option"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename…
      </button>
      <button
        className="layout-context-menu__option"
        title="Overwrite this preset with the panel layout you currently have open"
        onClick={() => {
          onUpdateWithCurrent();
          onClose();
        }}
      >
        <Icon name="convert" size={13} style={{ marginRight: 6 }} />
        Update with Current Layout
      </button>
      <button
        className="layout-context-menu__option"
        disabled={isDefault}
        onClick={() => {
          onSetDefault();
          onClose();
        }}
      >
        {isDefault ? (
          <>
            <Icon name="starFilled" size={13} style={{ marginRight: 6 }} />
            Already the default
          </>
        ) : (
          <>
            <Icon name="starOutline" size={13} style={{ marginRight: 6 }} />
            Set as Default
          </>
        )}
      </button>
    </div>
  );
}
