import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
  DEFAULT_POMODORO_SETTINGS,
} from "../pomodoro/pomodoroStorage.js";

const PomodoroContext = createContext(null);

// Lets the floating Pomodoro window (see PomodoroPopup.jsx) stay in sync
// with the real timer, which only ever runs here — that popup is a pure
// remote display/control, never a second independent ticking timer, so
// there's nothing to reconcile between two clocks drifting apart.
export const POMODORO_CHANNEL_NAME = "disc-pomodoro-sync";

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoro must be used within PomodoroProvider");
  return ctx;
}

function phaseDurationSeconds(phase, settings) {
  if (phase === "work") return settings.workMinutes * 60;
  if (phase === "longBreak") return settings.longBreakMinutes * 60;
  return settings.shortBreakMinutes * 60;
}

export function PomodoroProvider({ children }) {
  const [settings, setSettings] = useState(loadPomodoroSettings);
  const [phase, setPhase] = useState("work");
  const [secondsLeft, setSecondsLeft] = useState(() =>
    phaseDurationSeconds("work", loadPomodoroSettings())
  );
  const [isRunning, setIsRunning] = useState(false);
  const [completedWorkSessions, setCompletedWorkSessions] = useState(0);
  const audioCtxRef = useRef(null);

  // Kept in sync every render so advancePhase (below) always has the
  // latest values without needing them in its own dependency array —
  // same pattern already used elsewhere in this app (e.g. allTracksRef)
  // to avoid stale-closure bugs in a callback that's recreated less often
  // than the values it needs.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const completedRef = useRef(completedWorkSessions);
  completedRef.current = completedWorkSessions;

  useEffect(() => {
    savePomodoroSettings(settings);
  }, [settings]);

  const playChime = useCallback(() => {
    if (!settings.soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      // Two short beeps, second a step up — enough to notice, not jarring.
      [660, 880].forEach((freq, i) => {
        const start = ctx.currentTime + i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.start(start);
        osc.stop(start + 0.32);
      });
    } catch {
      // Audio not available in this environment — a missed chime isn't
      // worth failing anything else over.
    }
  }, [settings.soundEnabled]);

  // Moves to whatever phase comes next: work -> short break (or long break,
  // every Nth session) -> work -> ... Reads current phase/session count via
  // the refs above rather than the state values directly, so this doesn't
  // need to be recreated (and doesn't risk being stale) on every tick.
  const advancePhase = useCallback(() => {
    const prevPhase = phaseRef.current;
    let nextPhase;
    let nextCompleted = completedRef.current;
    if (prevPhase === "work") {
      nextCompleted = completedRef.current + 1;
      nextPhase = nextCompleted % settings.longBreakInterval === 0 ? "longBreak" : "shortBreak";
    } else {
      nextPhase = "work";
    }
    setPhase(nextPhase);
    setCompletedWorkSessions(nextCompleted);
    setSecondsLeft(phaseDurationSeconds(nextPhase, settings));
    playChime();
  }, [settings, playChime]);

  // The actual ticking — only runs while isRunning. Tears down and
  // restarts if settings change mid-run (via advancePhase's identity
  // changing), which at most costs a fraction of a second of drift —
  // an acceptable trade for always using current settings.
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          advancePhase();
          return 0; // advancePhase's own setSecondsLeft call takes over right after
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, advancePhase]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const toggle = useCallback(() => setIsRunning((v) => !v), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setSecondsLeft(phaseDurationSeconds(phaseRef.current, settings));
  }, [settings]);

  const skip = useCallback(() => {
    advancePhase();
  }, [advancePhase]);

  const resetStats = useCallback(() => {
    setCompletedWorkSessions(0);
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings({ ...DEFAULT_POMODORO_SETTINGS });
  }, []);

  // Kept current every render so the message handler below (set up once,
  // in a mount-only effect) always calls the latest versions of these —
  // same stale-closure-avoidance pattern as phaseRef/completedRef above,
  // just for functions instead of raw values.
  const actionsRef = useRef({ start, pause, toggle, reset, skip, updateSettings, resetToDefaults });
  actionsRef.current = { start, pause, toggle, reset, skip, updateSettings, resetToDefaults };
  const stateRef = useRef(null);
  stateRef.current = { phase, secondsLeft, isRunning, completedWorkSessions, settings };

  function broadcastState(channel) {
    channel.postMessage({ type: "state", ...stateRef.current });
  }

  // The actual cross-window sync: broadcast this window's state on every
  // change (the popup has no ticking timer of its own, so it only ever
  // knows what it's told), reply immediately if the popup asks for a
  // snapshot (it does this on mount, so opening the popup after the timer
  // was already running doesn't mean waiting up to a second for the next
  // natural tick), and act on any command the popup sends back — its
  // buttons don't run start/pause/etc locally, they broadcast a command
  // and wait for the resulting state broadcast, same as if you'd clicked
  // the button here.
  const channelRef = useRef(null);
  useEffect(() => {
    const channel = new BroadcastChannel(POMODORO_CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === "request-state") {
        broadcastState(channel);
        return;
      }
      if (msg?.type !== "command") return;
      const action = actionsRef.current[msg.action];
      if (typeof action === "function") action(msg.payload);
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (channelRef.current) broadcastState(channelRef.current);
  }, [phase, secondsLeft, isRunning, completedWorkSessions, settings]);

  const value = {
    settings,
    phase,
    secondsLeft,
    isRunning,
    completedWorkSessions,
    start,
    pause,
    toggle,
    reset,
    skip,
    resetStats,
    updateSettings,
    resetToDefaults,
  };

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}
