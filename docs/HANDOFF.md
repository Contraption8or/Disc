# Handoff — Disc / Merging Ted's fork into upstream (v7)

**Version 7 — 2026-09-28.** Written for whoever (Micah, or a Claude Code
instance working on Micah's behalf) picks up **pull request
`Guitarnerd/Disc:merge/fork-into-upstream` → `Contraption8or/Disc:main`**.
This version documents what actually shipped and how it was verified — it's
a review guide, not a build plan (v6 was the plan; this is the result).

**Previous versions:**

| Version | Commit | Date | What changed |
|---|---|---|---|
| v1 | `a5644ed` | 2026-08-24 | Created — crash detection, onboarding status |
| v2 | `51ef7cf` | 2026-08-24 | Onboarding complete, maintenance mode |
| v3 | `63bc430` | 2026-08-26 | OOM crash diagnosed, Repair Track added |
| v4 | `ca0c6d7` | 2026-09-09 | Launcher/taskbar saga |
| v5 | `f427cdc` | 2026-09-09 | Pinned taskbar icon deferred as known limitation |
| v6 | `38fab86` | 2026-09-27 | Merge-project plan (this branch's first commit) |
| **v7** | `d47038c` | 2026-09-28 | **This PR's actual contents, deviations from plan, and test results** |

v5 (on Ted's fork, `Guitarnerd/Disc`) is still the reference for the
**Studio Sync design incident** referenced below and the general history of
this feature. v6, still in this branch's git history, is the original task
breakdown — read it if you want the "why this order" reasoning; this file
only covers what's different from that plan and what to check.

---

## 1. What this PR is

Ted forked Disc on 2026-08-24 to build Studio Sync (cross-machine tag/
collection/note/folder collaboration) for himself and a collaborator,
Peter. Since then Micah kept developing the original independently — a
design pass, a new Tag Manager, an Image panel, a Default profile, tag
suggestions — and removed BPM/Key/Vibe detection entirely. This PR ports
the parts of Ted's fork that are still wanted (Studio Sync, crash
protection, Repair Track, and some launcher robustness fixes) onto
Micah's current code, so there's one app going forward instead of two
diverging ones.

**Every commit was built directly against `upstream/main` in a fresh git
worktree** (not cherry-picked or diffed from the fork) — every fork commit
conflicted against Micah's rewritten files, so each piece was re-derived
by reading the fork's version and re-implementing it against Micah's
current component structure. This matters for review: the diff you're
looking at is *new code written to match the fork's behavior*, not a
literal port, so there was room for both mistakes and improvements (see §3
and §4).

## 2. Commits in this PR, in order

```
38fab86  Add merge-project handoff doc (HANDOFF_v6)
6ac9821  Add DISC_USER_DATA dev override for isolated test runs
427f6c4  Port crash protection and OOM fix from Ted's fork (Phase 1)
08fe3ca  Port Repair Track from Ted's fork (Phase 2)
66c11f0  Add Studio Sync's core event/merge modules (Phase 3, part 1)
1aefd5c  Add Studio Sync's Electron IPC: device identity + event log (Phase 3, part 2)
d4e463b  Wire Studio Sync into every mutation handler (Phase 3, part 3)
8ba5d94  Add Settings -> Studio Sync section (Phase 3, part 4)
d47038c  Port launcher/dev-server fixes from Ted's fork (Phase 1b, per D1)
```

Each commit message explains its own reasoning in detail — this file is a
summary and a pointer to what needs the closest look, not a replacement
for reading them.

**Recommended review order:** `66c11f0` → `1aefd5c` → `d4e463b` → `8ba5d94`
(Studio Sync, in dependency order) are the bulk of the real content and the
highest-risk part of this PR. `427f6c4` and `08fe3ca` are smaller and lower
risk. `d47038c` is infrastructure (launcher scripts, dev-server flags,
window identity) and barely touches app logic.

## 3. Deviations from the original plan (v6) — read this before the diff

These are places where the actual implementation differs from a literal
port of the fork's code, either because upstream had changed too much to
port literally, or because a real bug was found along the way. None of
these were Ted's call alone — flagging them here so review isn't
surprised by code that doesn't match what's in `Guitarnerd/Disc`'s history.

- **`override.set`/`override.clear` are now inert no-ops in
  `mergeEvents.js`**, not processed into a `trackOverrides` result. The
  fork's version built out a whole `trackOverrides` map (BPM/Key manual
  overrides) — that concept doesn't exist in this codebase anymore, so the
  cases are kept (not deleted — real logs on both of Ted's machines already
  contain these events) but do nothing. See the comment at the switch
  cases in `src/sync/mergeEvents.js`.

- **Tag delete and folder-group delete both use "emit only after the undo
  window expires," not the fork's original behavior.** The fork's tag
  delete already worked this way, but its folder-group delete logged the
  delete event *immediately* on click and re-emitted fresh `create` events
  for everything if the user hit Undo. That's a real behavioral bug: an
  event already synced to another machine can't be un-sent, so a same-
  machine Undo couldn't undo it on Peter's side. Both now delay logging
  until the 8-second undo window actually expires — see the comment in
  `handleDeleteFolderGroup` in `src/App.jsx`.

- **A genuine race condition was found and fixed during testing, not
  present in the fork's *shipped* behavior but latent in the exact same
  code.** The effect that runs `backfillLocalStateIfNeeded().then(runMerge)`
  on enabling Studio Sync originally fired as soon as
  `studioSyncEnabled && musicFolderPath` were true — without waiting for
  `deviceIdentity`, which loads via an async IPC call in a separate effect.
  On a cold app start with Studio Sync already enabled from a previous
  session, the merge could run before backfill ever got a device id to
  attribute events to, silently skipping backfill while still applying
  whatever was in the shared log at that instant — the same class of
  data-loss incident recorded in `docs/collab-sync-scope.md` §7.5, just
  reached via a startup race instead of a first-run one. Fixed by also
  gating that effect on `deviceIdentity?.id`. See the comment at the fix in
  `src/App.jsx` (search `backfill-then-merge`).

- **Repair Track's renderer-side UI (`App.jsx`, `TrackContextMenu.jsx`,
  `TrackRow.jsx`) was rebuilt from scratch against Micah's current
  components**, not reapplied as a diff — his redesign changed enough of
  the surrounding code (restyled `TrackRow.css`, a smaller
  `DetailsPanel.jsx` with the BPM/Key UI removed) that a mechanical patch
  wouldn't have applied.

