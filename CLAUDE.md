# Disc

Local audio/video library manager for video editors, built as an Electron
+ Vite + React desktop app. Core feature: drag a track's waveform straight
into Premiere Pro's timeline via Electron's native drag API.

**Read `README.md` first** — it documents the architecture, every feature,
and a number of non-obvious design decisions (why certain libraries were
chosen over others, known packaging gotchas, race conditions that were
found and fixed, etc). This file is just quick orientation for getting a
session started; the README is the real source of truth for *why* things
are built the way they are.

## Stack

- Electron (main process: ESM) + Vite + React 18
- `dockview` for the dockable panel layout
- Preload script (`electron/preload.cjs`) must stay CommonJS — this is a
  hard Electron constraint, not a style choice
- All persistence is `localStorage` in the renderer (no database) — see
  `src/profiles/profileData.js` for the full list of keys Disc persists

## Commands

- `npm install` — first-time setup (also needed after pulling changes
  that touch `package.json`)
- `npm run dev` — starts Vite + Electron together for development
- `npm run build` — production Vite build
- `npm run dist` — full packaged build via electron-builder (writes to
  `release/`, gitignored)

## Working in this repo

- `electron/main.js` and `electron/preload.cjs` are Node/Electron code,
  not bundled by Vite — they run directly under Node's own module system
- `src/` is the React renderer, standard Vite conventions
- After any non-trivial change, a quick sanity pass (syntax check on
  touched `.js`/`.jsx` files, or `npm run build`) is worth doing before
  considering a change finished — this project has a history of subtle
  bugs (stale closures, race conditions between overlapping async calls,
  drag-and-drop systems conflicting with each other) that were only
  caught by deliberate review, not by the code merely running without an
  immediate crash
