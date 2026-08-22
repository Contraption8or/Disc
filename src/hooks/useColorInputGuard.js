import { useRef } from "react";

// The native <input type="color"> popup's eyedropper lets you sample a
// color from anywhere on screen — including outside the app entirely.
// That interaction causes the window to lose and regain focus in ways
// that can look, to a simple "mousedown outside my popup" listener,
// exactly like the user clicking away to dismiss it. This hook tracks
// "is a color input in active use" (plus a short grace period after blur,
// since the stray focus events land shortly after the picker closes) so
// callers can skip their close-on-outside-click logic during that window.
export function useColorInputGuard() {
  const activeRef = useRef(false);
  const timeoutRef = useRef(null);

  function handleFocus() {
    activeRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleBlur() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      activeRef.current = false;
    }, 400);
  }

  return { activeRef, colorInputProps: { onFocus: handleFocus, onBlur: handleBlur } };
}
