import { useEffect, useRef, useState } from "react";
import { toMediaUrl } from "../utils/paths.js";
import Icon from "./Icon.jsx";
import "./ImagePanel.css";

const STORAGE_KEY = "disc.imagePanel";
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed.path === "string") {
      return { path: parsed.path, fit: parsed.fit === "cover" ? "cover" : "contain" };
    }
  } catch {
    // fall through to "nothing chosen yet"
  }
  return { path: null, fit: "contain" };
}

// A panel that just shows a picture (or GIF) of the user's choosing — for
// putting something that makes you smile next to your library. Only the
// file's *path* is stored, and the image itself streams straight from disk
// through the same disc-media:// protocol tracks play from, so a big GIF
// never has to fit inside localStorage. That also means moving or deleting
// the file leaves the panel empty (with a nudge to pick a new one) rather
// than showing a stale copy.
export default function ImagePanel() {
  const [state, setState] = useState(load);
  const [broken, setBroken] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Not persisting is better than crashing the panel.
    }
  }, [state]);

  useEffect(() => {
    setBroken(false);
  }, [state.path]);

  async function choose() {
    const picked = await window.disc?.chooseImage();
    if (picked) setState((s) => ({ ...s, path: picked }));
  }

  function remove() {
    setState((s) => ({ ...s, path: null }));
  }

  function toggleFit() {
    setState((s) => ({ ...s, fit: s.fit === "contain" ? "cover" : "contain" }));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = [...(e.dataTransfer?.files || [])].find((f) => IMAGE_EXTENSIONS.test(f.name));
    if (!file) return;
    const filePath = window.disc?.getPathForFile(file);
    if (filePath) setState((s) => ({ ...s, path: filePath }));
  }

  const hasImage = Boolean(state.path) && !broken;

  return (
    <div
      className={"image-panel" + (dragOver ? " image-panel--drag-over" : "")}
      ref={rootRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {hasImage ? (
        <>
          <img
            className="image-panel__img"
            style={{ objectFit: state.fit }}
            src={toMediaUrl(state.path)}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
          />
          <div className="image-panel__controls">
            <button
              className="image-panel__control"
              title={state.fit === "contain" ? "Fill the panel (crop edges)" : "Fit the whole image"}
              onClick={toggleFit}
            >
              <Icon name={state.fit === "contain" ? "compact" : "compress"} size={13} />
            </button>
            <button className="image-panel__control" title="Choose a different image" onClick={choose}>
              <Icon name="folder" size={13} />
            </button>
            <button className="image-panel__control" title="Remove image" onClick={remove}>
              ×
            </button>
          </div>
        </>
      ) : (
        <div className="image-panel__empty">
          <div className="image-panel__empty-icon">
            <Icon name="image" size={22} />
          </div>
          <div className="image-panel__empty-title">
            {broken ? "Couldn't load that image" : "Add a picture"}
          </div>
          <p className="image-panel__empty-body">
            {broken
              ? "The file may have been moved or deleted. Pick it again, or choose a new one."
              : "Drop an image or GIF here, or choose one — handy for a little something to smile at."}
          </p>
          <button className="image-panel__choose" onClick={choose}>
            Choose Image…
          </button>
        </div>
      )}
    </div>
  );
}
