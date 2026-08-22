import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import "./FolderCreateMenu.css";

export default function FolderCreateMenu({ x, y, onCreateFolder, onCreateDivider, onClose }) {
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
    <div className="folder-create-menu" style={{ left: x, top: y }} ref={rootRef}>
      <button
        className="folder-create-menu__option"
        onClick={() => {
          onCreateFolder();
          onClose();
        }}
      >
        <Icon name="folder" size={14} style={{ marginRight: 6 }} />
        New Folder
      </button>
      <button
        className="folder-create-menu__option"
        onClick={() => {
          onCreateDivider();
          onClose();
        }}
      >
        <Icon name="section" size={14} style={{ marginRight: 6 }} />
        New Section
      </button>
    </div>
  );
}
