# Studio Sync — Scope Document

Scope for turning Disc from a single-user app into something you and Peter can
both run against the same studio library, plus two standalone UX fixes
(Tag Manager, batch-tag search) that are useful regardless of collaboration.

## 1. Current state (why this needs real design, not a quick patch)

Every piece of Disc's data — tags, tag assignments, collections, notes,
BPM/Key overrides, folder structure, theme, layout, shortcuts — lives in
`localStorage`, which is private to one machine (see
[tagStorage.js](../src/tags/tagStorage.js),
[collectionStorage.js](../src/collections/collectionStorage.js)). There's
already a "Profiles" system ([profileData.js](../src/profiles/profileData.js))
that bundles all of it into one exportable file, but it's manual export/import
— nothing keeps two machines' state in sync automatically, and nothing
resolves what happens when both machines change the same thing.

The one piece of relevant infrastructure you already have: **both machines
point at the same music directory over Resilio Sync.** That's a real asset —
it means we don't need to stand up a server, a database, or user accounts. It
also means we should be honest about what Resilio actually gives us: file-level
sync with eventual consistency, not a database with transactions. If two
people edit the same file within the sync window, Resilio doesn't merge it —
it renames the loser to `filename.sync-conflict-<date>-<device>` and leaves
you to sort it out by hand. Design around that constraint rather than
discovering it after your tags disappear.

## 2. The core risk, stated plainly

If we naively store shared state as one JSON blob (e.g.
`shared-tags.json`) inside the synced folder, and both of you have Disc open
at the same time:

- You rename a tag on your machine → app writes the whole file.
- Peter tags five tracks on his machine seconds later → his app writes the
  whole file too, from *his* last-known copy — which doesn't have your
  rename yet.
- Resilio syncs both writes into the same window → one of you wins, one of
  you loses silently, or Resilio drops a `.sync-conflict` file neither app
  knows to look at.

This isn't a hypothetical — it's the default outcome of "shared JSON file +
two writers" every time, and it gets worse the more often you're both using
the app at once (which, given a shared studio, is the common case, not the
edge case).

## 3. Proposed architecture: per-device append-only event log

Instead of one shared file both machines write, **each device only ever
writes its own file.** Two writers never touch the same file, so there is
never a write conflict at the filesystem level — only a merge step at read
time, which we control.

### Layout

```
<shared music dir>/.disc-sync/
  devices/
    <device-id-a>.jsonl      ← only Device A ever appends here
    <device-id-b>.jsonl      ← only Device B ever appends here
  snapshots/
    <device-id-a>.snapshot.json   ← periodic compaction of A's own log
    <device-id-b>.snapshot.json
```

`.jsonl` = newline-delimited JSON, one event per line. This format survives a
partial sync gracefully: if Resilio has only propagated the first 40 of 45
lines when Disc reads it, the app just sees 40 valid events and picks up the
rest next sync — versus a single JSON blob, where a partial sync produces one
truncated, unparseable file and you lose the *entire* dataset until the
transfer finishes.

### Device identity

On first launch of a "Studio Profile," each install generates a random
device ID (stored locally, not synced — e.g.
`crypto.randomUUID()` written to a file in `app.getPath("userData")`). This
names that device's log file and never changes, so both of you can always
tell whose log is whose (useful for the sync-status UI in §3.5).

Also prompts once for a display name ("What should we call this device?" —
e.g. "Guitarnerd's PC" / "Peter's PC"), stored alongside the device ID and
attached to that device's snapshot metadata. The sync-status UI shows this
name rather than the raw ID — decided in §9.

### Event schema

Each line is one append-only fact, never a mutation of a previous line:

```json
{"id":"evt_...", "device":"<device-id>", "seq":417, "ts":1735059600000,
 "type":"tag.rename", "payload":{"tagId":"tag-...","name":"Boss Fight Themes"}}
```

`seq` is a per-device monotonic counter (not a timestamp) — it's what lets a
device safely resume appending after a restart without re-reading everything,
and it's a more reliable ordering signal within one device's own log than
wall-clock time, which can skew slightly between two computers. `ts` (real
clock time) is only used to order events *across* devices when merging.

Event types needed for tags and collections:

