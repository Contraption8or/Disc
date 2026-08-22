# Disc

A local mp3 library manager built for video editing — sort your music into
folders, tag and search it, see real waveforms, get auto-detected BPM/Key,
shuffle-play a folder's worth of tracks, and drag a track straight onto
Premiere Pro's timeline.

## Setup (for development)

You'll need [Node.js](https://nodejs.org) (18 or newer) installed.

```bash
cd disc
npm install
npm run dev
```

That starts Vite (the renderer) and Electron together. A window titled
"Disc" should open.

> **Heads up:** I wrote this without being able to run it myself (no
> internet access in my sandbox to `npm install`). Everything's written
> correctly to the best of my knowledge, but flag anything that breaks and
> I'll fix it fast.

### About `npm audit` warnings

If `npm install` reports vulnerabilities, they're almost certainly inside
`electron-builder`'s own toolchain (a devDependency), not anything that
ends up inside the actual Disc app — `electron-builder` never ships with
the app, it just runs on your machine while building the installer. Try:

```bash
rm -rf node_modules package-lock.json
npm install
npm audit fix
```

A clean reinstall alone often clears most of them, since `npm install`
picks the newest version matching each package's version range rather
than reusing whatever an older lockfile pinned. If real ones remain after
`npm audit fix`, paste me the full `npm audit` output (not just the
install summary) and I'll address the specific packages.

## Building the real installer (.exe)

I can't build this file myself (needs Electron's binaries downloaded over
the network), but the project's fully configured for it:

```bash
npm install
npm run dist
```

That produces **`release/Disc Setup 1.0.0.exe`** — a real installer with a
Start Menu entry, Desktop shortcut, and uninstaller. It's a **one-click
installer** now (no "install for all users" step, which was the thing
that broke last time) and unsigned, so Windows SmartScreen will likely
show a warning the first time — click "More info" → "Run anyway".

If `npm run dist` fails with a symbolic-link permission error, either
enable **Developer Mode** (Settings → Privacy & security → For developers)
or run the command from an Administrator terminal.

## Desktop shortcut (dev-mode alternative)

If you'd rather not build the installer, double-click
**`Create Desktop Shortcut.bat`** in this folder. It adds a "Disc" icon to
your Desktop that silently runs `npm run dev` in the background.

## What's in this build

**Title bar** — the window is now frameless, with no native OS title bar
and no native File/Edit/View/Window/Help menu bar — Disc draws its own
title bar (including minimize/maximize/close) end to end, so the whole
thing actually themes correctly instead of leaving unthemed native chrome
sitting on top of it. It always renders in the darkest tone available in
the active theme (derived automatically, works for custom themes too).
Also has "Pin on top", a volume slider, Layout presets (right-click one
to rename it, or set it as default), and the theme switcher — 10
built-ins now: Premiere Dark, HiAnime, Sunset, and 7 new ones —
**Emerald** (deep green, vivid emerald accent), **Abyss** (deep
ocean-teal, bright cyan), **Ember** (warm charcoal-brown, copper/amber),
**Midnight** (deep indigo, periwinkle accent), **Blush** (deep
plum-wine, rose-pink), and two light themes — **Paper** (warm cream,
deep forest-green "ink" accent) and **Mist** (cool blue-gray, soft
periwinkle accent) — plus a custom theme creator. Premiere Light has
been retired; anyone who had it saved as their active theme migrates
automatically to Paper (the closest match in spirit) on next launch,
rather than silently breaking or dumping them into a dark theme they
didn't choose.

**Folders panel** — right-click empty space for a menu to create a real
folder or a Section (a collapsible grouping — see below). Right-click a
folder or Section itself for Unlink (if linked), Delete, and — for
folders — **Export Folder**, which zips up everything in it and lets you
pick where to save it (subfolder structure inside the folder is preserved
in the archive), handy for sending a batch of music/SFX to a colleague.
Delete leads into a confirmation, or just select a folder and press
Delete, same result. Drag folders/Sections to reorder. Click a folder's
dot to recolor it. Click the 📁 icon to link a folder to its own real
directory on disk — once linked it's scanned/watched independently. The
list scrolls within its own space instead of overlapping the help text
below it, and that help text has a "?" toggle
to hide/show it.

**Library panel** — real per-track waveforms (Web Audio, decoded lazily as
rows scroll into view) that now **resize to fit the available width**
instead of getting clipped in a narrow window — the bar count adapts, the
bar width stays consistent. Drag a track's waveform straight out of the
window onto Premiere Pro's timeline (native OS file drag). Click a
waveform to seek/play from that point.

**Tagging** — click **+ Add Tag** in the toolbar to create a tag (name +
color). Open a track in Details to assign/remove tags on it (chips with a
× to remove, "+ Add" to assign an existing tag or create a new one
inline). **Right-click a tag chip** for "Remove from this track" (just
unassigns it here) or "Delete tag completely" — that one's armed on the
first click and only actually deletes on a second click, so it's hard to
do by accident.

