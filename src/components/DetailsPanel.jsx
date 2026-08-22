import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { computeWaveform, getCachedWaveform } from "../audio/waveform.js";
import { computeAnalysis, getCachedAnalysis } from "../audio/analysis.js";
import { describeVibe } from "../audio/similarity.js";
import { downsamplePeaks } from "../audio/downsamplePeaks.js";
import { getSectionDragPath, prepareSectionDrag } from "../audio/sectionDrag.js";
import { useElementWidth } from "../hooks/useElementWidth.js";
import { formatSize, formatDuration, stripExtension } from "../utils/format.js";
import TagAssignMenu from "./TagAssignMenu.jsx";
import TagContextMenu from "./TagContextMenu.jsx";
import Dropdown from "./Dropdown.jsx";
import Icon from "./Icon.jsx";
import "./DetailsPanel.css";

const BAR_PX = 3;
const KEY_OPTIONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// One row in the marked-sections list. Dragging it out hands Premiere just
// that section's audio, not the whole track — which means Disc first has
// to trim + re-encode a standalone clip and write it to a temp file (see
// src/audio/sectionDrag.js), and that can't happen live inside the
// browser's dragstart the way a whole-track drag can (Electron's
// startDrag has to be called synchronously from that event, and
// decode+encode isn't instant). So the clip is prepared ahead of time —
// starting the moment the pointer enters the row — and cached; by the
// time an actual drag gesture happens, it's normally already sitting on
// disk ready to hand off. A very fast grab right after hover can still
// beat the render, though: dragstart checks whether the file is actually
// ready and just cancels the drag (falling back to a normal click) if not,
// same veto pattern TrackRow uses for its own drag-out.
function SectionRow({ track, section, index, label, onJump, onDelete }) {
  const [ready, setReady] = useState(() => Boolean(getSectionDragPath(track, section)));
  const pathRef = useRef(getSectionDragPath(track, section));

  function ensurePrepared() {
    if (pathRef.current) return;
    prepareSectionDrag(track, section, index)
      .then((path) => {
        pathRef.current = path;
        setReady(true);
      })
      .catch((err) => console.error("Couldn't prepare section for drag:", err));
  }

  function handleDragStart(e) {
    e.preventDefault();
    if (!pathRef.current) return;
    window.disc?.startDrag(pathRef.current);
  }

  return (
    <div
      className="details-panel__section-row"
      draggable
      onMouseEnter={ensurePrepared}
      onDragStart={handleDragStart}
    >
      <button className="details-panel__section-jump" title="Jump to this section" onClick={onJump}>
        <Icon name="play" size={10} style={{ marginRight: 6 }} />
        {label}
      </button>
      <span
        className="details-panel__section-drag-hint"
        title={
          ready
            ? "Drag into Premiere Pro — just this section's audio"
            : "Hover a moment, then drag into Premiere Pro — just this section's audio"
        }
      >
        <Icon name="gripDots" size={12} />
      </span>
      <button
        className="details-panel__section-delete"
        title="Delete this section"
        onClick={onDelete}
      >
        ×
      </button>
    </div>
  );
}

