import { useEffect, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import { getPreloadCandidates } from "../audio/preload.js";
import Dropdown from "./Dropdown.jsx";
import "./SettingsModal.css";

const MEMORY_OPTIONS = [
  { value: "", label: "Default (no limit)" },
  { value: "1024", label: "1 GB" },
  { value: "2048", label: "2 GB" },
  { value: "4096", label: "4 GB" },
  { value: "8192", label: "8 GB" },
  { value: "16384", label: "16 GB" },
];

function buildCpuOptions(cpuCount) {
  const options = [
    { value: "", label: "Default (4 threads)" },
    { value: "8", label: "8 threads" },
    { value: "16", label: "16 threads" },
    { value: "32", label: "32 threads" },
  ];
  if (cpuCount && !options.some((o) => o.value === String(cpuCount))) {
    options.push({ value: String(cpuCount), label: `Match my CPU (${cpuCount})` });
  }
  return options;
}

function formatTimeLeft({ completed, total, startedAt }) {
  if (!startedAt || completed === 0 || total === 0) return "Estimating…";
  const elapsedMs = Date.now() - startedAt;
  const remaining = total - completed;
  const msLeft = (remaining / completed) * elapsedMs;
  const secLeft = Math.round(msLeft / 1000);
  if (secLeft < 5) return "Almost done…";
  if (secLeft < 60) return `~${secLeft}s left`;
  const minLeft = Math.round(secLeft / 60);
  if (minLeft < 60) return `~${minLeft} min left`;
  return `~${(minLeft / 60).toFixed(1)} hr left`;
}

export default function SettingsModal({ onClose }) {
  const {
    appearanceSettings,
    onSetAppearance,
    allTracks,
    preloadState,
    onStartPreload,
    onCancelPreload,
    onResetPreload,
    preloadConcurrency,
    onSetPreloadConcurrency,
  } = useDisc();
  const [currentLimit, setCurrentLimit] = useState(null);
  const [selected, setSelected] = useState("");
  const [currentThreadPoolSize, setCurrentThreadPoolSize] = useState(null);
  const [selectedThreads, setSelectedThreads] = useState("");
  const [cpuCount, setCpuCount] = useState(null);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [appVersion, setAppVersion] = useState(null);
  // "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error"
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const rootRef = useRef(null);

  const candidateCount = getPreloadCandidates(allTracks).length;

  useEffect(() => {
    window.disc?.getMemoryLimit().then((mb) => {
      setCurrentLimit(mb);
      setSelected(mb ? String(mb) : "");
    });
    window.disc?.getThreadPoolSize().then((n) => {
      setCurrentThreadPoolSize(n);
      setSelectedThreads(n ? String(n) : "");
    });
    window.disc?.getCpuCount().then(setCpuCount);
    window.disc?.getAppVersion().then(setAppVersion);
  }, []);

  // Deliberately not auto-run on open — checking is a real network call to
  // GitHub, so it only happens when someone actually asks for it.
  async function handleCheckForUpdates() {
    setUpdateStatus("checking");
    setUpdateError(null);
    const result = await window.disc?.checkForUpdates();
    if (!result?.success) {
      setUpdateStatus("error");
      setUpdateError(result?.error || "Couldn't check for updates");
      return;
    }
    setUpdateInfo(result);
    setUpdateStatus(result.hasUpdate ? "available" : "up-to-date");
  }

  // On success the main process launches the downloaded installer and
  // quits Disc itself almost immediately after — there's normally nothing
  // left to update in the UI by the time this resolves either way.
  async function handleInstallUpdate() {
    if (!updateInfo?.downloadUrl) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    const result = await window.disc?.downloadAndInstallUpdate(
      updateInfo.downloadUrl,
      updateInfo.assetName
    );
    if (!result?.success) {
      setUpdateStatus("error");
      setUpdateError(result?.error || "Couldn't download the update");
    }
  }

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

  const hasChanged =
    selected !== (currentLimit ? String(currentLimit) : "") ||
    selectedThreads !== (currentThreadPoolSize ? String(currentThreadPoolSize) : "");

  async function handleSave() {
    const mb = selected ? Number(selected) : null;
    const threads = selectedThreads ? Number(selectedThreads) : null;
    await Promise.all([
      window.disc?.setMemoryLimit(mb),
      window.disc?.setThreadPoolSize(threads),
    ]);
    setShowRestartPrompt(true);
  }

  return (
    <div className="settings-modal__backdrop">
      <div className="settings-modal" ref={rootRef}>
        <div className="settings-modal__title">Settings</div>

        <div className="settings-modal__section-title">Updates</div>
        <p className="settings-modal__note settings-modal__note--top">
          {appVersion ? `You're on version ${appVersion}.` : "Checking version…"}
        </p>

        {updateStatus === "up-to-date" && (
          <p className="settings-modal__note settings-modal__note--top">
            You're up to date.
          </p>
        )}
        {updateStatus === "error" && (
          <p className="settings-modal__note settings-modal__note--top">
            {updateError}
          </p>
        )}
        {updateStatus === "available" && updateInfo && (
          <p className="settings-modal__note settings-modal__note--top">
            Version {updateInfo.latestVersion} is available
            {updateInfo.downloadUrl ? "." : " — no installer was found on that release, download it manually from GitHub."}
          </p>
        )}

        <div className="settings-modal__actions">
          {updateStatus === "available" && updateInfo?.downloadUrl ? (
            <button
              className="settings-modal__save"
              style={{ width: "100%" }}
              onClick={handleInstallUpdate}
            >
              Download &amp; Install v{updateInfo.latestVersion}
            </button>
          ) : (
            <button
              className="settings-modal__cancel"
              style={{ width: "100%" }}
              onClick={handleCheckForUpdates}
              disabled={updateStatus === "checking" || updateStatus === "downloading"}
            >
              {updateStatus === "checking"
                ? "Checking…"
                : updateStatus === "downloading"
                ? "Downloading…"
                : "Check for Updates"}
            </button>
          )}
        </div>

        <div className="settings-modal__divider" />
        <div className="settings-modal__section-title">Performance</div>

        <label className="settings-modal__label">Memory limit</label>
        <Dropdown
          className="settings-modal__select"
          value={selected}
          onChange={setSelected}
          options={MEMORY_OPTIONS}
        />

        <label className="settings-modal__label">CPU threads (file I/O)</label>
        <Dropdown
          className="settings-modal__select"
          value={selectedThreads}
          onChange={setSelectedThreads}
          options={buildCpuOptions(cpuCount)}
        />

        {showRestartPrompt ? (
          <div className="settings-modal__restart">
            <p className="settings-modal__restart-text">
              Saved. Restart Disc now to apply it?
            </p>
            <div className="settings-modal__actions">
              <button
                className="settings-modal__cancel"
                onClick={() => setShowRestartPrompt(false)}
              >
                Later
              </button>
              <button
                className="settings-modal__save"
                onClick={() => window.disc?.relaunchApp()}
              >
                Restart Now
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-modal__actions">
            <button
              className="settings-modal__save"
              onClick={handleSave}
              disabled={!hasChanged}
              style={{ width: "100%" }}
            >
              Save Performance Settings
            </button>
          </div>
        )}

        <div className="settings-modal__divider" />
        <div className="settings-modal__section-title">Preload Library</div>

        {preloadState.status === "idle" && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              {candidateCount === 0
                ? "Everything's already loaded — waveforms and BPM/Key are cached for your whole library."
                : `${candidateCount} of ${allTracks.length} tracks don't have a waveform/BPM/Key cached yet. Decode and analyze all of them now — leave it running and come back once it's done.`}
            </p>
            {candidateCount > 0 && (
              <div className="settings-modal__slider-row">
                <span className="settings-modal__slider-label">Decode speed</span>
                <Dropdown
                  className="settings-modal__select settings-modal__select--inline"
                  value={preloadConcurrency}
                  onChange={onSetPreloadConcurrency}
                  options={[
                    { value: 3, label: "Normal (3 at once)" },
                    { value: 6, label: "Fast (6 at once)" },
                    { value: 10, label: "Faster (10 at once)" },
                    { value: 16, label: "Maximum (16 at once)" },
                  ]}
                />
              </div>
            )}
            {preloadConcurrency > 3 && (
              <p className="settings-modal__note settings-modal__note--top">
                Higher settings finish faster but use more CPU/disk while
                running.
              </p>
            )}
            <div className="settings-modal__actions">
              <button
                className="settings-modal__save"
                onClick={onStartPreload}
                disabled={candidateCount === 0}
                style={{ width: "100%" }}
              >
                Preload All Music
              </button>
            </div>
          </>
        )}

        {preloadState.status === "running" && (
          <>
            <div className="settings-modal__progress-track">
              <div
                className="settings-modal__progress-fill"
                style={{
                  width: `${preloadState.total ? (preloadState.completed / preloadState.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="settings-modal__note settings-modal__note--top">
              {preloadState.completed} / {preloadState.total} tracks ·{" "}
              {formatTimeLeft(preloadState)}
              {preloadConcurrency > 3 && ` · ${preloadConcurrency} at once`}
            </p>
            <div className="settings-modal__actions">
              <button
                className="settings-modal__cancel"
                style={{ width: "100%" }}
                onClick={onCancelPreload}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {(preloadState.status === "done" || preloadState.status === "cancelled") && (
          <>
            <p className="settings-modal__note settings-modal__note--top">
              {preloadState.status === "done"
                ? `Done — loaded ${preloadState.completed} tracks.`
                : `Stopped after ${preloadState.completed} of ${preloadState.total} tracks.`}
            </p>
            <div className="settings-modal__actions">
              <button
                className="settings-modal__save"
                style={{ width: "100%" }}
                onClick={onResetPreload}
              >
                OK
              </button>
            </div>
          </>
        )}

        <div className="settings-modal__divider" />
        <div className="settings-modal__section-title">Appearance</div>

        <label className="settings-modal__toggle-row">
          <span>
            Clean mode
            <span className="settings-modal__hint"> — removes rounded corners app-wide</span>
          </span>
          <input
            type="checkbox"
            checked={appearanceSettings.cleanMode}
            onChange={(e) => onSetAppearance({ cleanMode: e.target.checked })}
          />
        </label>

        <label className="settings-modal__toggle-row">
          <span>
            Reduce motion
            <span className="settings-modal__hint"> — disables transitions/animations</span>
          </span>
          <input
            type="checkbox"
            checked={appearanceSettings.reduceMotion}
            onChange={(e) => onSetAppearance({ reduceMotion: e.target.checked })}
          />
        </label>

        <label className="settings-modal__toggle-row">
          <span>Spill</span>
          <input
            type="checkbox"
            checked={appearanceSettings.spillEnabled}
            onChange={(e) => onSetAppearance({ spillEnabled: e.target.checked })}
          />
        </label>
        {appearanceSettings.spillEnabled && (
          <div className="settings-modal__slider-row">
            <span className="settings-modal__slider-label">Intensity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={appearanceSettings.spillIntensity}
              onChange={(e) =>
                onSetAppearance({ spillIntensity: Number(e.target.value) })
              }
            />
          </div>
        )}

        <label className="settings-modal__toggle-row">
          <span>Gradient backgrounds</span>
          <input
            type="checkbox"
            checked={appearanceSettings.gradientEnabled}
            onChange={(e) => onSetAppearance({ gradientEnabled: e.target.checked })}
          />
        </label>
        <p className="settings-modal__note settings-modal__note--top">
          A subtle gradient across panels and backgrounds instead of a flat
          color, derived from your current theme.
        </p>
        {appearanceSettings.gradientEnabled && (
          <>
            <div className="settings-modal__slider-row">
              <span className="settings-modal__slider-label">Intensity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={appearanceSettings.gradientIntensity}
                onChange={(e) =>
                  onSetAppearance({ gradientIntensity: Number(e.target.value) })
                }
              />
            </div>
            <div className="settings-modal__radio-row">
              <label>
                <input
                  type="radio"
                  name="gradient-mode"
                  checked={appearanceSettings.gradientMode === "auto"}
                  onChange={() => onSetAppearance({ gradientMode: "auto" })}
                />
                Auto angle
              </label>
              <label>
                <input
                  type="radio"
                  name="gradient-mode"
                  checked={appearanceSettings.gradientMode === "manual"}
                  onChange={() => onSetAppearance({ gradientMode: "manual" })}
                />
                Manual angle
              </label>
            </div>
            {appearanceSettings.gradientMode === "manual" && (
              <div className="settings-modal__slider-row">
                <span className="settings-modal__slider-label">Angle</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={appearanceSettings.gradientAngle}
                  onChange={(e) =>
                    onSetAppearance({ gradientAngle: Number(e.target.value) })
                  }
                />
              </div>
            )}
          </>
        )}

        <div className="settings-modal__actions">
          <button className="settings-modal__cancel" style={{ width: "100%" }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
