# Handoff — Disc / Merging Ted's fork into upstream (v6)

**Version 6 — 2026-09-27.** Written for picking this up cold in Claude Code,
run from Ted's local clone of the fork.

**Previous versions:** this file continues `docs/HANDOFF.md` from Ted's fork
([github.com/Guitarnerd/Disc](https://github.com/Guitarnerd/Disc)). That file
was never numbered, so versions are counted from its git history:

| Version | Fork commit | Date | What changed |
|---|---|---|---|
| v1 | `a5644ed` | 2026-08-24 | Created — crash detection, onboarding status |
| v2 | `51ef7cf` | 2026-08-24 | Onboarding complete, maintenance mode |
| v3 | `63bc430` | 2026-08-26 | OOM crash diagnosed, Repair Track added |
| v4 | `ca0c6d7` | 2026-09-09 | Launcher/taskbar saga |
| v5 | `f427cdc` | 2026-09-09 | Pinned taskbar icon deferred as known limitation |
| **v6** | *(this file)* | 2026-09-27 | **New project: port selected fork work into upstream** |

v5 is still the reference for *how the fork works*: the Studio Sync
incident, known gotchas, and the Electron install workaround. Read it
alongside this one. This file covers the *merge project* only. When this file
is committed, it becomes `docs/HANDOFF.md` on the merge branch; see Phase 0.

---

## 1. The situation in one paragraph

Disc started as Micah's (GitHub: **Contraption8or**) app. Ted forked it on
2026-08-24 to build Studio Sync for himself and Peter. Since then Micah has
kept improving the original: a big design pass, a new Tag Manager, an Image
panel, a Default profile, and tag suggestions. He also **removed BPM/Key/Vibe
detection entirely**. The goal now is for Ted's important work to end up in
Micah's version, so there is one app going forward. The work happens on a
branch **built on Micah's latest code**, pushed to Ted's fork, then opened as
a pull request into Micah's repo for him to review.

## 2. Repos and where things stand

- **Upstream (Micah's):** `https://github.com/Contraption8or/Disc` — branch
  `main`, at `1eff7b7` (2026-09-26, "Design pass, Image panel, Default
  profile, tag suggestions; remove BPM/Key/Vibe"), version 1.8.0.
- **Fork (Ted's):** `https://github.com/Guitarnerd/Disc` — branch `main`, at
  `f427cdc`.
- **Split point:** `d75669d` (2026-08-24, "Add Windows Snap support for
  non-acrylic themes").
- **Since the split:** 15 commits on the fork, 6 on upstream.
- **Ted's local clone:** v5 recorded it at
  `C:\Users\The Basement\Documents\Disc Music App`. Ted describes it as being
  in his GitHub folder, so **confirm the actual path first.** It is the folder
  whose `git remote -v` shows `origin` → `Guitarnerd/Disc`.
  - **This folder is the live daily app.** The Desktop shortcut runs
    `launch-disc.vbs` → `npm run dev` from here. Peter's machine runs the same
    fork and pulls updates from it. Keep its `main` branch untouched
    throughout (see §4).

## 3. Scope — decided by Ted

**Port these (and only these):**

1. **Crash protection** — anything that fixed or diagnosed crashes that
   Micah's version does not already handle. His version has **no**
   renderer-crash logging, no large-file memory guard, and no mp3 repair.
   (Checked 2026-09-27 by grepping upstream for `render-process-gone`, crash
   logs, size limits, and repair code.)
2. **Repair Track** (mp3 header check + in-place re-encode).
3. **Studio Sync** — Ted and Peter use it daily. This is the bulk of the
   work.

**Do NOT port:**

| Fork commit(s) | What | Why dropped |
|---|---|---|
| `3e22d1c` (Tag Manager part) | Ted's Tag Manager + batch-tag search | Micah built his own (`83ed3ae`), which is newer and does more: View filter, undo delete, "did you mean" suggestions. Keep his. |
| `444801c` | In-app git "Fork Updates" checker | Out of scope per Ted |
| `c9d3449` | Clear search on folder/Collection switch | Out of scope; Micah rewrote `LibraryPanel.jsx` |
| `7d98792`, `66d682c`, `ba7220a`, `62b84ad` | Desktop shortcut / taskbar icon / window-title fixes | Out of scope per Ted — **but see §8, decision D1** |
| `f5c9a5f`, `5a9142a` | No auto-DevTools; `--kill-others` dev-server fix | Out of scope per Ted — **but see §8, decision D1** |
| `51ef7cf`, `63bc430`, `ca0c6d7`, `f427cdc` | Handoff doc updates | Superseded by this file |

## 4. Phase 0 — Setup (do this first, carefully)

**Never switch the daily-app folder off `main`.** Do the work in a separate
**git worktree**, so the Desktop shortcut keeps running the known-good fork
the whole time.

```powershell
cd "<Ted's local clone>"           # confirm path first — see §2
git status                         # must be clean; if not, STOP and ask Ted
git fetch origin
git log --oneline origin/main..main   # unpushed local commits? if any, STOP and ask Ted
git remote add upstream https://github.com/Contraption8or/Disc.git
git fetch upstream
git worktree add "..\Disc-merge" -b merge/fork-into-upstream upstream/main
cd "..\Disc-merge"
npm install                        # native module native/mouse-state builds here
```

- If `npm install` fails on Electron, use the workaround in v5 "Known
  gotchas".
- Then copy this file into the worktree as `docs/HANDOFF.md`, and commit it
  as the first commit on the branch. Upstream has no `docs/` folder yet.

### Data isolation — required before the first `npm run dev` in the worktree

A dev run from the worktree uses the **same** `%APPDATA%\Disc` folder as the
daily app. That folder holds the same localStorage (both load from
`http://localhost:5173`) and **the same `device-identity.json`**. An untested
branch run against it could:

- write Studio Sync events into the **real shared music folder** under Ted's
  real device ID;
- Resilio would then carry those events to Peter's machine.

To prevent that:

1. Add a small dev-only override at the very top of `electron/main.js`,
   before any `app.getPath("userData")` call:
   `if (process.env.DISC_USER_DATA) app.setPath("userData", process.env.DISC_USER_DATA);`
   Commit it; it's useful to Micah too.
2. Always launch test runs with it set:
   `$env:DISC_USER_DATA="D:\disc-test\userdata"; npm run dev`
   Per Ted's setup notes, D: and E: have plenty of space, so don't put test
   data on C:.
3. For all sync testing, point the test run at a **copy** of the music folder,
   e.g. `D:\disc-test\music`, including a copy of its `.disc-sync\` folder.
   Never point it at the live shared folder until Phase 4 sign-off.
4. Close the daily app before a test run. Both use port 5173.

## 5. Phase 1 — Crash protection (small)

Port from the fork's code (`git show <commit>`); don't cherry-pick. Every
fork commit conflicts against upstream now.

- **From `a5644ed` — renderer crash detection:**
  - The `render-process-gone` handler in `electron/main.js`.
  - The persistent `crash-log.jsonl` in userData.
  - The native Reload/Close dialog. It must not depend on the dead renderer:
    Disc's frameless title bar dies with it, which is why this exists.
  - Plus the IPC for Open DevTools / Show Crash Log, and the matching
    `electron/preload.cjs` entries.
- **Troubleshooting UI:** re-home "Open DevTools" and "Show Crash Log" into
  Micah's current `SettingsModal.jsx`. He cut about 100 lines from it, so
  read its current structure first and match his design pass styling.
- **Coexists with Micah's `ErrorBoundary.jsx`.** They cover different
  failures:
  - His catches React render errors inside a living page.
  - Ted's catches the whole renderer process dying, e.g. `oom`.
  - Keep both. Optional, ask Micah: have `ErrorBoundary` also append to the
    crash log.
- **From `c7b6c64` — the OOM fix:**
  - `MAX_ANALYZABLE_SIZE_BYTES` (50MB) in `src/audio/waveform.js`: skip
    decode for anything larger. The file stays playable, it just gets no
    waveform.
  - The `src/audio/duplicates.js` guard: check that a cache entry has usable
    peaks, not just that it exists.
  - **Skip the `src/audio/analysis.js` half.** Micah deleted that file along
    with BPM/Key.
  - Confirm the size guard sits at the choke point that
    `src/audio/preload.js` actually uses in upstream.
  - Background: v3/v5 describe the root cause. Library files run up to 285MB,
    and full-resolution PCM decoding of a few at once exhausts memory.
- **Verify:** `npm run build` passes. With the test userData, launch, load a
  test folder containing a file over 50MB, and confirm no waveform, normal
  playback, and no crash.
- Commit.

## 6. Phase 2 — Repair Track (medium)

From `c7b6c64`:

- **Electron side — ports nearly as-is:**
  - Header-byte detection: ID3/MPEG sync vs `ftyp`/`OggS`/`fLaC`/`RIFF`.
  - Backup of the original.
  - In-place re-encode through the **same pipeline the Convert feature
    uses**. Confirm those function names still match in upstream `main.js`;
    Micah only changed Convert's modal closing behavior.
  - Preload entries.
- **Renderer side — needs rebuilding against Micah's redesign:**
  - The handler in `App.jsx` (~105 lines in the fork).
  - The `TrackContextMenu.jsx` item.
  - The `TrackRow.jsx` indicator. Micah restyled `TrackRow.css`.
  - The `DetailsPanel.jsx` bit. Micah cut about 134 lines there, mostly the
    BPM/Key UI; drop anything that referenced those.
- **Sync safety — already fine:** Repair keeps the same file path, and Studio
  Sync's track identity (`src/sync/trackKey.js`) is purely path-based. Tags,
  notes, and collections survive on both machines. Resilio carries the
  repaired file to Peter.
- **Verify:**
  - Build.
  - In the test folder, copy an AAC file renamed to `.mp3`; Repair should
    detect it, back it up, and re-encode it.
  - Its tags should survive the repair.
  - It should drag into DaVinci Resolve. That drag was the original bug.
- Commit.

## 7. Phase 3 — Studio Sync (the big one)

Read the fork's `docs/collab-sync-scope.md` in full before starting,
especially the event schema, the merge algorithm, and §7.5 (the data-wipe
incident and the backfill fix).

**Copies over unchanged:**

- `src/sync/eventLog.js`, `mergeEvents.js`, `trackKey.js`, `folderPath.js`.
- `docs/collab-sync-scope.md`.
- Check that `src/utils/paths.js` (`isUnderDirectory`) exists upstream with
  the same export.

**Electron side:**

- From `3e22d1c`: the sync IPC in `main.js` (`disc:read-sync-state`, append
  events, `device-identity.json` in userData) and the `preload.cjs` entries
  `appendSyncEvents` and `readSyncState`.
- Leave out the Tag Manager parts of that commit.

**`src/App.jsx` — the hard part.** Upstream is 2,480 lines, the fork 2,731, and
Micah has reworked it heavily. Port in this order:

1. Imports; device identity; `trackKeyFor`; `folderRelativePathFor`;
   `logEvent`. These are fork lines ~329–386.
2. The read/merge path: `studioSyncEnabled`, `syncStatus`, `runMerge`, the
   folder-watcher hookup. Fork ~387–594.
3. **`backfillLocalStateIfNeeded`** — mandatory. It prevents the
   §7.5 data wipe. Remove the `override.set` backfill lines, since BPM/Key no
   longer exists.
4. Re-add each `logEvent(...)` call at the matching mutation in Micah's code.
   The fork logs:
   - collection: create, rename, recolor, delete, addTrack, removeTrack;
   - tag: create, rename, recolor, delete, merge, assign/unassign;
   - `note.set`;
   - folder: create, rename, recolor, delete, link, unlink;
   - folderGroup: create, rename, delete.
   Find each by `grep -n 'logEvent(' ` in the fork's `App.jsx`, then locate
   Micah's equivalent function. Note: tag assign/unassign share one call
   (fork line ~1070, a ternary). It *is* logged; don't "fix" it.
5. The Settings → Studio Sync section in `SettingsModal.jsx`, restyled to
   Micah's design pass.

**New wiring that Micah's features require:**

- **Tag Manager (Micah's version):** his rename, recolor, merge, and delete
  must each emit the matching `tag.*` event. The event types already exist in
  `mergeEvents.js`.
- **Soft delete with 8-second Undo** (tags, and folder groups, which follow
  the same pattern): emit `tag.delete` / `folderGroup.delete` **only when the
  undo window expires**, not on the click. If it emits immediately, an Undo
  on one machine can't reach the other.
- **Tag suggestions / duplicate blocking:** a created tag must still emit
  `tag.create`.
- **Default profile reset** (`resetProfileData` in
  `src/profiles/profileData.js`):
  - It removes only `PROFILE_KEYS`. Studio Sync's own keys stay out of that
    list: `disc.studioSyncEnabled`, `disc.sync.seq`, `disc.sync.backfilled`,
    and any others.
  - Keep them out. Resetting `disc.sync.seq` would break event ordering and
    dedup.
  - After a reset, the music folder is unset, so sync pauses until one is
    chosen; then the merge rebuilds shared data from the logs.
  - Confirm that is acceptable behavior with Ted.
- **Image panel, favorites, layout, themes:** local-only; not synced. Leave
  them that way unless asked.

**BPM/Key leftovers:**

- Existing real logs on both machines contain `override.set` /
  `override.clear` events.
- Make `mergeEvents.js` **ignore them quietly**: keep the cases as no-ops, or
  a default that skips unknown types. They must never throw.
- Don't delete them from the logs.
- Stop emitting them.

**Known gaps carried forward from v5 (don't fix now, just keep them working
the same):**

- Folder reorder and moves into or out of Sections don't sync
  (`handleReorderFolders`).
- Log compaction (Phase 4 of the sync design) is not done.

**Verify:**

- Build.
- Then, against the **test copy** of the music folder with its copied
  `.disc-sync\`, and isolated userData:
  - enable Studio Sync;
  - confirm the backfill runs once;
  - confirm the existing shared tags, collections, and notes appear;
  - confirm new edits append to this test device's `.jsonl`.
- Commit in logical chunks, not one giant commit. Micah has to review this.

## 8. Decisions pending — ask Ted, don't assume

- **D1 — launcher and dev-server fixes left behind.** Micah's `package.json`
  still uses `concurrently --kill-others-on-fail`. In v5 that was identified
  as the likely cause of essentially every "the app won't open / the shortcut
  stopped working" moment on **both** machines: Vite keeps holding port 5173
  after a normal close. Once Ted and Peter run the merged app, that bug comes
  back. So does the `AppActivate("Disc")` title collision in
  `launch-disc.vbs`.
  - **Recommendation:** port `5a9142a` (a one-line change) and the
    window-title fixes (`7d98792`, `ba7220a`) as a small Phase 1b. Fold the
    AppUserModelID fix in too if taskbar icons misbehave.
  - Ted scoped these out, so confirm before doing it.
- **D2 — how Ted and Peter get updates afterward.**
  - Their clones pull from Ted's fork. The in-app "Fork Updates" button is
    not being ported.
  - After Micah merges the PR, decide whether both machines switch `origin`
    to Micah's repo, or Ted keeps his fork's `main` synced to upstream.
  - Either way, updating becomes a manual `git pull` again.
- **D3 — Peter cutover.** Both machines should move to the merged build at
  roughly the same time. Older fork builds can still read new logs, but a
  mismatch period is untested. Before switching either machine:
  - copy the shared `.disc-sync\` folder somewhere safe;
  - export each machine's profile (Profiles menu).

## 9. Phase 4 — Hand to Micah

1. `npm run build` is clean.
2. Ted runs the branch against the test setup and signs off.
3. `git push -u origin merge/fork-into-upstream` (to Ted's fork).
4. Open a PR: `Guitarnerd/Disc:merge/fork-into-upstream` →
   `Contraption8or/Disc:main`. Include a summary per phase, and link
   `docs/collab-sync-scope.md`.
5. After Micah merges, do the D3 cutover on both machines, then remove the
   worktree with `git worktree remove "..\Disc-merge"`.
6. Write v7 of this handoff.

## 10. Useful commands

```powershell
git log --oneline d75669d..upstream/main   # Micah's 6 commits since the split
git log --oneline d75669d..origin/main     # Ted's 15 fork commits
git show <commit> --stat                   # what a fork commit touched
git show origin/main:src/App.jsx > $env:TEMP\fork-App.jsx   # fork's App.jsx for side-by-side reference
```

The project has no tests and no lint. `npm run build` catches syntax and
import errors, and everything else is manual testing via `npm run dev`. The
main process (`electron/`) does **not** hot-reload; restart after any change
there.