| Type | Payload | Notes |
|---|---|---|
| `tag.create` | `{tagId, name, color}` | |
| `tag.rename` | `{tagId, name}` | |
| `tag.recolor` | `{tagId, color}` | |
| `tag.delete` | `{tagId}` | Tombstone — see below |
| `tag.merge` | `{fromTagId, intoTagId}` | Solves the duplicate-tag cleanup problem (§4) |
| `tag.assign` | `{trackKey, tagId}` | `trackKey` = stable track identity (see §3.4) |
| `tag.unassign` | `{trackKey, tagId}` | |
| `collection.create` | `{collectionId, name, color}` | |
| `collection.rename` | `{collectionId, name}` | |
| `collection.recolor` | `{collectionId, color}` | Added during Phase 2 — collections have a color field too, same as tags |
| `collection.delete` | `{collectionId}` | Tombstone |
| `collection.addTrack` | `{collectionId, trackKey}` | |
| `collection.removeTrack` | `{collectionId, trackKey}` | |
| `note.set` | `{trackKey, text}` | Notes are shared per §6; last-write-wins by `ts` is fine here — no tombstone needed, an empty `text` just clears it |
| `override.set` | `{trackKey, field, value}` | `field` is `"bpm"` or `"key"`; BPM/Key overrides are shared per §6 |
| `override.clear` | `{trackKey, field}` | Reverts to auto-detected value |
| `folderGroup.create` | `{groupId, name}` | |
| `folderGroup.rename` | `{groupId, name}` | |
| `folderGroup.delete` | `{groupId}` | Tombstone. Also emits one `folder.delete` per folder the group takes with it (see below) — unlike a Section's un-nesting, these folders are gone entirely, so each needs its own tombstone rather than an inferred cascade |
| `folder.create` | `{folderId, kind, name, color, groupId, sectionId}` | `kind` is `"folder"` or `"section"` (a Section is a divider entry, not a separate concept, in the underlying data) |
| `folder.rename` | `{folderId, name}` | |
| `folder.recolor` | `{folderId, color}` | |
| `folder.delete` | `{folderId}` | Tombstone. A Section's un-nesting of its children (`sectionId` reset to null) is *not* a separate event — a receiving device's Phase 3 replay derives it from the same field, same approach as `tag.delete` |
| `folder.link` | `{folderId, relativePath}` | `relativePath` from `src/sync/folderPath.js` — see below. Only sent when the linked directory resolves to somewhere inside the shared music root |
| `folder.unlink` | `{folderId}` | |

**Deliberately not yet synced** (documented gap, not an oversight): drag-to-reorder position, moving a folder between groups/into a Section via drag, and a Section's collapsed/expanded state. `handleReorderFolders` covers all of these in one function with real complexity (cycle detection for nested Sections, whole-subtree moves between groups) — worth doing properly in its own pass rather than half-wiring it alongside everything else here. Collapsed/expanded state is treated like layout/theme (local display preference, not shared project data). The concrete gap this leaves: if you drag a folder into a different Section or reorder it, that specific change won't show up on Peter's machine yet — creating, naming, coloring, linking, and deleting folders all do.

### Why folder paths need the same treatment as track paths

A linked custom folder's `folderPath` is just as machine-specific as a
track's absolute path (§3, "Track identity across two machines") — your
`D:\Recording Files\Resilio Sync\...` and Peter's install of the same
Resilio share could easily sit at a different drive letter or root.
`getRelativeFolderPath` (in `src/sync/folderPath.js`) derives a path
relative to the shared music root the same way `getTrackKey` does for
tracks, and only emits a `folder.link` event when the linked directory
actually resolves to somewhere inside that root. A folder linked to
somewhere outside it (a personal, unsynced location) simply doesn't get a
link event — the folder entry itself (name/color/position) still syncs,
just unlinked, which is the honest outcome given the files genuinely
aren't shared.

### Merge algorithm (runs entirely client-side, on read)

1. Read every file in `devices/*.jsonl` (plus each device's own snapshot as a
   starting point — see compaction below).
2. Concatenate all events, sort by `ts`, then by `device` id as a tiebreaker
   for same-millisecond events (deterministic — every machine computes the
   identical order from the identical inputs).
