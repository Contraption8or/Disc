import { useEffect, useMemo, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { getEffectiveAnalysis } from "../audio/effectiveAnalysis.js";
import { findDuplicateIds } from "../audio/duplicates.js";
import { isTrackMissing } from "../utils/missingTracks.js";
import { formatSize } from "../utils/format.js";
import "./LibraryHealthModal.css";

export default function LibraryHealthModal({ onClose }) {
  const {
    allTracks,
    trackTags,
    trackOverrides,
    missingFolderIds,
    musicFolderPath,
    customFolders,
    onSetHealthFilter,
  } = useDisc();

  const rootRef = useRef(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [duplicateIds, setDuplicateIds] = useState(() => new Set());

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

  // Computed once when the dashboard opens (not on every render) — this is
  // a deliberate, explicit "check my library" action, unlike the passive
  // scanning Disc does everywhere else.
  useEffect(() => {
    setScanningDuplicates(true);
    // Let the modal paint first, then do the (synchronous, potentially
    // non-trivial) scan on the next tick.
    const timer = setTimeout(() => {
      setDuplicateIds(findDuplicateIds(allTracks));
      setScanningDuplicates(false);
    }, 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let untagged = 0;
    let unanalyzed = 0;
    let missing = 0;
    let totalSize = 0;

    allTracks.forEach((t) => {
      totalSize += t.sizeBytes || 0;
      if (!(trackTags[t.id] || []).length) untagged += 1;
      const effective = getEffectiveAnalysis(t.id, trackOverrides);
      if (effective.bpm == null && effective.key == null) unanalyzed += 1;
      if (isTrackMissing(t, missingFolderIds, musicFolderPath, customFolders)) missing += 1;
    });

    return { untagged, unanalyzed, missing, totalSize };
  }, [allTracks, trackTags, trackOverrides, missingFolderIds, musicFolderPath, customFolders]);

  function view(type) {
    onSetHealthFilter(type);
    onClose();
  }

  return (
    <div className="health-modal__backdrop">
      <div className="health-modal" ref={rootRef}>
        <div className="health-modal__title">Library Health</div>
        <p className="health-modal__subtitle">
          {allTracks.length} tracks · {formatSize(stats.totalSize)}
        </p>

        <div className="health-modal__rows">
          <div className="health-modal__row">
            <div className="health-modal__row-text">
              <div className="health-modal__row-title">Untagged</div>
              <div className="health-modal__row-desc">Tracks with no tags assigned</div>
            </div>
            <div className="health-modal__row-count">{stats.untagged}</div>
            <button
              className="health-modal__view"
              disabled={stats.untagged === 0}
              onClick={() => view("untagged")}
            >
              View
            </button>
          </div>

          <div className="health-modal__row">
            <div className="health-modal__row-text">
              <div className="health-modal__row-title">Not yet analyzed</div>
              <div className="health-modal__row-desc">
                No BPM/Key detected or set (open a track in Details to analyze it)
              </div>
            </div>
            <div className="health-modal__row-count">{stats.unanalyzed}</div>
            <button
              className="health-modal__view"
              disabled={stats.unanalyzed === 0}
              onClick={() => view("unanalyzed")}
            >
              View
            </button>
          </div>

          <div className="health-modal__row">
            <div className="health-modal__row-text">
              <div className="health-modal__row-title">Missing</div>
              <div className="health-modal__row-desc">
                Folder currently unreachable (drive unplugged, etc.)
              </div>
            </div>
            <div className="health-modal__row-count">{stats.missing}</div>
            <button
              className="health-modal__view"
              disabled={stats.missing === 0}
              onClick={() => view("missing")}
            >
              View
            </button>
          </div>

          <div className="health-modal__row">
            <div className="health-modal__row-text">
              <div className="health-modal__row-title">Likely duplicates</div>
              <div className="health-modal__row-desc">
                Exact file size, or waveform-shape match among opened tracks
              </div>
            </div>
            <div className="health-modal__row-count">
              {scanningDuplicates ? "…" : duplicateIds.size}
            </div>
            <button
              className="health-modal__view"
              disabled={scanningDuplicates || duplicateIds.size === 0}
              onClick={() => view("duplicates")}
            >
              View
            </button>
          </div>
        </div>

        <button className="health-modal__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
