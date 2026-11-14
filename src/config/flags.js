// @ts-check
/**
 * Every environment switch that changes how a script or a service behaves, with its default, who owns it and when it should be reviewed for removal.
 * Switches only: secrets (API keys, private keys, tokens) are not listed here and never belong in this file. tests/flags.test.js fails when a code path
 * reads a MIDGE_, FLY_ or LAB_ variable that is not listed, when a listed flag is read nowhere, or when an entry has no owner or an invalid or past review date.
 *
 * @typedef {{ name: string, env: string, default: string, owner: string, removeBy: string, purpose: string }} Flag
 */

const OWNER = '@etvjay';

/** @type {Flag[]} */
export const FLAGS = [
  { name: 'offline', env: 'FLY_OFFLINE', default: '0', owner: OWNER, removeBy: '2027-06-30', purpose: '1 makes the verification scripts use the offline model and skip the chain.' },
  { name: 'mode', env: 'FLY_MODE', default: '(unset)', owner: OWNER, removeBy: '2027-06-30', purpose: 'Selects the backend the API server and the MCP server use.' },
  { name: 'envFile', env: 'MIDGE_ENV_FILE', default: '(unset)', owner: OWNER, removeBy: '2027-06-30', purpose: 'Path of the file the chain client reads its credentials from; it does not read .env on its own.' },
  { name: 'roostBackend', env: 'MIDGE_ROOST_BACKEND', default: 'auto', owner: OWNER, removeBy: '2027-06-30', purpose: 'Picks the room backend: auto, or a named one.' },
  { name: 'wasm', env: 'MIDGE_WASM', default: 'contracts/fly-coordinator release build', owner: OWNER, removeBy: '2027-06-30', purpose: 'The contract binary the deploy script uses.' },
  { name: 'signerWasm', env: 'MIDGE_SIGNER_WASM', default: 'contracts/fly-coordinator/target-testsigner build', owner: OWNER, removeBy: '2027-03-31', purpose: 'The test-signer contract build used by one live experiment.' },
  { name: 'rulesPrefix', env: 'MIDGE_RULES_PREFIX', default: 'm', owner: OWNER, removeBy: '2027-03-31', purpose: 'Contract account prefix for the payroll contract script (m for the test contract, c for production).' },
  { name: 'rulesGroup', env: 'MIDGE_RULES_GROUP', default: 'payroll-live-2', owner: OWNER, removeBy: '2027-03-31', purpose: 'Group the payroll contract script uses.' },
  { name: 'rulesTimeout', env: 'MIDGE_RULES_TIMEOUT', default: '100000', owner: OWNER, removeBy: '2027-03-31', purpose: 'Milliseconds the payroll contract script waits.' },
  { name: 'rulesExit', env: 'MIDGE_RULES_EXIT', default: '0', owner: OWNER, removeBy: '2027-03-31', purpose: '1 makes the payroll contract script exit the group at the end.' },
  { name: 'rulesEvidence', env: 'MIDGE_RULES_EVIDENCE', default: 'docs/canonical/contract-payroll-evidence.json', owner: OWNER, removeBy: '2027-03-31', purpose: 'Where the payroll contract script writes its evidence.' },
  { name: 'accuracySet', env: 'MIDGE_ACCURACY_SET', default: 'dev', owner: OWNER, removeBy: '2027-03-31', purpose: 'Which case set the payrun analyst accuracy experiment uses: dev, held or hard.' },
  { name: 'roomsUrl', env: 'MIDGE_ROOMS_URL', default: '(unset)', owner: OWNER, removeBy: '2027-06-30', purpose: 'When set, the MCP server lists the room tools and talks to the rooms service at this address.' },
  { name: 'labRpc', env: 'LAB_NEAR_RPC', default: 'https://test.rpc.fastnear.com', owner: OWNER, removeBy: '2027-06-30', purpose: 'The NEAR RPC endpoint lab runs use.' },
  { name: 'labExpectedCodeHash', env: 'LAB_EXPECTED_CODE_HASH', default: '(unset)', owner: OWNER, removeBy: '2027-06-30', purpose: 'Pins the code hash a lab run expects of the deployed contract.' },
  { name: 'labGasN', env: 'LAB_GAS_N', default: '20', owner: OWNER, removeBy: '2027-03-31', purpose: 'Size of the larger case in the callback gas experiment.' },
];

/** The flag for an environment variable name, or undefined. */
export const flagFor = (env) => FLAGS.find((f) => f.env === env);

/** The value of a switch from an environment, or its documented default when unset. */
export const readFlag = (name, env = process.env) => {
  const f = FLAGS.find((x) => x.name === name);
  if (!f) throw new Error(`unknown flag: ${name}`);
  return env[f.env] ?? f.default;
};
