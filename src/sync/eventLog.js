// Studio Sync's write side (see docs/collab-sync-scope.md): every shared
// mutation (tags, collections, notes, folders) appends an event to this
// device's own .jsonl file inside the shared music folder — in addition
// to, not instead of, today's localStorage write.
const SEQ_KEY = "disc.sync.seq";

function nextSeq() {
  const current = Number(localStorage.getItem(SEQ_KEY) || "0");
  const next = current + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

function makeEventId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Stamps a well-formed event object without queuing/sending it — used by
// the normal debounced path below, and by anything (like a one-time
// backfill) that needs to build a whole batch up front and send it with
// one direct, awaitable call instead.
export function buildSyncEvent(deviceId, type, payload, ts = Date.now()) {
  return {
    id: makeEventId(),
    device: deviceId,
    seq: nextSeq(),
    ts,
    type,
    payload,
  };
}

// Sends a batch immediately and awaits the result, bypassing the debounce
// queue entirely — for callers that need to know the write actually
// landed before doing something that depends on it (e.g. running a merge
// right after backfilling, which would otherwise race the normal 400ms
// debounce and read a stale log).
export async function writeSyncEventsNow(rootDir, deviceId, events) {
  if (!rootDir || !deviceId || !events?.length) return { ok: false };
  return window.disc?.appendSyncEvents(rootDir, deviceId, events);
}

// Batches rapid-fire mutations (e.g. batch-tagging 50 tracks at once) into
// one append call instead of racing dozens of concurrent IPC round-trips
// against the same file.
let pending = [];
let flushTimer = null;

function scheduleFlush(rootDir, deviceId) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const batch = pending;
    pending = [];
    flushTimer = null;
    if (batch.length === 0) return;
    window.disc
      ?.appendSyncEvents(rootDir, deviceId, batch)
      ?.then((result) => {
        if (!result?.ok) console.error("[disc-sync] append failed:", result);
      })
      ?.catch((err) => {
        console.error("[disc-sync] append IPC error:", err);
      });
  }, 400);
}

// context: { musicFolderPath, deviceId }. No-ops (and logs nothing) when
// either is missing — i.e. no music folder chosen yet, or device identity
// hasn't loaded — since there's nowhere shared to write to.
export function logSyncEvent(context, type, payload) {
  const rootDir = context?.musicFolderPath;
  const deviceId = context?.deviceId;
  if (!rootDir || !deviceId) return;
  pending.push({
    id: makeEventId(),
    device: deviceId,
    seq: nextSeq(),
    ts: Date.now(),
    type,
    payload,
  });
  scheduleFlush(rootDir, deviceId);
}
