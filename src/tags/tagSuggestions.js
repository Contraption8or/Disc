// "Did you mean…?" support for creating tags: as someone types a new tag
// name, find existing tags they might actually mean — a typo of one
// ("whoosh" vs "wooosh"), a plural/singular difference, or just the start of
// one — so they can reuse it instead of making a near-duplicate.

// Lowercase, accent-stripped, punctuation collapsed to single spaces, so
// "Whoosh!" / "  whoosh " / "Whöösh" all compare as the same thing.
export function normalizeTagName(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Optimal-string-alignment edit distance: insert / delete / substitute /
// swap-two-adjacent-letters each cost 1 — the swap matters because
// transposed letters ("wohosh") are one of the most common typos. Bails out
// early once the distance can't be within `max`.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Longer words can be further off and still be an obvious typo; very short
// ones can't (a 3-letter tag two edits away is a different word).
function allowedDistance(length) {
  if (length <= 3) return 1;
  if (length <= 7) return 2;
  return 3;
}

// The existing tag whose name matches the typed text exactly (ignoring
// case/punctuation), if any — creating another would be a duplicate.
export function findExactTag(input, tags) {
  const q = normalizeTagName(input);
  if (!q) return null;
  return tags.find((t) => normalizeTagName(t.name) === q) || null;
}

// Up to `limit` existing tags that look like what's being typed, best first:
// an exact match, then tags that start with it (autocomplete), then tags
// that contain it, then near-misses by edit distance.
export function suggestTags(input, tags, limit = 4) {
  const q = normalizeTagName(input);
  if (q.length < 2) return [];
  const scored = [];
  for (const tag of tags) {
    const n = normalizeTagName(tag.name);
    if (!n) continue;
    let score = null;
    if (n === q) score = 0;
    else if (n.startsWith(q)) score = 1;
    else if (n.includes(q)) score = 2;
    else {
      const max = allowedDistance(Math.max(q.length, n.length));
      const dist = editDistance(q, n, max);
      if (dist <= max) score = 3 + dist;
    }
    if (score !== null) scored.push({ tag, score });
  }
  scored.sort((x, y) => x.score - y.score || x.tag.name.localeCompare(y.tag.name));
  return scored.slice(0, limit).map((s) => s.tag);
}
