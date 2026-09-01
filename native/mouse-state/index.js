// Graceful degrade: if this hasn't been compiled (wrong platform, missing
// build tools, or it simply failed to build), every caller gets `null`
// back and falls back to the timer-based drag-end heuristic — real-time
// mouse-button state is a nice-to-have layered on top of an already
// working (if slightly less precise) system, never a requirement.
let binding = null;
try {
  binding = require("./build/Release/mouse_state.node");
} catch {
  binding = null;
}

module.exports = binding;
