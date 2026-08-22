import { useState } from "react";
import { usePomodoro } from "../context/PomodoroContext.jsx";
import Icon from "./Icon.jsx";
import "./PomodoroPanel.css";

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

export default function PomodoroPanel() {
  const {
    settings,
    phase,
    secondsLeft,
    isRunning,
    completedWorkSessions,
    toggle,
    reset,
    skip,
    resetStats,
    updateSettings,
    resetToDefaults,
  } = usePomodoro();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const totalSeconds =
    phase === "work"
      ? settings.workMinutes * 60
      : phase === "longBreak"
      ? settings.longBreakMinutes * 60
      : settings.shortBreakMinutes * 60;
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
  const sessionInCycle = completedWorkSessions % settings.longBreakInterval;

  return (
    <div className="pomodoro-panel">
      <div className="pomodoro-panel__header">
        <span className={`pomodoro-panel__phase pomodoro-panel__phase--${phase}`}>
          {PHASE_LABELS[phase]}
        </span>
        <button
          className="pomodoro-panel__gear"
          title="Timer settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Icon name="gear" size={13} />
        </button>
      </div>

      {!settingsOpen ? (
        <>
          <div className="pomodoro-panel__ring-wrap">
            <svg className="pomodoro-panel__ring" viewBox="0 0 120 120">
              <circle className="pomodoro-panel__ring-track" cx="60" cy="60" r="52" />
              <circle
                className="pomodoro-panel__ring-progress"
                cx="60"
                cy="60"
                r="52"
                style={{
                  strokeDasharray: 2 * Math.PI * 52,
                  strokeDashoffset: 2 * Math.PI * 52 * (1 - progress),
                }}
              />
            </svg>
            <div className="pomodoro-panel__time">{formatTime(secondsLeft)}</div>
          </div>

          <div className="pomodoro-panel__dots">
            {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
              <span
                key={i}
                className={
                  "pomodoro-panel__dot" +
                  (i < sessionInCycle || (phase !== "work" && i === sessionInCycle)
                    ? " pomodoro-panel__dot--filled"
                    : "")
                }
              />
            ))}
          </div>

          <div className="pomodoro-panel__controls">
            <button className="pomodoro-panel__secondary" title="Reset this phase" onClick={reset}>
              <Icon name="undo" size={14} />
            </button>
            <button className="pomodoro-panel__primary" onClick={toggle}>
              <Icon name={isRunning ? "pause" : "play"} size={13} style={{ marginRight: 5 }} />
              {isRunning ? "Pause" : "Start"}
            </button>
            <button className="pomodoro-panel__secondary" title="Skip to next phase" onClick={skip}>
              <Icon name="skipForward" size={14} />
            </button>
          </div>

          <p className="pomodoro-panel__stat">
            {completedWorkSessions} work session{completedWorkSessions === 1 ? "" : "s"} completed
            {completedWorkSessions > 0 && (
              <button className="pomodoro-panel__stat-reset" onClick={resetStats}>
                reset
              </button>
            )}
          </p>
        </>
      ) : (
        <div className="pomodoro-panel__settings">
          <label className="pomodoro-panel__setting-row">
            <span>Work (min)</span>
            <input
              type="number"
              min="1"
              max="180"
              value={settings.workMinutes}
              onChange={(e) => updateSettings({ workMinutes: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="pomodoro-panel__setting-row">
            <span>Short break (min)</span>
            <input
              type="number"
              min="1"
              max="60"
              value={settings.shortBreakMinutes}
              onChange={(e) =>
                updateSettings({ shortBreakMinutes: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="pomodoro-panel__setting-row">
            <span>Long break (min)</span>
            <input
              type="number"
              min="1"
              max="90"
              value={settings.longBreakMinutes}
              onChange={(e) =>
                updateSettings({ longBreakMinutes: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="pomodoro-panel__setting-row">
            <span>Sessions until long break</span>
            <input
              type="number"
              min="1"
              max="12"
              value={settings.longBreakInterval}
              onChange={(e) =>
                updateSettings({ longBreakInterval: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="pomodoro-panel__setting-row pomodoro-panel__setting-row--toggle">
            <span>Sound on phase change</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
            />
          </label>

          <div className="pomodoro-panel__settings-actions">
            <button className="pomodoro-panel__secondary" onClick={resetToDefaults}>
              Reset to Defaults
            </button>
            <button className="pomodoro-panel__primary" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
