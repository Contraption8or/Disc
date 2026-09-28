import { resolveTrackKey } from "./trackKey.js";
import { resolveFolderPath } from "./folderPath.js";

// Phase 3 of Studio Sync (see docs/collab-sync-scope.md): replays every
// device's event log into one merged state, deterministically — every
// machine that runs this over the same set of events ends up with the
// exact same result, regardless of which device produced which event or
// what order the files happened to be read in.
//
// events: flat array of { device, seq, ts, type, payload } from every
// device's .jsonl file, already parsed and combined by the caller.
// context: { musicFolderPath, customFolders } — *this* machine's own
// folder setup, used to resolve trackKey/relativePath back into local
// absolute paths (a folder-scoped trackKey only resolves if a local
// customFolder with that exact name is currently linked — see
// resolveTrackKey's own doc comment for why that can legitimately fail).
export function mergeEvents(events, context) {
  const sorted = [...events].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.device < b.device ? -1 : a.device > b.device ? 1 : 0;
  });

  const tagsById = new Map();
  const trackTagsByKey = new Map(); // trackKey -> Set<tagId>
  const collectionsById = new Map(); // id -> { id, name, color, trackKeys: Set }
  const notesByKey = new Map(); // trackKey -> text
  const foldersById = new Map();
  const groupsById = new Map();

  function trackTagSet(trackKey) {
    let set = trackTagsByKey.get(trackKey);
    if (!set) {
      set = new Set();
      trackTagsByKey.set(trackKey, set);
    }
    return set;
  }

  for (const event of sorted) {
    const p = event.payload || {};
    switch (event.type) {
      case "tag.create":
        tagsById.set(p.tagId, { id: p.tagId, name: p.name, color: p.color });
        break;
      case "tag.rename":
        if (tagsById.has(p.tagId)) tagsById.get(p.tagId).name = p.name;
        break;
      case "tag.recolor":
        if (tagsById.has(p.tagId)) tagsById.get(p.tagId).color = p.color;
        break;
      case "tag.delete":
        tagsById.delete(p.tagId);
        trackTagsByKey.forEach((set) => set.delete(p.tagId));
        break;
      case "tag.merge":
        if (p.fromTagId !== p.intoTagId) {
          trackTagsByKey.forEach((set) => {
            if (set.has(p.fromTagId)) {
              set.delete(p.fromTagId);
              set.add(p.intoTagId);
            }
          });
          tagsById.delete(p.fromTagId);
        }
        break;
      case "tag.assign":
        if (tagsById.has(p.tagId)) trackTagSet(p.trackKey).add(p.tagId);
        break;
      case "tag.unassign":
        trackTagsByKey.get(p.trackKey)?.delete(p.tagId);
        break;

      case "collection.create":
        collectionsById.set(p.collectionId, {
          id: p.collectionId,
          name: p.name,
          color: p.color ?? null,
          trackKeys: new Set(),
        });
        break;
      case "collection.rename":
        if (collectionsById.has(p.collectionId)) collectionsById.get(p.collectionId).name = p.name;
        break;
      case "collection.recolor":
        if (collectionsById.has(p.collectionId)) collectionsById.get(p.collectionId).color = p.color;
        break;
      case "collection.delete":
        collectionsById.delete(p.collectionId);
        break;
      case "collection.addTrack":
        collectionsById.get(p.collectionId)?.trackKeys.add(p.trackKey);
        break;
      case "collection.removeTrack":
        collectionsById.get(p.collectionId)?.trackKeys.delete(p.trackKey);
        break;

      case "note.set":
        if (p.text && p.text.trim()) notesByKey.set(p.trackKey, p.text);
        else notesByKey.delete(p.trackKey);
        break;

      // BPM/Key overrides don't exist in this codebase — but real logs on
      // both machines already contain these from before the merge (this
      // fork's original app had them). Recognized-and-ignored rather than
      // falling through to `default` so it's clear this is deliberate, not
      // an oversight. Never delete them from the logs (another device's
      // older build may still care about them) and never emit new ones.
      case "override.set":
      case "override.clear":
        break;

      case "folderGroup.create":
        groupsById.set(p.groupId, { id: p.groupId, name: p.name, deletable: true });
        break;
      case "folderGroup.rename":
        if (groupsById.has(p.groupId)) groupsById.get(p.groupId).name = p.name;
        break;
      case "folderGroup.delete":
        groupsById.delete(p.groupId);
        break;

      case "folder.create":
        foldersById.set(p.folderId, {
          id: p.folderId,
          type: p.kind === "section" ? "divider" : "folder",
          name: p.name,
          color: p.color ?? null,
          folderPath: null,
          groupId: p.groupId,
          sectionId: p.sectionId ?? null,
          collapsed: false,
        });
        break;
      case "folder.rename":
        if (foldersById.has(p.folderId)) foldersById.get(p.folderId).name = p.name;
        break;
      case "folder.recolor":
        if (foldersById.has(p.folderId)) foldersById.get(p.folderId).color = p.color;
        break;
      case "folder.delete":
        foldersById.delete(p.folderId);
        // Un-nest anything that was inside it, same as the local handler.
        foldersById.forEach((f) => {
          if (f.sectionId === p.folderId) f.sectionId = null;
        });
        break;
      case "folder.link": {
        const folder = foldersById.get(p.folderId);
        if (folder) {
          const resolved = resolveFolderPath(p.relativePath, context.musicFolderPath);
          if (resolved) folder.folderPath = resolved;
        }
        break;
      }
      case "folder.unlink":
        if (foldersById.has(p.folderId)) foldersById.get(p.folderId).folderPath = null;
        break;

      default:
        break; // Unknown event type (e.g. a newer version wrote it) — ignore, don't crash.
    }
  }

  // --- Resolve trackKeys back into this machine's absolute paths --------
  const trackTags = {};
  trackTagsByKey.forEach((tagIdSet, trackKey) => {
    const trackId = resolveTrackKey(trackKey, context);
    if (!trackId || tagIdSet.size === 0) return;
    trackTags[trackId] = Array.from(tagIdSet);
  });

  const collections = Array.from(collectionsById.values()).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    trackIds: Array.from(c.trackKeys)
      .map((key) => resolveTrackKey(key, context))
      .filter(Boolean),
  }));

  const trackNotes = {};
  notesByKey.forEach((text, trackKey) => {
    const trackId = resolveTrackKey(trackKey, context);
    if (trackId) trackNotes[trackId] = text;
  });

  return {
    tags: Array.from(tagsById.values()),
    trackTags,
    collections,
    trackNotes,
    folders: Array.from(foldersById.values()),
    folderGroups: Array.from(groupsById.values()),
  };
}
