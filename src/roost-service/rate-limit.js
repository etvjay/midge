/**
 * A fixed-window rate limiter. One instance can be shared by several doors (the rooms API and the MCP endpoint), so a client's
 * allowance is counted once, whichever door it uses. `now` is injectable for tests.
 */
export function createRateLimiter({ limit = 120, windowMs = 60_000, now = Date.now } = {}) {
  const buckets = new Map();
  return {
    limit, windowMs,
    take(client) {
      const t = now();
      if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k);
      let b = buckets.get(client);
      if (!b || b.resetAt <= t) { b = { count: 0, resetAt: t + windowMs }; buckets.set(client, b); }
      const allowed = b.count < limit;
      if (allowed) b.count += 1;
      return { allowed, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt, retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
    },
  };
}
