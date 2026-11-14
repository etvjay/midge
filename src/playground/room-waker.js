/**
 * Starts the room's Phala machine when a visitor opens the playground, and stops it after it has been idle. Measured on 2026-11-13: stop takes about
 * 8 seconds to take the room offline, start takes 40 seconds to be healthy again, and a restarted room has a new settlement key and empty memory,
 * which the playground already tolerates because every round reads the key fresh. Compute is billed by the minute and stops when the stop request
 * arrives. Storage on the stopped machine is still billed (about $0.0028 an hour for the smallest disk), so stopping saves compute only.
 *
 * `phalaFetch(path, { method })` calls the Phala Cloud API and returns { ok, status, json }. The API's routes are POST /cvms/{id}/start and
 * /cvms/{id}/stop, with the key in an X-API-Key header.
 */
export function createRoomWaker({ phalaFetch, healthFetch = (url) => fetch(url, { signal: AbortSignal.timeout(4000) }), cvmId, roomUrl, now = Date.now, idleMs = 10 * 60 * 1000, healthTimeoutMs = 120_000, pollMs = 3000, failureCooldownMs = 30_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), isBusy = () => false }) {
  let state = 'unknown'; let lastTouch = now(); let starting = null; let failure = null; // { at, message }
  const healthy = async () => { try { return (await healthFetch(`${roomUrl}/healthz`)).ok === true; } catch { return false; } };
  const touch = () => { lastTouch = now(); };

  async function startAndWait() {
    state = 'starting';
    const r = await phalaFetch(`/cvms/${cvmId}/start`, { method: 'POST' });
    if (!r.ok && r.status !== 409) { // 409 means it is already starting or running
      const why = r.json?.detail || r.json?.error || `HTTP ${r.status}`;
      throw new Error(`The room could not be started (${String(why).slice(0, 120)}).`);
    }
    const t0 = now();
    while (now() - t0 < healthTimeoutMs) { if (await healthy()) { state = 'up'; touch(); return; } await sleep(pollMs); }
    throw new Error('The room did not become ready in time. Please try again in a minute.');
  }

  return {
    async warm() {
      if (starting) return starting;
      if (failure && now() - failure.at < failureCooldownMs) throw new Error(failure.message);
      starting = (async () => {
        try {
          if (await healthy()) { state = 'up'; touch(); return; }
          await startAndWait(); failure = null;
        } catch (e) { state = 'error'; failure = { at: now(), message: e.message }; throw e; }
        finally { starting = null; }
      })();
      return starting;
    },
    touch,
    async tick() {
      if (state !== 'up' || isBusy() || now() - lastTouch < idleMs) return;
      const r = await phalaFetch(`/cvms/${cvmId}/stop`, { method: 'POST' });
      if (r.ok) state = 'stopped';
    },
    status() { return { state, idleSeconds: Math.round((now() - lastTouch) / 1000) }; },
  };
}
