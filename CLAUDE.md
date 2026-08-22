# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

There is no test suite and no lint script configured in this project —
`npm test` / `npm run lint` don't exist. Verify changes with `npm run
build` (catches syntax/import errors) and manual exercise via `npm run
dev`.

## Architecture: the three process boundaries

- **`electron/main.js`** (Node, ESM) — the only code with filesystem/OS
  access: folder scanning, file watchers, dialogs, drag-out-to-Premiere,
  zip export, mp3 conversion I/O, profile file storage. Talks to the
  renderer exclusively through named `ipcMain.handle`/`ipcMain.on`
  channels (`disc:*`).
- **`electron/preload.cjs`** (CommonJS, sandboxed) — the only bridge
  between the two. Every capability the renderer can reach is explicitly
  listed here via `contextBridge.exposeInMainWorld("disc", {...})`; there
  is no other path from renderer code to Node/OS APIs. Adding a new main
  ↔ renderer capability means touching both this file and `main.js`.
- **`src/`** (React renderer, browser-sandboxed) — calls `window.disc.*`
  for anything privileged, otherwise a normal Vite/React app.

## Architecture: state flow

`src/App.jsx` (~2100 lines) owns essentially all top-level app state —
folders, tracks, playback, tags, layout, settings, etc. — and passes it
into `src/context/DiscContext.jsx`, which is how that live state reaches
components rendered inside dockview panels (panels are dockview's own
tree, not a normal React child tree, so context is how state crosses that
boundary). When tracing "where does this piece of state live," start in
`App.jsx`.

Persistence is flat `localStorage`, one key per concern (tags, notes,
theme, layout, shortcuts, etc.), each concern with its own
`*Storage.js` module (e.g. `src/tags/tagStorage.js`,
`src/notes/noteStorage.js`) that reads/writes just that key. Profiles
(`src/profiles/profileData.js`) work by iterating a fixed list of these
keys — a new persisted feature needs a new key added to
`PROFILE_KEYS` there, or it silently won't travel with exported profiles.

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
