// Filters a track list by filename or assigned tag name. Shared so the
// full Library search and the Compact-mode mini search behave identically.
export function filterTracksByQuery(tracksList, query, tags, trackTags) {
  const q = query.trim().toLowerCase();
  if (!q) return tracksList;

  const matchingTagIds = new Set(
    tags.filter((t) => t.name.toLowerCase().includes(q)).map((t) => t.id)
  );

  return tracksList.filter(
    (t) =>
      t.fileName.toLowerCase().includes(q) ||
      (trackTags[t.id] || []).some((tagId) => matchingTagIds.has(tagId))
  );
}
