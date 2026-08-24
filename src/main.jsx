import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PomodoroPopup from "./components/PomodoroPopup.jsx";
import "./index.css";

// The floating Pomodoro widget (electron/main.js's createPomodoroWindow)
// loads this exact same bundle with ?pomodoroWindow=1 in the URL, rather
// than being a separate entry point — this is the one place that decides
// which tree actually mounts.
const isPomodoroWindow = new URLSearchParams(window.location.search).has(
  "pomodoroWindow"
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPomodoroWindow ? <PomodoroPopup /> : <App />}
  </React.StrictMode>
);
