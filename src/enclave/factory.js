import { RoostEnclave } from './roost.js';
import { ModelSealedRoost } from './model-sealed-roost.js';

/**
 * Roost backends. Every backend answers the same calls:
 *   describe(), getSessionInfo(), getAttestationQuote(), sealIntent(), submitSealedIntent(), aggregateAndClear()
 * aggregateAndClear() may be async; callers must await it.
 *
 *   model-sealed  inputs sealed to a NEAR AI Cloud model's attested key; the operator holds ciphertext only.
 *                 The default whenever a NEAR AI key is configured.
 *   local         a keyless simulation. Exact arithmetic, but whoever runs the process can read every bid.
 *                 Used only when no key is configured, or when asked for by name (tests, offline demos).
 *   hosted        the same code as local, run inside a TEE we can attest (built and run on a real Phala TDX machine; it is served by src/roost-service, not created here); see deploy/roost/README.md
 */
export const ROOST_BACKENDS = ['model-sealed', 'local'];

let warned = false;

/** Decide which backend to use. 'auto' picks model-sealed when a NEAR AI key is available. */
export function resolveBackend({ backend, apiKey } = {}) {
  const requested = backend || process.env.MIDGE_ROOST_BACKEND || 'auto';
  if (requested === 'auto') {
    return (apiKey || process.env.NEARAI_API_KEY) ? { backend: 'model-sealed', fellBack: false } : { backend: 'local', fellBack: true };
  }
  if (!ROOST_BACKENDS.includes(requested)) {
    throw new Error(`Unknown Roost backend '${requested}'. Choose one of: auto, ${ROOST_BACKENDS.join(', ')}`);
  }
  return { backend: requested, fellBack: false };
}

export function createRoost({ backend, ...options } = {}) {
  const chosen = resolveBackend({ backend, apiKey: options.apiKey });
  if (chosen.fellBack && !warned) {
    warned = true;
    console.warn('[midge] Roost backend: local SIMULATION (no NEARAI_API_KEY). Bids are readable by this process. Set NEARAI_API_KEY for model-sealed mode.');
  }
  return chosen.backend === 'model-sealed' ? new ModelSealedRoost(options) : new RoostEnclave(options);
}