3. Replay in order into an in-memory state, same shape as today's
   `tags` / `trackTags` / `collections` arrays.
4. **Tombstones win over recreation-by-old-data:** a `tag.delete` for a given
   `tagId` permanently removes it even if an older `tag.assign` for that id
   is replayed after it in the merge (this is why deletes are events, not
   silent omissions — an omission can't out-rank a stale write the way an
   explicit tombstone can).
5. `tag.merge` rewrites every `tag.assign`/`tag.unassign` referencing
   `fromTagId` to `intoTagId` during replay, then tombstones `fromTagId`.

This is the same idea as CRDTs / event sourcing, scoped down to exactly what
Disc needs — no external CRDT library required, because every op here
(create/rename/recolor/delete/assign/unassign/merge) already commutes cleanly
under "replay in timestamp order, tombstone wins."

### Track identity across two machines

Tag/collection events reference tracks by `trackKey`, not by absolute file
path — your path is `D:\Music\...`, Peter's might be `E:\StudioMusic\...`.
Reuse the same relative-path-from-linked-folder-root approach the app
presumably already needs for the shared directory to resolve tracks
consistently on both machines (worth confirming during implementation exactly
how `customFolders` + `folderPath` currently identify a track — see
[App.jsx](../src/App.jsx) folder-linking logic — since this is the one piece
that breaks silently and confusingly if it's wrong: tags would appear to
"not stick" with no error).

### Compaction

