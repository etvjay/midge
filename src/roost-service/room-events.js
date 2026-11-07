/**
 * A small in-memory event hub with a replay ring. Events have a rising integer id, so a client that reconnects with Last-Event-ID
 * is caught up on what it missed (as far back as the ring reaches). A subscriber that throws cannot stop the others.
 */
export function createEventHub({ size = 100 } = {}) {
  const ring = []; const subs = new Set(); let seq = 0;
  return {
    publish(type, data) {
      const event = { id: ++seq, type, data, at: Date.now() };
      ring.push(event); if (ring.length > size) ring.shift();
      for (const fn of [...subs]) { try { fn(event); } catch { /* one broken subscriber must not stop the rest */ } }
      return event;
    },
    since: (id) => ring.filter((e) => e.id > id),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get size() { return subs.size; },
  };
}