- **The dev-mode `AppUserModelID` is `com.disc.app.dev`, distinct from
  `package.json`'s `build.appId` (`com.disc.app`).** This was a real bug
  Ted hit on his own machine: a dev instance sharing an id with a genuinely
  *installed* packaged build can end up with a blank/generic taskbar icon
  if that packaged build is ever uninstalled while Windows still has the
  id cached. Using a distinct id for dev mode sidesteps it. See the
  comment at the `app.setAppUserModelId` call in `electron/main.js`.

## 4. Was Phase 1b (the launcher commit) actually in scope?

**No, not originally** — Ted's initial scope was Studio Sync, crash
protection, and Repair Track only. But upstream's `package.json` still
used `concurrently --kill-others-on-fail` (leaves the dev server running
after a normal window close, which was the cause of nearly every "the app
won't launch" bug across this whole project's history) and
`launch-disc.vbs` had no already-running check at all — both bugs the fork
had already independently fixed. Since Ted and Peter are switching to this
merged build, those bugs would otherwise resurface for them immediately.
**Ted explicitly approved porting this once told** — see commit `d47038c`
for the full reasoning. If you'd rather keep this PR scoped tighter, it's
a clean, independent commit and can be reverted/dropped without touching
anything else.

## 5. What was actually tested, and how

This environment has no way to drive Disc's native window through a
person clicking it, so testing here was done via the Chrome DevTools
Protocol — connecting directly to the renderer's devtools port and driving
real DOM interactions (clicks, typed input, right-click context menus)
against the actual React app, not just calling internal functions
directly. Two isolated Electron instances (separate `DISC_USER_DATA`
profiles, pointed at a shared *test* copy of a music folder — never the
real one) simulated two machines syncing.

**Confirmed working, end-to-end, via real UI interaction:**

