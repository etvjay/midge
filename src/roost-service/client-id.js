import net from 'node:net';

/**
 * Who is calling, for rate limiting. By default: the address that connected. Behind a proxy of ours that address is always the
 * proxy, so every user would share one allowance; the forwarded header names the real client but anyone can write it. The safe rule:
 *
 *   - If the connection does not come from one of `trustedProxies`, ignore X-Forwarded-For entirely.
 *   - If it does, read the header from the RIGHT (each proxy appends the address it saw), skip our own proxies, and take the first
 *     address that is not ours. Entries an attacker prepends sit to the left of that one and are never reached.
 *   - Anything that is not a valid IP address is not believed: fall back to the connecting address.
 */
const normalise = (addr) => {
  if (typeof addr !== 'string') return null;
  let a = addr.trim().toLowerCase();
  if (a.startsWith('::ffff:') && net.isIPv4(a.slice(7))) a = a.slice(7);
  return net.isIP(a) ? a : null;
};

export function createClientResolver({ trustedProxies = [] } = {}) {
  const trusted = new Set(trustedProxies.map(normalise).filter(Boolean));
  return (req) => {
    const peer = normalise(req.socket.remoteAddress) ?? 'unknown';
    if (trusted.size === 0 || !trusted.has(peer)) return peer;
    const header = req.headers['x-forwarded-for'];
    if (typeof header !== 'string') return peer;
    const hops = header.split(',').map(normalise);
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      if (hops[i] === null) return peer; // a hop we cannot read: do not guess
      if (!trusted.has(hops[i])) return hops[i];
    }
    return peer;
  };
}
