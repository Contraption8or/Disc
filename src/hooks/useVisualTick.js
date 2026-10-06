import { useEffect, useRef } from "react";

// How often visual-only updates (the playback progress bars) run while
// Disc isn't the window being looked at — 4/second is still a live-looking
// bar for anyone glancing at it on a second monitor, but ~15x less
// style/layout/paint work than a 60fps loop.
const BACKGROUND_TICK_MS = 250;

function isWindowActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

const listeners = new Set();
let listening = false;

function notify() {
  listeners.forEach((fn) => fn());
}

function subscribeWindowActive(fn) {
  listeners.add(fn);
  if (!listening) {
    listening = true;
    window.addEventListener("focus", notify);
    window.addEventListener("blur", notify);
    document.addEventListener("visibilitychange", notify);
  }
  return () => listeners.delete(fn);
}

// Runs `tick` every animation frame while `enabled` and the window is
// focused, and at BACKGROUND_TICK_MS while it isn't. The main window is
// created with backgroundThrottling: false (so the Pomodoro timer keeps
// ticking on schedule while Disc is buried under other apps — see
// electron/main.js), which also means Chromium never throttles a plain
// requestAnimationFrame loop there: a bar redrawing at 60fps behind
// Premiere cost the same as when Disc was front and center, which showed up
// as system-wide lag. Audio playback doesn't go through any of this, so
// shuffle/queue advance are unaffected.
export function useVisualTick(tick, enabled) {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    let timer = 0;

    function stop() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    }

    function start() {
      stop();
      if (isWindowActive()) {
        const loop = () => {
          tickRef.current();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } else {
        tickRef.current();
        timer = setInterval(() => tickRef.current(), BACKGROUND_TICK_MS);
      }
    }

    start();
    const unsubscribe = subscribeWindowActive(start);
    return () => {
      unsubscribe();
      stop();
    };
  }, [enabled]);
}
