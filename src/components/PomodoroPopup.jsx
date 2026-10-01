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
  const dragRef = useRef(null);
  const inertiaRafRef = useRef(null);
  // Live vx/vy of the current inertia coast, in px/ms — kept outside
  // startInertia's own closure so the edge-hit listener below can flip a
  // component's sign (bounce) mid-coast instead of only ever being able
  // to read whatever velocity the coast started with.
  const inertiaVelocityRef = useRef({ vx: 0, vy: 0 });

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

  // Custom drag + "toss" momentum for the popup, replacing a plain
  // -webkit-app-region: drag (see PomodoroPopup.css). The OS-level drag
  // region has no way to hand back the gesture's velocity on release,
  // which is the whole point here, so this tracks the pointer itself and
  // moves the window's real OS position via
  // window.disc.movePomodoroWindowBy (see electron/main.js) — there's
  // nothing to move in this window's own DOM, the *window* is what's
  // being thrown.
  //
  // Every move (drag or inertia) is sent as a *relative* delta, never an
  // absolute position: the renderer doesn't need to know the window's
  // real coordinates to start a drag, so there's nothing to fetch (and
  // nothing async to race against a quick pointerdown-then-move) before
  // dragging can begin.
  function cancelInertia() {
    if (inertiaRafRef.current != null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }

  // Fraction of the pointer's actual release speed that the coast starts
  // from — the raw flick speed read directly off the last couple of
  // pointermove samples felt like way more momentum than it looked like
  // the hand gave it, so this knocks it down before anything else runs.
  const LAUNCH_SPEED_SCALE = 0.4;
  // How much speed survives one bounce off a screen edge (see the
  // edge-hit listener below) — some loss every bounce so it settles
  // instead of bouncing forever at full strength.
  const EDGE_RESTITUTION = 0.5;

  function startInertia(vx, vy) {
    // vx/vy are in px/ms. Decay is applied per elapsed real time (not per
    // frame) so the coast feels the same regardless of refresh rate.
    const RETAINED_PER_SECOND = 0.025; // fraction of velocity kept after 1s
    const MIN_SPEED = 0.015; // px/ms — below this it just stops
    inertiaVelocityRef.current = { vx: vx * LAUNCH_SPEED_SCALE, vy: vy * LAUNCH_SPEED_SCALE };
    let lastT = performance.now();
    let carryX = 0;
    let carryY = 0;

    function step(now) {
      const dt = now - lastT;
      lastT = now;
      const decay = Math.pow(RETAINED_PER_SECOND, dt / 1000);
      const v = inertiaVelocityRef.current;
      const nvx = v.vx * decay;
      const nvy = v.vy * decay;
      inertiaVelocityRef.current = { vx: nvx, vy: nvy };
      // Fractional pixels accumulate here rather than getting rounded
      // away every frame, so a slow coast doesn't stall out early just
      // because each individual frame's movement rounds to 0.
      carryX += nvx * dt;
      carryY += nvy * dt;
      const dx = Math.round(carryX);
      const dy = Math.round(carryY);
      carryX -= dx;
      carryY -= dy;
      if (dx || dy) window.disc?.movePomodoroWindowBy(dx, dy);
      if (Math.hypot(nvx, nvy) > MIN_SPEED) {
        inertiaRafRef.current = requestAnimationFrame(step);
      } else {
        inertiaRafRef.current = null;
      }
    }
    inertiaRafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    function onPointerMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.screenX - drag.lastScreenX;
      const dy = e.screenY - drag.lastScreenY;
      drag.lastScreenX = e.screenX;
      drag.lastScreenY = e.screenY;
      if (dx || dy) window.disc?.movePomodoroWindowBy(dx, dy);
      drag.samples.push({ x: e.screenX, y: e.screenY, t: performance.now() });
      if (drag.samples.length > 6) drag.samples.shift();
    }
    function onPointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const samples = drag.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      const reduceMotion =
        document.documentElement.getAttribute("data-reduce-motion") === "on";
      if (!reduceMotion && dt > 0 && samples.length >= 2) {
        const vx = (last.x - first.x) / dt;
        const vy = (last.y - first.y) / dt;
        startInertia(vx, vy);
      }
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    // Bounce off a screen edge — but only while actually coasting
    // (inertiaRafRef set), not while the user is still actively holding
    // and dragging into the edge, where "bouncing" would just mean
    // fighting their own hand.
    const unsubscribeEdgeHit = window.disc?.onPomodoroWindowEdgeHit?.(({ hitX, hitY }) => {
      if (inertiaRafRef.current == null) return;
      const v = inertiaVelocityRef.current;
      inertiaVelocityRef.current = {
        vx: hitX ? -v.vx * EDGE_RESTITUTION : v.vx,
        vy: hitY ? -v.vy * EDGE_RESTITUTION : v.vy,
      };
    });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      unsubscribeEdgeHit?.();
      cancelInertia();
    };
  }, []);

  // Attached to the whole popup rather than just the header, so any bit
  // of empty background (including the ring and the time it's wrapped
  // around) can be grabbed and tossed — only real controls (buttons,
  // inputs, their labels) opt back out, via this same check.
  function handlePopupPointerDown(e) {
    if (e.button !== 0) return; // left-button drag only
    if (e.target.closest("button, input, select, textarea, label")) return;
    cancelInertia();
    dragRef.current = {
      lastScreenX: e.screenX,
      lastScreenY: e.screenY,
      samples: [{ x: e.screenX, y: e.screenY, t: performance.now() }],
    };
  }

  function sendCommand(action, payload) {
    channelRef.current?.postMessage({ type: "command", action, payload });
  }

  async function togglePinned() {
    const result = await window.disc?.togglePomodoroAlwaysOnTop(!pinned);
    setPinned(Boolean(result));
  }

  if (!snapshot) {
    return (
      <div className="pomodoro-popup" onPointerDown={handlePopupPointerDown}>
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
    <div className="pomodoro-popup" onPointerDown={handlePopupPointerDown}>
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
