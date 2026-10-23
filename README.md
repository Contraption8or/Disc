# Disc Lite

A stripped-down, black-and-white version of [Disc](../disc): just your music
folders, waveform rows, and drag-to-Premiere. No themes, panels, tags,
collections, timers, or settings screens.

Runs side by side with regular Disc — separate app name, app ID, saved data,
and dev port (5174 instead of 5173).

## What's in it

- **One fixed-width folder column** on the left (260px, never resizes with the
  window): *All Music*, *Favorites*, then every folder as a plain name. `+`
  adds folders (multi-select); double-click a name to rename; hover for `×`
  to remove (files on disk are never touched).
- **Track list** with a waveform per row. Click the waveform to seek, **drag
  it out onto Premiere's timeline**, heart to favorite, right-click for
  Rename / Copy Path / Reveal in Explorer / Delete (to the Recycle Bin).
- **Play / Shuffle** over whatever's shown, with a bottom bar (prev, play,
  next, shuffle, volume). Shuffle reshuffles and keeps going at the end.
- **Search** across all music. Drop audio files onto a folder's view (or use
  *Import*) to copy them into that folder.
- Keys: `Space` play/pause · `←`/`→` seek 5s · `↑`/`↓` volume · `S` shuffle ·
  `Ctrl+F` or `/` search.
- Pin on top, and the same window snapping as Disc.

## Develop

```
npm install
npm run dev      # Vite on :5174 + Electron
npm run build    # production Vite build
npm run dist     # installer in release/
```

Everything persists in `localStorage` (`lite.folders`, `disc.favorites`,
`disc.volume`, `disc.shuffle`). The architecture is the same as Disc's:
`electron/main.js` (Node, all filesystem/OS access) ↔ `electron/preload.cjs`
(the only bridge) ↔ `src/` (React). State lives in `src/App.jsx` and reaches
components through `src/context/DiscContext.jsx`.