An unbounded log is fine for months of normal use (tag events are small and
infrequent — this isn't a chat app), but each device should periodically
fold its *own* log into a snapshot (`{tags: [...], collections: [...], ...}`
as of event N) and truncate its own `.jsonl` to only events after that point.
Since a device only ever compacts its own file, this never conflicts with
anything Peter's machine is doing.

### Live updates

Main-process folder watching already exists for exactly this kind of thing —
[main.js](../electron/main.js) watches linked folders via `fs.watch` with a
debounce (`disc:watch-folder` IPC handler). Point the same mechanism at
`.disc-sync/devices/` so an incoming change from Peter's machine triggers a
re-merge and a live UI update without you having to restart the app. Add a
manual "Sync now" button regardless — Resilio's own propagation isn't
instant, and a visible affordance beats wondering whether it's working.

### Sync status UI

A small always-visible indicator (title bar, near the profile switcher):
last successful merge time, and which devices have been seen. Not required
for correctness, but it's what turns "did my tag actually save for Peter" from
an anxious guess into a glance.

## 4. Feature: Tag Manager

A dedicated modal/panel (new icon in the title bar, alongside Settings/
Shortcuts) — the current per-tag actions are scattered (rename lives in
Details' tag-assign chips, delete-completely is a right-click on a chip
attached to *some* track). Centralize:

- **Full tag list** — every tag in the vocabulary, sorted alphabetically by
  default, each row showing: color swatch, name, and a track count (so you
  can see at a glance which of three near-identical "Boss Fight" tags is the
  one actually in use).
- **Inline rename and recolor**, same reusable color picker used elsewhere.
- **Delete completely**, same double-click-to-arm pattern the codebase
  already uses for destructive actions (see the existing tag-chip
  right-click and batch-delete patterns) — deletes the tag and every
  assignment.
- **Merge** — the actual fix for "I created four duplicates and don't know
  which to keep": select two or more tags, pick which one survives, confirm.
  Every track carrying any of the merged-away tags gets the surviving tag
  instead; the others are deleted. Under Studio Profile mode this emits one
  `tag.merge` event per merged-away tag (§3, event table) rather than writing
  local storage directly.
- **Possible-duplicate hint** — flag tags whose names match case-insensitively
  (or are very close — simple Levenshtein distance ≤2 is enough, no need for
  anything fancier) with a small badge, so duplicates surface without you
  having to spot them by eye in a long list.

## 5. Feature: Batch-tag existing-tag search

Current state, checked directly against
[BatchActionBar.jsx](../src/components/BatchActionBar.jsx): the "+ Tag"
button on a multi-selection *does* already list existing tags to click, with
"+ New tag" below — it's not pure create-only. The real gap, given the
duplicate-tag situation described above, is that the list has **no search or
filter** — it's a plain scroll. Once your tag vocabulary has 30+ entries
(and especially while duplicates still exist pre-merge), finding the right
one by scrolling is exactly the kind of friction that's easy to fix and easy
to feel every day. Add a text input at the top of that dropdown that filters
the list live, same pattern as the existing Folders-panel search
(`FolderGroupPanel` search-as-you-type). Worth shipping this regardless of
the collaboration work — it's independent and low-risk.

## 6. What's shared vs. local-only — decided

| Data | Scope |
|---|---|
| Tags (vocabulary + assignments) | **Shared** |
| Collections (+ membership) | **Shared** |
| Track notes | **Shared** |
| BPM/Key manual overrides | **Shared** |
| Favorites | **Local-only** — personal shortlist per machine |
| Theme, layout, appearance, shortcuts, volume, Pomodoro settings | **Local-only** — per-machine ergonomics, not project data |

So the event log (§3) carries tags, collections, notes, and BPM/Key
overrides — everything else stays exactly as it is today, untouched by this
work.

## 7. Phased rollout

1. **Tag Manager + batch-tag search** — ✅ done. No collaboration
   dependency, ships against today's single-user `localStorage` model,
   immediately useful solo.
2. **Device identity + event log, write-only** — ✅ done. Every tag,
   collection, note, and BPM/Key override mutation now appends to the local
   device's `.jsonl` *in addition to* today's `localStorage` write, but
   nothing reads it back yet — zero risk to current behavior. Implementation
   notes:
   - Device id/name live in `device-identity.json` in Electron's userData
     folder (readable before/without a renderer), exposed via
     `disc:get-device-identity` / `disc:set-device-name`; editable under
     Settings → Studio Sync.
   - `disc:append-sync-events` (main process) appends this device's own
     batch to `<musicFolderPath>/.disc-sync/devices/<deviceId>.jsonl` —
     `.disc-sync` is now skipped by the folder scanner, same as the existing
     `.disc-sections` folder.
   - `src/sync/trackKey.js` derives the relative `trackKey` from a track's
     absolute path (`track.id` *is* the file path — confirmed against the
     scanner in `electron/main.js`). Known limitation: a linked custom
     folder's key is namespaced by its *name*, not a synced id, so renaming
     a linked folder on one machine can orphan that folder's existing
     events — fine for the main music folder (today's actual use case),
     worth revisiting if linked-folder sharing becomes a real need.
   - `src/sync/eventLog.js` batches rapid-fire mutations (e.g. batch-tagging
     50 tracks) into one append call, 400ms debounce, best-effort (a dropped
     batch has no visible effect yet since nothing reads the log).
   - Verified end-to-end: creating and batch-assigning a tag produced
     `D:\...\Video Assets\Music\.disc-sync\devices\<device-id>.jsonl` with
     correct `tag.create` / `tag.assign` events and a proper relative
     `trackKey` (e.g. `main/30. DK Summit.mp3`).
3. **Studio Sync: read + merge path** — ✅ done. Implemented as a
   Settings → Studio Sync checkbox (simpler than a full separate
   "Studio Profile" selector integrated with the existing local Profiles
   feature — a deliberate scope reduction, see below) rather than a new
   profile type. When enabled:
   - `src/sync/mergeEvents.js` reads every device's combined event stream
     (via `disc:read-sync-state`) and deterministically replays it —
     sorted by `ts`, device id as a same-millisecond tiebreak — into
     tags/trackTags/collections/trackNotes/trackOverrides/folders/
     folderGroups. Runs entirely client-side; no external CRDT library.
   - `resolveTrackKey` / `resolveFolderPath` (the reverse of `getTrackKey`
     / `getRelativeFolderPath` from Phase 2) turn a shared `trackKey` or
     `relativePath` back into *this* machine's own absolute path.
   - Folder/group reconciliation (`applyMergedFolders` in App.jsx)
     deliberately preserves local position, group/section membership, and
     collapsed state for anything already known locally — only
     name/color/link-state come from the merge — so a local drag-reorder
     can't be silently reverted by an unrelated remote change re-triggering
     a merge (reorder/section-move still aren't synced at all, per the
     documented gap in §3).
   - Live updates piggyback on the existing recursive watch on the main
     music folder (writes under `.disc-sync/` already trigger it) rather
     than adding a second recursive watcher over the same tree.
   - Each device publishes its display name into `.disc-sync/devices/
     <id>.meta.json` (separate from the event log, since a name isn't
     itself an event) so the sync-status UI can show "Peter's PC" instead
     of a raw id.
   - **Verified end-to-end**, including with a hand-written simulated
     second device: enabling the toggle merged in a tag and a collection
     from the fake device correctly attached to the right track; editing
     the fake device's log while the app sat idle updated the UI live with
     no manual action; deleting the fake device's files made its
     contributed tag/collection disappear cleanly on the next merge.
4. **Compaction** — the one piece not yet built. Each device's own
   `.jsonl` will grow unboundedly under normal use; needs periodic
   self-compaction into a snapshot (§3) once real usage volume makes that
   worth doing. Not urgent — tag/collection/folder events are small and
   infrequent, this isn't a chat log.

Shipping in this order meant each phase was useful and independently
testable before the next one depended on it — worked out that way in
practice, not just in the plan.

## 7.5. Incident: enabling Studio Sync wiped pre-existing local data

Found during development, not by a user in normal use — worth recording
plainly rather than glossing over.

**What happened:** the event log only ever recorded *new* mutations from
the moment Phase 2 shipped. Tags/collections/track-tags that already
existed locally before that point (in this case, a full library's worth,
migrated in from the original install) had no corresponding `tag.create`
/ `collection.create` event. When Studio Sync was enabled and the first
merge ran, it did exactly what §3 says it does — rebuilt shared state
entirely from the event log — which meant it rebuilt from *nothing*, and
that empty result overwrote the real local data.

**Recovery:** the original data was still recoverable from a clean
snapshot of the original install (pulled minutes earlier for an unrelated
"import as a profile" request), so it was reconstructed as proper
backfill events — `tag.create`/`collection.create` with the original ids
and timestamps parsed back out of those ids, `tag.assign`/
`collection.addTrack` for the track associations — and appended directly
to the affected device's log. One track outside the shared Music Folder
couldn't be represented as a `trackKey` and its two tag assignments were
not recoverable this way; the tags themselves were.

**Fix:** enabling Studio Sync now backfills whatever's currently local
into the event log *before* the first merge ever runs (§7's phase list,
Phase 3 entry) — a one-time, per-device step gated by a local-only flag.
This is what should have shipped with Phase 3 originally; it didn't
because the design only accounted for events *going forward* and missed
that "local state predating the log" is itself a real starting condition,
not an edge case. Anyone enabling Studio Sync for the first time now
(including Peter, whenever he sets it up) is protected by construction.

## 8. Non-goals

- **Not real-time collaboration.** This is eventual consistency over file
  sync (Resilio's propagation is typically seconds, sometimes longer) — not
  live cursors or instant multi-user editing. Two people renaming the exact
  same tag in the same few seconds will resolve deterministically (last
  timestamp wins) but neither of you will see the other's edit until the
  next sync + merge.
- **Not a general-purpose backend.** No accounts, no server, no database. If
  the studio ever needs true real-time sync or more than file-sync-level
  reliability, that's a different, larger project — this scope deliberately
  stays inside what Resilio + client-side merge logic can support.
- **No locking.** Nothing prevents you and Peter from both editing at once;
  the merge algorithm is what makes that safe rather than a coordination
  mechanism that makes it impossible.

## 9. Decisions log

All open questions resolved:

1. **Shared vs. local-only split** — decided, see §6.
2. **`.disc-sync/` location** — inside the existing shared music root (one
   folder to link in Resilio, simplest setup).
3. **Tag Manager merge coordination** — no coordination required. Whoever
   merges first wins; the other person's pending log entries simply replay
   against the surviving tag. The architecture in §3 already makes this safe
   — this was a UX preference, not a correctness requirement.
4. **Device labeling** — real names, not raw device IDs. One-time "what's
   this device called?" prompt on first Studio Profile setup (§3, Device
   identity).
