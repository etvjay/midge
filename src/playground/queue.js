import crypto from 'node:crypto';

/**
 * The playground's line. One round runs at a time, because the room holds one round at a time. Everything here is plain data and a clock, so it is
 * tested without a network.
 *
 *  - A person (an address) holds at most one live ticket, so a second tab gets the same ticket and not a second turn.
 *  - Joining is refused, with a plain reason, when the funder is low, the day's cap is reached, the address has used its hour, or the line is full.
 *  - A waiting ticket expires if it is not polled for ten minutes. The active ticket expires if the visitor has not signed within ten minutes.
 *    A signed round is never expired by the line, because the chain steps after it must finish and clean up.
 */
export class QueueRefusal extends Error {
  constructor(reason, message) { super(message); this.name = 'QueueRefusal'; this.reason = reason; }
}

const HOUR = 3600 * 1000; const DAY = 24 * HOUR;

export function createQueue({ now = Date.now, maxWaiting = 8, perAddressPerHour = 3, perDay = 60, ticketTtlMs = 10 * 60 * 1000, funderFloor = null, secondsPerRound = 90 } = {}) {
  const tickets = new Map(); // ticket -> { address, status, touchedAt, activeSince, signed }
  const waiting = []; // ticket ids in order
  const joins = []; // { address, t } for every new ticket, for the hour and day limits
  let active = null;
  const live = (t) => t && (t.status === 'waiting' || t.status === 'active');

  const placeOf = (id) => {
    const t = tickets.get(id);
    if (!t) return null;
    if (t.status === 'active') return { status: 'active', position: 0, etaSeconds: 0 };
    if (t.status === 'waiting') { const i = waiting.indexOf(id); return { status: 'waiting', position: i + 1, etaSeconds: secondsPerRound * (i + (active ? 1 : 0)) }; }
    return { status: t.status, position: 0, etaSeconds: 0 };
  };

  return {
    join({ address, funderBalanceYocto }) {
      for (const [id, t] of tickets) if (t.address === address && live(t)) { t.touchedAt = now(); return { ticket: id, position: placeOf(id).position }; }
      if (funderFloor !== null && BigInt(funderBalanceYocto ?? 0) < BigInt(funderFloor)) throw new QueueRefusal('funder-low', 'The playground\'s funding account is low right now, so no new rounds are being started. Please try again later.');
      const t = now();
      if (joins.filter((j) => j.t > t - DAY).length >= perDay) throw new QueueRefusal('daily-cap', 'The playground has reached its limit of rounds for today. Please try again tomorrow, or read the recorded runs on the Replay page.');
      if (joins.filter((j) => j.address === address && j.t > t - HOUR).length >= perAddressPerHour) throw new QueueRefusal('address-limit', `Each address can run ${perAddressPerHour} rounds an hour. Please try again later.`);
      if (waiting.length >= maxWaiting) throw new QueueRefusal('queue-full', 'The line is full right now. Please try again in a few minutes.');
      const id = crypto.randomBytes(16).toString('hex');
      tickets.set(id, { address, status: 'waiting', touchedAt: t, activeSince: null, signed: false });
      waiting.push(id); joins.push({ address, t });
      while (joins.length > 5000) joins.shift();
      return { ticket: id, position: waiting.length };
    },
    /** Starts the front ticket if nothing is active. Returns its id, or null. */
    next() {
      if (active || waiting.length === 0) return null;
      const id = waiting.shift(); const t = tickets.get(id);
      t.status = 'active'; t.activeSince = now(); active = id;
      return id;
    },
    finish(id, outcome = {}) {
      const t = tickets.get(id); if (!t) return;
      t.status = outcome.ok === false ? 'failed' : 'done'; t.outcome = outcome;
      if (active === id) active = null;
      const i = waiting.indexOf(id); if (i >= 0) waiting.splice(i, 1);
    },
    markSigned(id) { const t = tickets.get(id); if (t) t.signed = true; },
    touch(id) { const t = tickets.get(id); if (t) t.touchedAt = now(); },
    position(id) { return placeOf(id)?.position ?? null; },
    state(id) { return placeOf(id); },
    activeTicket() { return active; },
    /** Expires tickets and returns their ids, so the caller can clean up the active one. */
    sweep() {
      const t = now(); const gone = [];
      for (const [id, k] of tickets) {
        if (k.status === 'waiting' && t - k.touchedAt > ticketTtlMs) { k.status = 'expired'; const i = waiting.indexOf(id); if (i >= 0) waiting.splice(i, 1); gone.push(id); }
        else if (k.status === 'active' && !k.signed && t - k.activeSince > ticketTtlMs) { k.status = 'expired'; if (active === id) active = null; gone.push(id); }
      }
      return gone;
    },
  };
}
