import { useEffect, useRef, useState } from "react";
import { POMODORO_CHANNEL_NAME } from "../context/PomodoroContext.jsx";
import { loadCustomThemes } from "../themes/customThemes.js";
import { applyCustomThemeVars, clearCustomThemeVars } from "../themes/customThemeEngine.js";
import Icon from "./Icon.jsx";
import "./PomodoroPopup.css";

const THEME_STORAGE_KEY = "disc.theme";

const PHASE_LABELS = {
  work: "Work",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function applyStoredTheme() {
  const id = localStorage.getItem(THEME_STORAGE_KEY) || "premiere-dark";
  const custom = loadCustomThemes().find((t) => t.id === id);
  clearCustomThemeVars();
  if (custom) {
    document.documentElement.setAttribute("data-theme", "custom");
    applyCustomThemeVars(custom.base);
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
}

// Standalone window content (see electron/main.js's createPomodoroWindow
// and src/main.jsx) — a synced remote display/control for the real timer,
// which keeps running in the main window's PomodoroProvider regardless of
// whether this popup is even open. This component never runs its own
// countdown; it only ever shows whatever the last "state" broadcast said
// and sends "command" messages for its buttons, exactly like a physical
// remote control.
export default function PomodoroPopup() {
  const [snapshot, setSnapshot] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const channelRef = useRef(null);

  useEffect(() => {
    applyStoredTheme();
    // The theme can change in the main window while this popup stays
    // open — "storage" fires in other same-origin windows (never the one
    // that made the change), which is exactly the free cross-window
    // signal needed here.
    function handleStorage(e) {
      if (e.key === THEME_STORAGE_KEY || e.key === null) applyStoredTheme();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(POMODORO_CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (e) => {
      if (e.data?.type === "state") setSnapshot(e.data);
    };
    channel.postMessage({ type: "request-state" });
    return () => channel.close();
  }, []);

  function sendCommand(action, payload) {
    channelRef.current?.postMessage({ type: "command", action, payload });
  }

  async function togglePinned() {
    const result = await window.disc?.togglePomodoroAlwaysOnTop(!pinned);
    setPinned(Boolean(result));
  }

  if (!snapshot) {
    return (
      <div className="pomodoro-popup">
        <div className="pomodoro-popup__header">
          <span className="pomodoro-popup__title">Disc — Pomodoro</span>
        </div>
        <p className="pomodoro-popup__waiting">Waiting for Disc's timer…</p>
      </div>
    );
  }

  const { phase, secondsLeft, isRunning, settings } = snapshot;
  const totalSeconds =
    phase === "work"
      ? settings.workMinutes * 60
      : phase === "longBreak"
      ? settings.longBreakMinutes * 60
      : settings.shortBreakMinutes * 60;
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;

  return (
    <div className="pomodoro-popup">
      <div className="pomodoro-popup__header">
        <span className={`pomodoro-popup__phase pomodoro-popup__phase--${phase}`}>
          {PHASE_LABELS[phase]}
        </span>
        <button
          className={"pomodoro-popup__pin" + (pinned ? " pomodoro-popup__pin--active" : "")}
          title={pinned ? "Unpin from top" : "Keep this on top of other windows"}
          onClick={togglePinned}
        >
          <Icon name={pinned ? "lockClosed" : "lockOpen"} size={12} />
        </button>
        <button
          className={
            "pomodoro-popup__pin" + (settingsOpen ? " pomodoro-popup__pin--active" : "")
          }
          title="Timer settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Icon name="gear" size={12} />
        </button>
        <button
          className="pomodoro-popup__close"
          title="Close this window"
          onClick={() => window.disc?.closePomodoroWindow()}
        >
          ×
        </button>
      </div>

      {settingsOpen ? (
        <div className="pomodoro-popup__settings">
          <label className="pomodoro-popup__setting-row">
            <span>Work (min)</span>
            <input
              type="number"
              min="1"
              max="180"
              value={settings.workMinutes}
              onChange={(e) =>
                sendCommand("updateSettings", { workMinutes: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="pomodoro-popup__setting-row">
            <span>Short break (min)</span>
            <input
              type="number"
              min="1"
              max="60"
              value={settings.shortBreakMinutes}
              onChange={(e) =>
                sendCommand("updateSettings", {
                  shortBreakMinutes: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="pomodoro-popup__setting-row">
            <span>Long break (min)</span>
            <input
              type="number"
              min="1"
              max="90"
              value={settings.longBreakMinutes}
              onChange={(e) =>
                sendCommand("updateSettings", {
                  longBreakMinutes: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="pomodoro-popup__setting-row">
            <span>Sessions/long break</span>
            <input
              type="number"
              min="1"
              max="12"
              value={settings.longBreakInterval}
              onChange={(e) =>
                sendCommand("updateSettings", {
                  longBreakInterval: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="pomodoro-popup__setting-row pomodoro-popup__setting-row--toggle">
            <span>Sound on phase change</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) =>
                sendCommand("updateSettings", { soundEnabled: e.target.checked })
              }
            />
          </label>
          <div className="pomodoro-popup__settings-actions">
            <button
              className="pomodoro-popup__secondary"
              title="Reset to defaults"
              onClick={() => sendCommand("resetToDefaults")}
            >
              <Icon name="undo" size={13} />
            </button>
            <button className="pomodoro-popup__primary" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pomodoro-popup__ring-wrap">
            <svg className="pomodoro-popup__ring" viewBox="0 0 120 120">
              <circle className="pomodoro-popup__ring-track" cx="60" cy="60" r="52" />
              <circle
                className="pomodoro-popup__ring-progress"
                cx="60"
                cy="60"
                r="52"
                style={{
                  strokeDasharray: 2 * Math.PI * 52,
                  strokeDashoffset: 2 * Math.PI * 52 * (1 - progress),
                }}
              />
            </svg>
            <div className="pomodoro-popup__time">{formatTime(secondsLeft)}</div>
          </div>

          <div className="pomodoro-popup__controls">
            <button
              className="pomodoro-popup__secondary"
              title="Reset this phase"
              onClick={() => sendCommand("reset")}
            >
              <Icon name="undo" size={13} />
            </button>
            <button className="pomodoro-popup__primary" onClick={() => sendCommand("toggle")}>
              <Icon name={isRunning ? "pause" : "play"} size={12} style={{ marginRight: 5 }} />
              {isRunning ? "Pause" : "Start"}
            </button>
            <button
              className="pomodoro-popup__secondary"
              title="Skip to next phase"
              onClick={() => sendCommand("skip")}
            >
              <Icon name="skipForward" size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