- **Studio Sync live propagation** — created and assigned a tag through
  the actual Details-panel "+ Add → + New tag" flow, confirmed the exact
  `tag.create`/`tag.assign` events landed in that device's `.jsonl` on
  disk with the right schema, then cold-booted a second instance pointed
  at the same folder and confirmed it merged the tag in with no manual
  step.
- **Soft-delete + undo timing** (see §3) — deleted a tag and hit Undo
  within the 8-second window: confirmed no `tag.delete` event was ever
  written, and the tag came back locally. Deleted a second tag and let the
  window expire: confirmed `tag.delete` was written only after expiry.
- **Repair Track** — right-clicked a `.wav` mislabeled as `.mp3`, confirmed
  the diagnosis, repaired it through the real confirm-dialog flow, and
  confirmed it came back as a genuine `.mp3` with the original backed up
  alongside it.
- **The OOM guard** — a 60MB synthetic file correctly skipped waveform
  decode and showed the "Too large to analyze" placeholder, no crash.
- **Launcher fixes** — confirmed the window title reads
  `"Disc — Music Library"`, and that running `launch-disc.vbs` a second
  time while Disc is already open focuses the existing window instead of
  spawning a duplicate process tree.
- **The race condition in §3** — reproduced before the fix (an empty-log
  wipe on a simulated cold start with pre-existing local data) and
  confirmed fixed after (a correct 5-event backfill, round-tripping
  cleanly back through the merge).

**Not tested / known gaps in test coverage:**

- Nothing that requires a native OS dialog (the real "Choose Music
  Folder" picker, for instance) — those were worked around by setting
  `localStorage.disc.musicFolder` directly rather than automated.
- The Settings → Troubleshooting buttons (Open DevTools, Show Crash Log)
  were wired and reviewed but not click-tested live.
- A second test instance crashed once, unexplained, mid-testing (no crash
  log was written, so no root cause was found) and came back clean on a
  fresh launch. Didn't reproduce a second time; flagged here rather than
  chased further.
- Real two-*machine* testing (an actual second computer, or Peter's
  machine) hasn't happened yet — everything above used two processes on
  one machine, which exercises the same code paths but not real network/
  Resilio-Sync timing.

## 6. Known gaps carried forward on purpose — not bugs in this PR

- **Folder reorder and moves into/out of Sections don't sync** between
  devices (`handleReorderFolders` in `App.jsx`). Everything else about
  folders does (create/rename/recolor/delete/link/unlink). This was a
  known, documented gap in the fork before this PR and wasn't in scope to
  fix now.
- **Event log compaction isn't implemented.** Each device's `.jsonl` grows
  unboundedly. Not urgent at current usage volume; see
  `docs/collab-sync-scope.md` for the design's own "Phase 4" note on this.
- **Image panel, favorites, theme, layout, shortcuts stay local-only,
  never synced.** This was a deliberate scope decision in the original
  design, not an oversight.

## 7. Design reference

`docs/collab-sync-scope.md` (added by this PR) is the full design
document for Studio Sync — event schema, the merge algorithm, and a
recorded incident write-up (§7.5) about an early version of the merge
wiping pre-existing local data before a backfill step was added. Read it
before changing anything sync-related; the "why" for most non-obvious
decisions in `src/sync/*.js` and the sync-related parts of `App.jsx` is
there, not repeated here.

## 8. After this PR merges (Ted's side, not Micah's — context only)

Once merged, Ted and Peter both need to move their daily-use clones onto
this codebase and decide whether to point `origin` at Micah's repo or keep
syncing Ted's fork — that's tracked as open decisions on Ted's side (his
fork's own `docs/HANDOFF.md` history, not this PR). Not something this PR
or its review needs to resolve.

## 9. Useful commands

```powershell
git log --oneline upstream/main..HEAD --reverse   # every commit in this PR, in order
git show <commit> --stat                          # what one commit touched
git log --oneline d75669d..origin/main            # the fork's full 15-commit history, for context
```

The project has no tests and no lint. `npm run build` catches syntax and
import errors; everything else is manual testing via `npm run dev`. The
main process (`electron/`) does **not** hot-reload — restart after any
change there. See `DISC_USER_DATA` (added in `6ac9821`) for running an
isolated test profile instead of the real one.
