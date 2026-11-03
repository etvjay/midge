import { RoostEnclave } from './roost.js';
import { ModelSealedRoost } from './model-sealed-roost.js';

/**
 * Roost backends. Every backend answers the same calls:
 *   describe(), getSessionInfo(), getAttestationQuote(), submitSealedIntent(), aggregateAndClear()
 * aggregateAndClear() may be async; callers must await it.
 *
 *   local         in-process, exact arithmetic, inputs readable by whoever runs the process
 *   model-sealed  inputs sealed to a NEAR AI Cloud model's attested key, arithmetic by the model
 *   hosted        (planned) the same code as local, run inside a TEE we can attest; see docs/roost-tee-plan.md
 */
export const ROOST_BACKENDS = ['local', 'model-sealed'];

export function createRoost({ backend = process.env.MIDGE_ROOST_BACKEND || 'local', ...options } = {}) {
  switch (backend) {
    case 'local':
      return new RoostEnclave(options);
    case 'model-sealed':
      return new ModelSealedRoost(options);
    default:
      throw new Error(`Unknown Roost backend '${backend}'. Choose one of: ${ROOST_BACKENDS.join(', ')}`);
  }
}
