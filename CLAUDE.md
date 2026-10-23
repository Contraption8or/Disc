# CLAUDE.md

Disc Lite: a deliberately minimal fork of Disc (Electron + Vite + React). Read
`README.md` for what's in it. Keep it simple — resist adding panels, themes,
settings, or other features; that's what regular Disc is for.

## Commands
- `npm run dev` — Vite (port 5174) + Electron
- `npm run build` — production Vite build (the check to run after changes)
- `npm run dist` — packaged installer in `release/`
There is no test suite or lint script.

## Structure
- `electron/main.js` (Node, ESM) — all filesystem/OS access, the frameless
  window + snap system, `disc-media://` audio streaming. Talks to the renderer
  only through `disc:*` IPC channels.
- `electron/preload.cjs` (must stay CommonJS) — the only renderer ↔ main
  bridge; every capability is listed there.
- `src/App.jsx` — owns all state (folders, tracks, favorites, playback/queue)
  and passes it down via `DiscContext`.
- The color palette is a fixed black-and-white token set in `src/index.css`.