**Auto BPM & Key detection** — open a track in Details and Disc analyzes
it: BPM via onset-autocorrelation over up to 90 seconds of audio, Key via
a Goertzel-filterbank chroma vector sampled from three separate ~7-second
windows spread across the song (around the 20/50/80% marks, not just one
clip near the start) matched against Krumhansl-Schmuckler major/minor
profiles. Both are real signal-processing techniques, not placeholders —
but especially Key detection is a best-effort estimate, so treat it as a
starting point rather than certain fact. Analysis only runs when you
actually open a track (it's heavier than waveform decoding), not for
every row that scrolls by.

**Search** — the search box now searches **everywhere** (every folder,
not just the one selected) by filename and by assigned tag name, the
moment you type something. Combine it with the BPM range slider and/or
Key dropdown and a small popover shows what matched, e.g.
*"12 results for "boss fight" · Key: Am · 120–140 BPM"*. Note: BPM/Key
filtering can only match tracks that have already been analyzed (i.e.
opened in Details at least once) — there's no bulk-analyze-everything
pass, to keep the library fast.

**Play All / Shuffle** — in the Library toolbar, plays every track
currently shown (respecting whatever folder/search/filters are active) in
order or shuffled. Shuffling won't start on whatever's already playing
(if you hit Shuffle again mid-session, the new order is adjusted so it
doesn't feel like an instant repeat). A compact **Now Playing bar**
appears under the toolbar whenever something's loaded, with prev/
play-pause/next, a shuffle toggle, and a progress indicator. Reaching the
end of a track auto-advances to the next one in the queue.

**Favorites & Details** search every source (main folder + every linked
folder), so they work the same regardless of where a track physically
lives on disk.

**Performance** — the track list is virtualized, waveform decoding shares
one `AudioContext` and caps at 3 concurrent decodes, `TrackRow` is
memoized, and the shared app context is memoized so unrelated state
changes don't cascade into re-rendering every row. The virtualizer skips
re-rendering on scroll frames where the visible row range hasn't actually
changed. The search box and BPM range sliders are decoupled from the
expensive part — typing/dragging feels instant, but the actual
"re-filter the whole library" work only runs ~120ms after you pause, not
on every keystroke/pixel. The playback progress bars (per-row and Now
Playing) now only run their per-frame update loop while actually
playing — they used to keep animating at 60fps even while paused, which
was pure wasted work. The volume slider's localStorage write is
similarly debounced, so dragging it doesn't hit disk on every tick.

**Settings (⚙ in the title bar)** — currently just one control: a memory
limit for the app's JavaScript engine (Default, or 1/2/4/8/16 GB). This is
a V8 startup flag, so it can only take effect on a fresh launch — saving
it prompts to restart Disc immediately, or you can apply it next time you
open it. It's genuinely useful if you're running a very large library and
hitting slowdowns from garbage-collection pressure, but it's not a general
speed multiplier — setting it above what your system actually has free
can make things worse, not better. Default is fine for most libraries.

## Workflow features (for the editing grind)

**Mark sections from Details** — Mark In captures the current playback
position, Mark Out captures it again and completes the section (see
"Marked sections + playback modifiers" for how Ctrl-click plays them
back). Sections show up as a list under the waveform, each jumpable and
deletable.

**Profiles** — a new icon in the title bar (next to the Windows menu).
Since Disc doesn't hold the actual audio files itself, a profile is
everything *around* them: theme, folder structure, tags, notes, BPM/Key
overrides, marked sections, layout, shortcuts, appearance settings, all
of it, bundled into one file. Save your current setup as a named
profile, switch between saved ones (with a confirmation first, since
switching replaces whatever's currently active), rename or delete them
inline, and export/import to hand a whole setup to someone else — they
still need the actual linked folders to exist on their own machine to
see tracks, but everything about *how it's organized* travels with the
file. Profiles live in their own folder (Electron's standard per-user
app-data location, not anywhere inside the Disc install itself) as
individual files rather than one combined blob, and renaming one only
ever rewrites a name field inside its file — never the filename — which
sidesteps every filesystem-rename edge case a name-as-filename scheme
would otherwise run into.

**Marked sections + playback modifiers** — Ctrl-click (Cmd on Mac) any
Play button to cycle through a track's marked sections, playing from
that section's start each time; consecutive Ctrl-clicks advance through
them in the order they were created, wrapping back to the first after
the last. Shift-click restarts a track from 0 regardless of where
playback currently sits or whether it's paused. Mark sections themselves
from Details — Mark In captures the current position, Mark Out captures
it again and completes the section (whichever position is later becomes
the end, so correcting a mistake by marking In after Out still produces
a sane section rather than an inverted one). Works from the Library row,
Details, and the now-playing bar consistently.

**Draggable playhead** — click-and-hold anywhere on a track's waveform
(Library row or Details) and drag to scrub through it live, instead of
only being able to click one position at a time. The Library row's
waveform also drags a file out to Premiere Pro, and the two interactions
can't share a single mouse gesture cleanly — once a real OS-level drag
starts, this app has no guarantee it'll ever see a normal mouse-up for
it. The scrub drag accounts for that specifically: it stops updating
playback the moment an OS drag actually begins, and cleans up its
listeners on either a normal mouse-up or the drag concluding, so nothing
is left dangling regardless of which one happens.

**Force Save (Ctrl/Cmd+S)** — nearly everything in Disc already saves
to disk the instant it changes; the one real exception is the volume
slider, deliberately debounced by 200ms so a slider drag doesn't hammer
storage on every tick. This flushes that immediately and confirms with a
brief "Saved" toast.

**Codebase-wide bug audit** — went through several known categories of
bugs systematically rather than randomly poking around. What was
actually found and fixed:

- **A genuine playback race condition**, the most serious find of this
  pass. Clicking through tracks quickly could let a slow `readAudioFile`
  call for an *older* click resolve after a *newer* click had already
  taken over — and then revoke the new track's active blob URL and
  silently overwrite state back to the wrong track. This is the kind of
  bug that only shows up as "sometimes clicking through tracks fast
  breaks playback," hard to pin down without knowing exactly where to
  look. Fixed with a request-token pattern: each track-load call gets a
  ticket, and checks after every `await` point whether it's still the
  most recent request before touching any shared audio state — if not,
  it bails out cleanly instead of clobbering a newer, still-active load.
- **ID collision risk** — five places generated ids from `Date.now()`
  alone (collections, tags, folders, folder groups, custom themes), with
  no protection if two got created in the same millisecond. One of six
  near-identical id-generation sites already had a random-suffix fix for
  exactly this; the other five didn't. Made all of them consistent.
- **A real gap in the standalone Convert modal**: no way to cancel a
  running conversion. The newer OGG-link prompt got that protection when
  it was built; this older, more general modal never did, despite being
  exactly the same "accidentally started converting way more files than
  intended" scenario. Added the same cancel-mid-run behavior, including
  correctly reporting "cancelled after N of M" rather than misleadingly
  claiming the whole batch finished.

Also swept and confirmed clean, no changes needed: every
`setInterval`/`setTimeout` in the app (all correctly cleared), every
`addEventListener` pairing, all 23 places a `.find()` result gets used
(every one already guarded or defaulted), the four spots where a React
lint rule was deliberately suppressed (each verified intentional and
correct), the cycle-detection and subtree-move logic for nested Sections,
IPC error handling in the main process, and the Pomodoro timer's
dependency handling.

**Rename a saved layout** — right-click it (⊞ Layout menu) → Rename.
Presets are stored keyed by their own name rather than a separate id, so
this is a genuine rekey rather than just relabeling something — refuses
if another preset is already using the new name, rather than silently
overwriting it. If you rename whichever layout is currently set as
default, the default pointer follows it automatically so it doesn't end
up silently pointing at a name that no longer exists.

**Convert-on-link for folders with convertible audio** — link (📁) a
folder that has .ogg, .flac, .m4a, .aac, .opus, or .webm files in it and
Disc now asks first: convert them to mp3 before linking, link the folder
as-is, or cancel entirely. Converting shows live progress with its own
cancel button — cancelling mid-way un-links the folder too, not just
stops the conversion, so an accidental "convert 200 files" never leaves
a half-converted folder sitting there linked. One clarification worth
having accurate: this isn't about Disc being unable to *play* these
files — Chromium's Web Audio already decodes several of them natively,
.ogg included, the same way it does for waveforms everywhere else in the
app. This is purely an option to get real .mp3 files on disk, for
whatever reason that matters to you (sharing with someone else, a
workflow that expects mp3 specifically, and so on) — not a workaround for
something Disc couldn't otherwise handle.

**Fixed: dragging a panel over folder/library content** — Disc has more
than one drag-and-drop system running side by side: dockview's own
panel-moving (dragging a whole panel's tab to redock it somewhere else),
and Disc's own custom drag handling for reordering folders, nesting them
in Sections, dragging real folders in from Explorer, and manually
reordering tracks. All of Disc's own drag handlers used to call
`preventDefault()` unconditionally on `dragover`/`drop`, which meant they
intercepted *any* drag passing over their content — including dockview
trying to move a whole panel. That's what caused panel docking to "freak
out" or behave inconsistently specifically when the drag passed over a
folder panel or the library. Every one of Disc's own drag handlers
(across the Folders panel and the Library) now checks first whether the
drag in progress is actually one it should care about — either its own
internal drag or a real OS file/folder drop — and does *nothing at all*
otherwise, letting the event pass through untouched.

That first pass wasn't quite specific enough, though: the initial "is
this our drag" check looked for the generic `"text/plain"` data type,
which — it turned out — dockview's own panel-dragging *also* sets on its
dataTransfer (a common practice for drag sources in general), so Disc's
Section-drop-target highlighting could still light up during a pure
panel-drag. Fixed properly by having folder drags carry their id under a
custom, namespaced MIME type (`application/x-disc-folder-id`) instead of
the generic one — nothing else, including dockview, would ever set that
specific type, so there's no more ambiguity between "someone's dragging a
folder" and "someone's moving a panel."

**Rename a track** — right-click a track's waveform → Rename, renames the
actual file on disk (extension preserved automatically, the input only
ever edits the name — same as how it's displayed everywhere else).
Favorites, tags, notes, manual BPM/Key overrides, and Collection
membership all carry over to the renamed file automatically, since a
track's identity in Disc is tied to its file path — renaming necessarily
changes that, so this is a deliberate migration step, not something that
happens for free. Disabled (with an explanation) for missing/unreachable
tracks, since attempting to rename a file that isn't actually there would
just silently fail.

**Drag tracks to manually reorder them** — a small grip handle appears on
the left of each row once Sort is set to "Folder order." Drag it to put
tracks in whatever order you want within that folder (or Favorites) —
persisted, so it's remembered next time you open Disc. Only shows up for
a single, stable folder view — not search results, a Collection, Find
Similar, or a health-filtered view, since none of those represent one
consistent list something could meaningfully be dragged within. New
files that show up later land at the end automatically rather than
disrupting whatever order you've already set. This uses a dedicated grip
handle rather than the row/waveform itself specifically so it doesn't
collide with dragging a track out into Premiere Pro — those are two
genuinely different kinds of drag (one hands off to the OS directly, the
other stays entirely inside Disc), and trying to layer both onto the same
element wouldn't have worked reliably.

**Convert audio to .mp3** — new button in the title bar (the
exchange-arrows icon). Supports .ogg, .wav, .flac, .m4a, .aac, .opus, and
.webm as source formats — pick individual files or a whole folder to
search recursively, pick which linked Disc folder the results go into,
convert. The whole pipeline runs inside Disc with no external converter
or installed software required: Chromium decodes all of these natively
(the exact same Web Audio pipeline already used everywhere else in the
app for waveforms), and the MP3 encoding side uses `lamejs` — a
pure-JavaScript encoder with no native binary. That was a deliberate
choice over bundling ffmpeg, which would mean a large platform-specific
binary and exactly the kind of dependency that caused real packaging
trouble with `archiver` earlier in this project (see the packaging note
further down). A file that already exists at the destination is left
alone rather than overwritten. Converted files land in the folder's real
directory on disk, so Disc's existing file-watcher picks them up as
tracks automatically — no separate "import" step needed afterward.

One honest flag on this one, same spirit as the dockview-API notes
elsewhere in here: `lamejs` is a new dependency I can't fully verify
end-to-end without actually building and running the app, particularly
its exact import shape when bundled through Vite. If the convert button
throws an error immediately on first use, that's the most likely spot to
check.

**Search folders within a panel** — the magnifying glass in a Folders
panel's header. Filters that panel's list live as you type, matching
against folders and Sections both. Handles nesting correctly: a Section
counts as a match if anything inside it matches, at any depth, and it
gets force-expanded while you're searching — regardless of its actual
collapsed state — so a match buried inside several layers of collapsed
Sections is never hidden from a search that would've found it. Clear the
search (× or Escape) and everything reverts to exactly how it was.

**Custom icon set** — every emoji and dingbat character in the app (play/
pause, shuffle, folders, trash, hearts, stars, warning triangles, the
Windows menu icon, all of it — 41 icons, ~70 usages across 18 files) is
now a hand-built SVG instead. Worth explaining why this matters beyond
looks: emoji render differently — sometimes wildly differently — across
operating systems and fonts, and don't stay crisp or recognizable at the
small sizes used throughout Disc's UI (14–16px buttons, mostly). The
replacement (`Icon.jsx`) is one shared component with all 41 icons built
from simple primitive shapes (rects, circles, plain paths) on a
consistent 24×24 grid with uniform ~2px rounded strokes, so they read as
one deliberately-designed set rather than mismatched symbols, and use
`currentColor` so they always automatically match whatever theme is
active — same as text does, no extra wiring needed per-theme. A few
buttons that previously centered a single text character via
`text-align` needed an explicit flex-centering fix to keep the new SVGs
properly centered too — caught and fixed those along the way rather than
leaving icons looking slightly off-center in a handful of spots.

**Windows menu (▤ in the title bar)** — a checklist of every panel Disc
knows about (Library, Details, Collections, every folder group, the
Pomodoro timer below), checked if it's currently open. Closing a panel
with its own × used to be a dead end short of reloading an entire saved
layout — now click it here and it reopens right where a fresh one would
normally land, no layout reload needed.

**Pomodoro timer** — a genuinely new panel type, dockable anywhere like
any other (add it the first time via the ▤ Windows menu above). Work/
short break/long break durations and the number of sessions before a
long break are all editable (⚙ on the panel itself), with a two-tone
chime on phase changes (toggleable). Built as its own isolated piece of
state, separate from the rest of the app's — specifically so a clock
ticking every single second doesn't cause anything else in Disc to
re-render — and it keeps running even if you close the panel itself,
since the timer lives at the app level, not inside the panel's own
component.

**Sections — collapsible groupings within a Folders panel** — replaced
the old plain dividers. Create one via the section icon in a panel's
header, or right-click empty space → New Section. Click the triangle to
collapse/expand it (a real Notion-style toggle, animated with a pure-CSS
technique — no JS height measurement, and it respects the Reduce Motion
setting automatically like everything else). Folders inside a Section are
a genuine parent/child relationship, not just visual position — drag a
folder onto a Section's header (works even while it's collapsed, same as
Notion) to move it inside; drag it to the general empty space to move it
back out to top-level. This works across separate group panels too — you
can drag a folder from one panel straight into a Section in a completely
different panel in one motion. Deleting a Section moves its folders back
to top-level rather than deleting them — a Section is just an
organizational grouping, the folders inside are real things you still
care about even if the grouping goes away.

**Sections can nest inside Sections, arbitrarily deep** — a "Game Sound
Effects" Section can contain a "Minecraft" Section and a "Smash Bros"
Section, each with their own folders inside. Dragging works exactly the
same as dragging a folder into a Section. Two things worth knowing about
how this was built safely: a Section can never end up nested inside
itself or one of its own descendants — Disc walks the target's full
ancestor chain before allowing the move and silently rejects anything
that would create a cycle you'd have no way to drag back out of. And
moving a Section to a different group panel takes its *entire* subtree
with it (every folder and nested Section inside it, at any depth) — not
just the Section itself — so nothing gets stranded behind in the panel
it just left.

**Sort a Section alphabetically** — hover a Section's header for a sort
icon (only shows once it has 2+ items directly inside it), click it,
confirm. Sorts that Section's direct contents alphabetically by name —
folders and nested Sections together, by whatever's actually in there.
Deliberately one level at a time rather than recursive, so it stays
predictable: a nested Section's own contents aren't touched unless you
sort that one too.

**Drag a real folder in from Explorer** — creates and links it in one
step, instead of the old two-step "create an empty folder in Disc, then
manually browse for a directory." Drop it at a panel's top level, onto a
Section's header (nests it right in, even while collapsed), or right
between two existing folders — it lands wherever you drop it. The
folder's name comes straight from the actual directory name. Dropping
several folders at once works too. Disc checks that what you dropped is
actually a directory before creating anything, so a stray file dragged
in alongside a folder just gets quietly skipped rather than creating a
broken, unlinkable entry.

**Drag folders between groups** — grab any folder (or Section) and drop
it into a different group's panel, not just reorder it within one. It
keeps everything about it exactly as it was — color, linked directory,
tags on its tracks, Section membership — only which group it belongs to
changes. This works by reading the dragged item's id from the browser's
native drag data at drop time rather than from React state, since two
different groups are two entirely separate panel instances that can't
see each other's local state directly.

**Misc. Music removed** — the "Music Folder" path picker and the
"Misc. Music" system folder are gone from the sidebar; Favorites is the
only one left. Worth being precise about what this does and doesn't do:
it removes the *browsing UI* for that root folder. If you'd already set
one, Disc doesn't delete anything or stop scanning it in the background —
there's just no dedicated way to browse it anymore, so any of its tracks
that aren't otherwise inside a linked custom folder would only surface
through Global Search rather than a dedicated folder view. Given
everything now lives in linked, named folders anyway, that's very
unlikely to matter in practice — but I didn't want to quietly claim
something was fully gone if it technically isn't.

**Folder groups — separate, dockable panels instead of one "Folders"
panel** — this is the biggest structural change in the app so far, so
worth explaining properly. What used to be one "Folders" panel with
dividers inside it for loose visual grouping is now a system of fully
independent panels: click ⊞ next to any group's name to spin up a whole
new one — its own panel, draggable/dockable absolutely anywhere, same as
Library or Details. Nothing stops you from putting a "Music" group on the
left and a "Sound Effects" group on the right, or stacked as tabs, or
wherever else makes sense for how you work. Double-click a group's name
to rename it. Delete a group (🗑, only on groups you created — the
original one, home to the Music Folder picker and Misc. Music/Favorites,
can't be deleted) and you get a confirmation dialog, then an "Undo" toast
at the bottom of the screen for about 8 seconds after — both a
confirmation step and a real undo, not just one or the other. The
original group defaults to the name "Sounds." Everything else about
folders (colors, linking a directory, drag-to-reorder, right-click
export/delete/unlink) works exactly the same as before, just scoped to
whichever group's panel you're in.

One honest note on this one: it leans on a couple of dockview APIs (live
panel-title updates when renaming, and passing custom data to a
dynamically-created panel) that I couldn't verify by actually running the
built app — I don't have a way to launch Disc myself and confirm real
runtime behavior, especially the *first* time it exists in this codebase.
I built it against what I'm confident is dockview's documented,
intended way to do this, and every piece has a sensible fallback if
something doesn't behave exactly as expected (worst case: a renamed
group's tab doesn't update its title live, but the in-panel header — the
thing you actually read — is always correct regardless). If a freshly
created group's panel doesn't render quite right the first time you try
it, that's the part to flag.

**Default layout** — right-click any saved Layout preset (▦ Layout in the
title bar) for "Set as Default," marked with a ★. That layout now loads
automatically every time Disc starts, instead of the built-in starting
arrangement. Only one preset can be the default at a time — setting a new
one replaces the old; deleting the current default preset clears it back
to the built-in layout rather than pointing at something that no longer
exists.

**Smooth waveform loading** — no more placeholder of any kind. A track's
waveform area is just blank while it decodes, then pops in — fading from
0 to full opacity while sliding up slightly, ease-out, about a quarter
of a second. No flash, no loading strip to design around; if several
rows finish decoding at slightly different times (the normal case),
they each just pop in individually, which reads as natural rather than
janky. Same in the Details panel.

**Themed dropdowns** — every dropdown in Disc (Key filter, Sort, the Key
field in Details, Memory limit, Decode speed) is now a custom-built
component instead of a native `<select>`. Worth knowing why: native
`<select>` lets you style the closed box, but the popup list of options
is rendered by the OS/browser and mostly ignores CSS — that's why it used
to show up with a plain white background no matter what theme was active.
The replacement (`Dropdown.jsx`) is fully themed and shared everywhere,
so this can't quietly resurface in some other dropdown later.

**Motion design** — every button, input, folder row, and track row now
transitions smoothly on hover instead of snapping, with a bit of tactile
press feedback (a subtle scale-down) on click. Every modal, context menu,
and dropdown (there are ~18 of them) now eases in — modals with a
slightly more deliberate scale+fade since they're a bigger context
switch, small popovers with a quicker, lighter fade+slide since they're
a frequent, lightweight interaction. The multi-select batch action bar
slides in when it appears. All of it is real CSS (`transition`/
`animation`, all GPU-friendly properties — opacity, transform, color),
nothing JS-driven, so it's cheap and won't fight with anything else
going on. And it's exactly why the **Reduce Motion** toggle now actually
does something: everything above is defined through one shared set of
keyframes/rules, so that single toggle genuinely turns all of it off,
rather than there being nothing there to reduce.

**Performance settings (⚙ Settings)** — Memory limit (from before) and
now **CPU threads**, sitting right next to it since both work the same
way: a startup-time setting that requires restarting Disc to apply. Worth
being honest about what this actually is, since "use more CPU" doesn't
map onto Electron as cleanly as "use more RAM" does — there's no simple
"use N cores" switch. What this raises is Node's internal thread pool
size (`UV_THREADPOOL_SIZE`), which governs how many actual disk reads can
happen at once underneath the scenes — your audio files, folder scans.
It's genuinely different from the Decode speed setting in Preload Library
below: that controls how many tracks *Disc's own code* processes at once;
this controls how many *disk reads* the system can do at once underneath
that, and can help when those two are working together, like a
high-concurrency Preload run on a fast SSD. It does **not** speed up
audio decoding itself — that's handled by Chromium's own internal
threading, which manages itself and isn't something exposed to tune here.
Shows your system's actual logical core count for reference, with a
"Match my CPU" option built from it.

**Preload Library (⚙ Settings)** — walks your whole library and eagerly
decodes every track's waveform and BPM/Key, instead of waiting for you to
scroll past or open each one. A "Decode speed" option lets you
temporarily raise how many files get read/decoded at once — Normal (3,
the same safe default used everywhere else in Disc), up to Maximum (16)
— purely for the duration of this run; normal browsing (scrolling
through the library) always stays at the conservative default
afterward, so bumping this up for a preload run can't make regular
scrolling feel janky later. Shows live progress and a rough time
estimate, keeps running even if you close the Settings modal (it lives
at the app level, not tied to the modal), and can be cancelled mid-run.
There's also a small live percentage badge on the ⚙ button itself so you
can glance at progress without reopening Settings. Skips video clips
(no analysis pipeline for those) and anything already cached. Good for
kicking off before you step away — come back and BPM/Key sort, filtering,
Find Similar, and the Duplicates scan will all have full data to work
with instead of only whatever you'd happened to open.


**Edit custom themes** — right-click any custom theme in the theme
switcher for Edit (reopens the theme creator pre-filled, live-previews as
you adjust it, same eyedropper-safe color pickers) and Delete. The little
× next to each custom theme still works too, for quick deletes.

**Appearance settings (⚙ Settings → Appearance)** — four display
preferences that layer on top of whichever theme is active, apply
instantly, and don't need a restart:
- **Spill** — a soft, colored glow with two layers (a bright core plus a
  much softer, wider bleed — a neon-tube look, not a flat single-blur
  shadow) around every accent-colored button/highlight, *and* around
  every folder/tag/collection/theme color dot in the app, each glowing in
  its own color rather than the single accent color. The dot version uses
  a smaller, more restrained radius than the button version on purpose —
  color dots are small and often packed close together (the folder list),
  so keeping that radius modest means neighboring glows blend softly into
  each other at the edges instead of turning into a muddy mess. Has its
  own intensity slider. (Note: this replaced the earlier "Bloom" setting
  — if you had that enabled before, you'll want to re-enable Spill once
  after updating, since the two aren't quite the same effect.)
- **Gradient backgrounds** — panels and backgrounds get a subtle gradient
  instead of a flat color, derived from your current theme (built-in or
  custom — both are handled correctly, since custom themes have no CSS
  fallback to recover a flat color from once it's been gradiented, so
  Disc keeps a separate stable record of each theme's true flat colors
  behind the scenes). Auto angle (top-to-bottom) or set your own, plus an
  intensity slider.
- **Clean mode** — removes rounded corners app-wide for a sharper, flatter
  look.
- **Reduce motion** — turns off transitions and animations throughout the
  app.

**Find Similar + Vibe** — open a track in Details and hit "Find Similar" to
rank the rest of your library by how similar it sounds: BPM closeness, key
relatedness, a timbral "chroma shape" comparison, brightness/energy, and
shared tags (weighted highest, since your own tagging beats anything Disc
can infer). Worth being upfront about scope: this is **not** genre
detection — that needs a trained ML model, which isn't something this app
has. What it does have is honest, real audio features combined into a
similarity score, plus a transparent "Low/Medium/High energy ·
Dark/Balanced/Bright" vibe readout built from two real measurements
(zero-crossing rate and RMS), clearly labeled as what it is. Like the
Duplicates feature, this only ranks tracks that have already been
opened/analyzed.

**WAV support** — `.wav` files are fully first-class alongside mp3s, not
a partial addition like `.mov` below: waveform display, BPM/Key
detection, Find Similar, tags, notes, everything, since WAV is just
another format the Web Audio pipeline already decodes natively. One
honest heads-up: WAV is uncompressed, so files run much larger than an
equivalent mp3 — a very large/long WAV will take a bit longer to read
into memory for playback than the same track as an mp3 would, simply
because there's more data to move, not because of anything Disc-specific.

**MOV support** — `.mov` clips now show up in your library alongside
mp3s/wavs: tag them, note them, favorite them, add them to Collections,
drag them straight into Premiere, all the organizational stuff works
exactly the same. What doesn't: Disc has no video-aware decode/playback
pipeline, so there's no waveform, no preview playback, and no
BPM/Key/Vibe analysis for video clips — that's a genuinely different
feature (needs a `<video>` element and a different reading strategy for
large files, not the audio pipeline this app is built around), so rather
than build something unreliable, video rows show a clear placeholder
instead and the Play button is disabled with an explanatory tooltip.

**Command palette (Ctrl/Cmd+K, or the ⌘ title bar button)** — jump to any
folder, collection, or track by typing, or run common actions (Settings,
Shortcuts, Library Health, Compact Mode, Pin on Top, Choose Music Folder,
Play All / Shuffle All) without touching the mouse. Arrow keys to
navigate, Enter to run, Escape to close.

**Remappable shortcuts** — every shortcut below can be rebound: open the
shortcuts list (⌨ in the title bar, or `?`), click a binding, press
whatever key you want instead. Rebinding a key that's already in use
automatically clears it from the other action, so two things can never
silently share a key. Ctrl/Cmd+K (command palette) is the one exception —
it's fixed, matching convention elsewhere.

**Manual BPM/Key override** — open a track in Details and both fields are
now directly editable, not just auto-detected. A "manual" badge shows when
you've overridden a value, with a ↺ to go back to the detected one.
Filtering and sorting by BPM/Key both respect your overrides.

**Library Health Dashboard (🩺 in the title bar)** — one screen showing
counts of untagged tracks, tracks with no BPM/Key yet, missing/unreachable
tracks, and likely duplicates, each with a "View" button that filters the
whole library (across every folder) down to just that category.

**Collections** — a second kind of grouping, separate from Folders.
Folders map to real directories on disk; Collections are lightweight
virtual buckets that can pull tracks from anywhere, with no filesystem
link — good for something like "Music for Episode 12" that you clear out
once the project ships. Add tracks via right-click → "+ Add to
Collection" (works from a single track or a multi-selection), remove via
the same right-click menu while viewing that collection. Collections is
its own dockable panel (docked below Folders by default) — drag its tab
anywhere, resize it, or pop it out like any other panel via Layout
presets. Create, rename, recolor, delete — same patterns as Folders.

**Smarter duplicate detection** — beyond exact file-size matches, Disc now
also compares the actual waveform shape (cosine similarity on the peak
data it already caches) for tracks with a close duration, catching a
re-encoded or renamed copy that doesn't share a file size. The "shape"
check only considers tracks you've already opened/scrolled past (same
lazy-decode design as everywhere else) — the Duplicates toggle re-scans
whenever you flip it, so browsing more of the library and toggling again
picks up newly-decoded waveforms.

**Notes** — a freeform text field on each track in Details (e.g. "used in
cold open of ep 5, don't touch till Q3"). Autosaves on blur.

**Multi-select** — shift-click for a range, ctrl/cmd-click to toggle
individual tracks. A batch action bar appears with **Favorite/Unfavorite**,
**+ Tag** (existing or new), and **Move to folder** (physically moves the
files on disk into any linked folder or the main music folder).

**Sort** — by folder order (default), name, date added (from the file's
own creation date on disk), duration, size, or BPM, with an ascending/
descending toggle. Duration/BPM sort put not-yet-decoded/analyzed tracks
at the bottom rather than scattering them — and since those only get
decoded/analyzed as you actually view them, the order can lag a little
until more of the library's been opened at least once.

**Missing-file detection** — if a linked folder's directory goes
unreachable (e.g. an external or network drive gets unplugged), its
tracks stay visible — grayed out with a "⚠ Missing" badge and a banner at
the top — instead of silently vanishing. They come back automatically
once the drive's reconnected.

**Duplicate detection** — the "⧉ Duplicates" toggle in the toolbar filters
to tracks that share an exact file size with another track anywhere in
the library (a fast, decode-free heuristic — two different mp3s matching
in size by coincidence is very unlikely).

**Keyboard shortcuts** — Space to play/pause, ←/→ to seek 5s, ↑/↓ for
volume, `/` to jump to search, N/P for next/previous, S for shuffle. Click
the ⌨ icon in the title bar (or press `?`) for the full list. All of them
are ignored while you're typing anywhere, so they won't fight with normal
typing or the BPM slider's own arrow-key behavior.

**Copy path / Reveal in Explorer / Delete** — right-click any track for
Copy File Path, Reveal in Explorer, and Delete Song (moves it to the OS
Trash/Recycle Bin, so it's recoverable, not gone forever — armed on the
first click, only deletes on the second, same as tag deletion). Handy
paired with the Duplicates filter for cleaning up straight from Disc.

**Import Files** — a "+ Import" button in the toolbar (and on the empty
"No mp3s found" state) opens a native file picker to add mp3s, as a
reliable alternative if OS-level drag-and-drop into the window ever stops
working — see the note below on third-party window-manager tools.

**Compact mode** — click the ⤡ icon in the title bar to shrink Disc down
to a small bar (search + Now Playing) tucked in the bottom-right corner of
your screen, out of Premiere's way. Click ⤢ to restore.

### A note on WindHawk / third-party window-manager tools

Tools like WindHawk work by hooking into low-level Windows APIs across
every running process — including things like window borders, drag/move
behavior, and window messaging. Disc's window is also custom (frameless,
with its own drawn title bar) to support full theming, so it's more
exposed than a typical app to conflicts with mods that touch the same
territory. That said — Disc's own drag-and-drop-into-the-library had a
real bug of its own (see below), so if something still seems off after
ruling that out, it's worth checking for a genuine Disc issue before
assuming it's a WindHawk conflict.

### Drag-and-drop history: the `file.path` deprecation

If tracks you drag in from Explorer don't get added and nothing visibly
happens, it's likely because Electron deprecated the old `File.path`
property (around v32) in favor of `webUtils.getPathForFile()`. This
project now uses the new API — but flagging it here in case anyone reading
this later hits the same silent-failure symptom after bumping Electron:
`file.path` will just quietly come back empty rather than throwing an
error, which makes it an easy regression to miss.

### Packaging note: why the export feature uses `adm-zip`

The folder-export feature originally used `archiver` for ZIP creation.
That caused `Cannot find module 'archiver-utils'` errors in the *built*
app (not in `npm run dev`) — `archiver`'s dependency tree is a few
packages deep (`archiver` → `zip-stream` → `archiver-utils`), and
electron-builder's dependency-detection didn't fully carry that nested
tree into the packaged output. Disabling ASAR packaging (see below) was
tried first and didn't fix it, which confirmed the real problem was the
dependency tree itself, not ASAR. The actual fix was switching to
`adm-zip`, which has **zero dependencies** — nothing nested for a
packaging step to miss. If you ever need a similar capability elsewhere,
prefer a zero/minimal-dependency package for anything that has to survive
electron-builder's packaging, since deeper trees are exactly where this
kind of bug tends to hide, and it's not something I can catch by
reasoning about the code alone — it only shows up in the actual built app.

ASAR is still left disabled (`"asar": false` in `package.json`'s `build`
config) even though it turned out not to be the culprit here — there was
no strong reason to re-enable it, and leaving it off removes an entire
category of Electron packaging risk for whatever gets added next.

## Project structure

```
disc/
  Create Desktop Shortcut.bat / create-desktop-shortcut.ps1 / launch-disc.vbs
    — dev-mode shortcut creation (see above)
  electron/
    main.js          — frameless window mgmt (no native menu bar), folder
                        picker, mp3 scan, watchers, drag-out
    preload.cjs       — CommonJS bridge (sandboxed preload can't load ESM)
    assets/            — drag-cursor icon + multi-res app icon (.ico)
  src/
    App.jsx            — all top-level state; wires everything into context
    context/
      DiscContext.jsx    — carries live state into dockview panels
    themes/
      themes.js / themes.css     — built-in themes
      colorMath.js                 — luminance helpers
      customThemeEngine.js          — derives a full theme from 4 colors
      customThemes.js                — save/load user-created themes
    tags/
      tagStorage.js       — save/load tag vocabulary + per-track assignment
    notes/
      noteStorage.js       — save/load per-track freeform notes
    collections/
      collectionStorage.js  — save/load virtual track collections
    shortcuts/
      shortcutStorage.js     — default + user-customized keyboard bindings
    audio/
      waveform.js          — waveform peaks, shared AudioContext, concurrency cap
      analysis.js            — BPM/Key (Goertzel/Krumhansl) + chroma/brightness/energy
      overrideStorage.js       — save/load manual BPM/Key overrides
      effectiveAnalysis.js      — merges auto-detected + manual override values
      duplicates.js               — exact-size + waveform-shape duplicate detection
      similarity.js                 — Find Similar scoring (BPM/key/chroma/tags)
      downsamplePeaks.js              — adapts peak count to available pixel width
    layouts/
      layoutPresets.js    — save/load named dockview layouts
    hooks/
      useVirtualRows.js    — windowed track-list rendering
      useElementWidth.js     — ResizeObserver-backed width tracking
    utils/
      format.js             — size/duration/filename formatting
      paths.js                — path-prefix check for linked folders
      search.js                — shared "search everywhere" filtering logic
      missingTracks.js          — shared "is this track's folder unreachable" check
    components/
      Icon, Dropdown, TitleBar, WindowControls, WindowsMenu, ThemeSwitcher,
      ThemeCreatorModal, ThemeContextMenu, LayoutPresets, VolumeControl,
      FolderGroupPanel, CollectionsPanel, FolderCreateMenu,
      FolderContextMenu, ColorPicker, ContextMenu, ConfirmModal,
      LibraryToolbar, LibraryPanel, BatchActionBar, NowPlayingBar,
      TrackRow, TrackContextMenu, DetailsPanel, TagCreateMenu,
      TagAssignMenu, TagContextMenu, ShortcutsModal, SettingsModal,
      LibraryHealthModal, CommandPalette, PomodoroPanel, CompactView

```

## Roadmap (next up)

1. **Organization actions** — rename the actual mp3/mov files from Disc
   (delete already works), and dragging tracks directly into custom
   folders to assign them (right now folder-linking is directory-based,
   not per-track).
2. **Usage tracking & credit generation** — mark a track "used in project
   X" with a date, so you can avoid reusing music too soon, and
   auto-generate a "music used in this video" credit block from your
   files' artist metadata for video descriptions.
3. **Video preview for .mov clips** — actual waveform-equivalent
   visualization (probably thumbnail frames) and in-app preview playback,
   which needs a `<video>`-based pipeline distinct from the audio one
   this app is built around. Right now .mov clips are fully organizable
   (tags, notes, favorites, Collections, drag-to-Premiere) but not
   previewable inside Disc.
4. Optionally: a background "analyze this folder" action for bulk BPM/Key
   detection, if searching by BPM/Key across a whole unopened library
   becomes something you want often (traded off against library speed
   for now).

Let me know what's next.
