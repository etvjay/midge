/**
 * Retry a call that the public RPC rejected for rate limiting (HTTP 429 / "rate limit"), with a pause that grows each time. Any other error is
 * thrown at once. A 429 means the node refused the request before doing anything, so retrying a transaction broadcast is safe.
 */
export async function retryOnRateLimit(fn, { tries = 10, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), baseMs = 1500 } = {}) {
  for (let i = 0; ; i += 1) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1 || !/429|rate limit/i.test(String(e?.message ?? e))) throw e;
      await sleep(baseMs * (i + 1));
    }
  }
}