export default function DetailsPanel() {
  const {
    allTracks,
    selectedTrackId,
    favoriteIds,
    onToggleFavorite,
    currentTrackId,
    isPlaying,
    togglePlayPause,
    seekTo,
    playTrackSection,
    trackSections,
    onAddTrackSection,
    onDeleteTrackSection,
    getCurrentTime,
    tags,
    trackTags,
    onToggleTrackTag,
    onCreateTag,
    onDeleteTag,
    onAnalysisUpdated,
    trackNotes,
    onSetTrackNote,
    trackOverrides,
    onSetTrackOverride,
    onFindSimilar,
  } = useDisc();

  const track = allTracks.find((t) => t.id === selectedTrackId) || null;
  const isVideo = track?.fileType === "video";
  const [waveformData, setWaveformData] = useState(() =>
    track && !isVideo ? getCachedWaveform(track.id) : null
  );
  const [analysis, setAnalysis] = useState(() =>
    track && !isVideo ? getCachedAnalysis(track.id) : null
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  // Fraction (0-1) captured by "Mark In", waiting on "Mark Out" to
  // complete a new section. Reset whenever the displayed track changes,
  // since a half-marked section from a different track wouldn't mean
  // anything here.
  const [pendingIn, setPendingIn] = useState(null);
  const [tagContextMenu, setTagContextMenu] = useState(null); // { x, y, tag } | null

  const waveformRef = useRef(null);
  const waveformWidth = useElementWidth(waveformRef);
  const barCount = Math.max(20, Math.floor(waveformWidth / BAR_PX));

  useEffect(() => {
    setPendingIn(null);
  }, [track?.id]);

  useEffect(() => {
    if (!track || isVideo) {
      setWaveformData(null);
      return;
    }
    const cached = getCachedWaveform(track.id);
    if (cached) {
      setWaveformData(cached);
      return;
    }
    setWaveformData(null);
    let cancelled = false;
    computeWaveform(track).then((data) => {
      if (!cancelled && data) setWaveformData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [track, isVideo]);

  // BPM/Key detection is heavier than waveform decoding, so it's only run
  // when a track is actually opened here — not for every row that scrolls
  // into view in the library list. Video clips don't get this at all;
  // Disc's audio analysis pipeline doesn't operate on video containers.
  useEffect(() => {
    if (!track || isVideo) {
      setAnalysis(null);
      setAnalyzing(false);
      return;
    }
    const cached = getCachedAnalysis(track.id);
    if (cached) {
      setAnalysis(cached);
      setAnalyzing(false);
      return;
    }
    setAnalysis(null);
    setAnalyzing(true);
    let cancelled = false;
    computeAnalysis(track).then((data) => {
      if (cancelled) return;
      setAnalyzing(false);
      if (data) {
        setAnalysis(data);
        onAnalysisUpdated();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [track, isVideo, onAnalysisUpdated]);

  if (!track) {
    return (
      <div className="details-panel">
        <div className="details-panel__empty">
          <div className="details-panel__icon">
            <Icon name="info" size={26} />
          </div>
          <div className="details-panel__title">No track selected</div>
          <p className="details-panel__text">
            Select a track to see its waveform, tags, BPM, and key here.
          </p>
        </div>
      </div>
    );
  }

  const isFavorite = favoriteIds.includes(track.id);
  const isActive = currentTrackId === track.id;
  const assignedTagIds = trackTags[track.id] || [];
  const assignedTags = tags.filter((t) => assignedTagIds.includes(t.id));
  const availableTags = tags.filter((t) => !assignedTagIds.includes(t.id));

  function handleCreateAndAssign(name, color) {
    const id = onCreateTag(name, color);
    if (id) onToggleTrackTag(track.id, id);
  }

  const override = trackOverrides[track.id] || {};
  const bpmIsOverride = override.bpm != null;
  const keyIsOverride = Boolean(override.key);
  const effectiveBpm = override.bpm ?? analysis?.bpm ?? "";
  const effectiveKey = override.key ?? analysis?.key ?? "";

  // This waveform is purely visual otherwise — no native drag-out here
  // (that's the Library row's job), so there's no conflicting gesture to
  // guard against the way TrackRow's version has to.
  function handleWaveformMouseDown(e) {
    if (isVideo) return;
    const container = e.currentTarget;

    function fractionAt(clientX) {
      const rect = container.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    seekTo(track, fractionAt(e.clientX));

    function handleMouseMove(moveEvent) {
      seekTo(track, fractionAt(moveEvent.clientX));
    }
    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handlePlayClick(e) {
    if (isVideo) return;
    if (e.ctrlKey || e.metaKey) {
      playTrackSection(track, trackSections[track.id]);
    } else if (e.shiftKey) {
      togglePlayPause(track, { forceFromStart: true });
    } else {
      togglePlayPause(track);
    }
  }

  // Mark In captures the current playback position as a pending start
  // point; Mark Out captures the current position as the end and
  // completes the section. Whichever position is later becomes the end,
  // regardless of the order they were actually marked in — marking In
  // after Out (e.g. correcting a mistake) still produces a sensible
  // section instead of an inverted one.
  function handleMarkIn() {
    const dur = waveformData?.duration;
    if (!dur) return;
    setPendingIn(getCurrentTime() / dur);
  }

  function handleMarkOut() {
    const dur = waveformData?.duration;
    if (!dur || pendingIn == null) return;
    const outFraction = getCurrentTime() / dur;
    const [start, end] =
      pendingIn <= outFraction ? [pendingIn, outFraction] : [outFraction, pendingIn];
    onAddTrackSection(track.id, start, end);
    setPendingIn(null);
  }

  return (
    <div className="details-panel details-panel--filled">
      <div className="details-panel__header">
        <div className="details-panel__name" title={track.fileName}>
          {stripExtension(track.fileName)}
        </div>
        <button
          className={
            "details-panel__favorite" +
            (isFavorite ? " details-panel__favorite--active" : "")
          }
          onClick={() => onToggleFavorite(track.id)}
          title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Icon name={isFavorite ? "heartFilled" : "heartOutline"} size={16} />
        </button>
      </div>

      <div
        className="details-panel__mini-waveform"
        ref={waveformRef}
        onMouseDown={handleWaveformMouseDown}
      >
        {isVideo ? (
          <div className="details-panel__waveform-loading">
            <Icon name="video" size={13} style={{ marginRight: 5 }} />
            Video clip — Disc doesn't preview video, but you can still
            drag it into Premiere
          </div>
        ) : waveformData ? (
          <div className="details-panel__bars-in" key="loaded">
            {downsamplePeaks(waveformData.peaks, barCount).map((p, i) => (
              <span key={i} style={{ height: `${6 + p * 94}%` }} />
            ))}
          </div>
        ) : null}
        {!isVideo &&
          (trackSections[track.id] || []).map((section) => (
            <div
              key={section.id}
              className="details-panel__section-highlight"
              style={{
                left: `${section.startFraction * 100}%`,
                width: `${(section.endFraction - section.startFraction) * 100}%`,
              }}
              title={`Section: ${formatDuration(section.startFraction * (waveformData?.duration || 0))} → ${formatDuration(
                section.endFraction * (waveformData?.duration || 0)
              )}`}
            />
          ))}
        {!isVideo && pendingIn != null && (
          <div
            className="details-panel__section-pending-marker"
            style={{ left: `${pendingIn * 100}%` }}
            title="Marked in point — Mark Out to complete the section"
          />
        )}
      </div>

      <button
        className="details-panel__play"
        onClick={handlePlayClick}
        disabled={isVideo}
        title={
          isVideo
            ? "Disc doesn't preview video clips"
            : "Click, or drag the waveform above, to move around · Shift-click to restart · Ctrl-click to cycle marked sections"
        }
      >
        {isVideo ? (
          <>
            <Icon name="video" size={13} style={{ marginRight: 5 }} />
            No preview
          </>
        ) : (
          <>
            <Icon name={isActive && isPlaying ? "pause" : "play"} size={13} style={{ marginRight: 5 }} />
            {isActive && isPlaying ? "Pause" : "Play"}
          </>
        )}
      </button>

      <div className="details-panel__meta">
        <div className="details-panel__meta-row">
          <span>Duration</span>
          <span>{isVideo ? "—" : formatDuration(waveformData?.duration) ?? "—"}</span>
        </div>
        <div className="details-panel__meta-row">
          <span>Size</span>
          <span>{formatSize(track.sizeBytes)}</span>
        </div>
        <div className="details-panel__meta-row">
          <span>Folder</span>
          <span>{track.relativeDir || "(root)"}</span>
        </div>
        <div className="details-panel__meta-row details-panel__meta-row--path">
          <span>Path</span>
          <span title={track.filePath}>{track.filePath}</span>
        </div>
      </div>

      <div className="details-panel__section">
        <div className="details-panel__section-title">Tags</div>
        <div className="details-panel__tags">
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className="details-panel__tag-chip"
              style={{ background: tag.color, color: tag.color }}
              title="Right-click for more options"
              onContextMenu={(e) => {
                e.preventDefault();
                setTagContextMenu({ x: e.clientX, y: e.clientY, tag });
              }}
            >
              {tag.name}
              <button
                className="details-panel__tag-remove"
                onClick={() => onToggleTrackTag(track.id, tag.id)}
                title={`Remove "${tag.name}"`}
              >
                ×
              </button>
            </span>
          ))}
          <div className="details-panel__tag-add-wrap">
            <button
              className="details-panel__tag-add"
              onClick={() => setTagMenuOpen((v) => !v)}
            >
              + Add
            </button>
            {tagMenuOpen && (
              <TagAssignMenu
                availableTags={availableTags}
                onAssign={(tagId) => onToggleTrackTag(track.id, tagId)}
                onCreateAndAssign={handleCreateAndAssign}
                onClose={() => setTagMenuOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="details-panel__section">
        <div className="details-panel__section-title">Notes</div>
        <textarea
          key={track.id}
          className="details-panel__notes"
          defaultValue={trackNotes[track.id] || ""}
          placeholder="Add a note…"
          onBlur={(e) => onSetTrackNote(track.id, e.target.value)}
        />
      </div>

      {!isVideo && (
        <div className="details-panel__section">
          <div className="details-panel__section-title">
            Sections
            {pendingIn != null && (
              <span className="details-panel__manual-tag">in point set</span>
            )}
          </div>
          <div className="details-panel__section-actions">
            <button className="details-panel__section-btn" onClick={handleMarkIn}>
              Mark In
            </button>
            <button
              className="details-panel__section-btn"
              disabled={pendingIn == null}
              onClick={handleMarkOut}
            >
              Mark Out
            </button>
          </div>
          {(trackSections[track.id] || []).length > 0 && (
            <div className="details-panel__section-list">
              {trackSections[track.id].map((section, i) => {
                const dur = waveformData?.duration || 0;
                return (
                  <SectionRow
                    key={section.id}
                    track={track}
                    section={section}
                    index={i}
                    label={`${i + 1}. ${formatDuration(section.startFraction * dur)} → ${formatDuration(
                      section.endFraction * dur
                    )}`}
                    onJump={() => seekTo(track, section.startFraction)}
                    onDelete={() => onDeleteTrackSection(track.id, section.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isVideo && (
        <>
          <div className="details-panel__section-grid">
            <div className="details-panel__section">
              <div className="details-panel__section-title">
                BPM{bpmIsOverride && <span className="details-panel__manual-tag">manual</span>}
              </div>
              <div className="details-panel__value-row">
                <input
                  key={track.id + "-bpm"}
                  type="number"
                  className="details-panel__value details-panel__value--input"
                  defaultValue={effectiveBpm}
                  placeholder={analyzing ? "…" : "—"}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    onSetTrackOverride(track.id, "bpm", v ? Number(v) : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                {bpmIsOverride && (
                  <button
                    className="details-panel__value-reset"
                    title="Reset to auto-detected value"
                    onClick={() => onSetTrackOverride(track.id, "bpm", null)}
                  >
                    <Icon name="undo" size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="details-panel__section">
              <div className="details-panel__section-title">
                KEY{keyIsOverride && <span className="details-panel__manual-tag">manual</span>}
              </div>
              <div className="details-panel__value-row">
                <Dropdown
                  className="details-panel__value details-panel__value--input"
                  value={effectiveKey}
                  onChange={(v) => onSetTrackOverride(track.id, "key", v || null)}
                  options={[
                    { value: "", label: analyzing ? "…" : "—" },
                    ...KEY_OPTIONS.map((k) => ({ value: k, label: k })),
                  ]}
                />
                {keyIsOverride && (
                  <button
                    className="details-panel__value-reset"
                    title="Reset to auto-detected value"
                    onClick={() => onSetTrackOverride(track.id, "key", null)}
                  >
                    <Icon name="undo" size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {analysis && (
            <div className="details-panel__section">
              <div className="details-panel__section-title">Vibe</div>
              <div className="details-panel__vibe-row">
                <span className="details-panel__vibe-label">
                  {describeVibe(analysis) || "—"}
                </span>
                <button
                  className="details-panel__find-similar"
                  onClick={() => onFindSimilar(track.id)}
                  title="Rank the rest of your library by how similar it sounds — BPM, key, timbre, and shared tags, not a genre guess"
                >
                  Find Similar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tagContextMenu && (
        <TagContextMenu
          x={tagContextMenu.x}
          y={tagContextMenu.y}
          tagName={tagContextMenu.tag.name}
          onRemoveFromTrack={() => onToggleTrackTag(track.id, tagContextMenu.tag.id)}
          onDeleteForever={() => onDeleteTag(tagContextMenu.tag.id)}
          onClose={() => setTagContextMenu(null)}
        />
      )}
    </div>
  );
}
