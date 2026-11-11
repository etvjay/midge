import os from 'node:os';
import path from 'node:path';

/**
 * The environment for running the Phala CLI through npx: the caller's environment plus a private npm cache. The shared cache in the home
 * directory can hold directories owned by another user (one did on 2026-11-11, after something was run as root), and then npx fails with a
 * permission error for some packages and not others, which is how the reaper that guards against forgotten VMs started crashing. A cache of
 * our own cannot be broken by that. MIDGE_NPM_CACHE overrides the location.
 */
export function npxEnv(env = process.env, home = os.homedir()) {
  return { ...env, npm_config_cache: env.MIDGE_NPM_CACHE || path.join(home, '.cache', 'midge-npx') };
}
