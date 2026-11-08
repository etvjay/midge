import path from 'node:path';
import { runScript } from '../core/legacy.js';

const OFFLINE = { FLY_OFFLINE: '1', NEARAI_API_KEY: '', NEAR_AI_API_KEY: '' };
const suite = (id, title, hypothesis, files, { env, requires = [], tier = 'offline', limits = [] } = {}) => ({
  id, title, tier, requires, hypothesis, limits,
  async run(ctx) {
    for (const [label, file] of files) {
      await ctx.step(label, async (s) => {
        s.note(`running ${file}${env && env.FLY_OFFLINE ? ' with recorded fixtures (no network, no keys)' : ''}`);
        await runScript({ s, cmd: 'node', args: [file], cwd: ctx.rootDir, env, label: file });
      });
    }
  },
});

const common = [
  ['02 confidential intents (1Click registry)', 'verifications/02-confidential-intents.js'],
  ['03 hatch protocol and escape hatch (JS model)', 'verifications/03-hatch-escape-hatch.js'],
  ['04 dark vault, pods, FAR shard simulation', 'verifications/04-dark-vault-epochs.js'],
  ['05 confidential RFQ and private adjudication', 'verifications/05-confidential-rfq-adjudication.js'],
  ['06 OTC block trades and compute syndicate', 'verifications/06-otc-and-compute-facilities.js'],
  ['07 five-layer resilience failure matrix', 'verifications/07-resilience-failure-matrix.js'],
  ['08 HTTP API, SSE, x402 and MCP end to end', 'verifications/08-api-sse-mcp-e2e.js'],
  ['09 model-sealed Roost against a mock gateway', 'verifications/09-model-sealed-roost.js'],
  ['10 hosted Roost with a fake attestation provider', 'verifications/10-hosted-roost.js'],
];

export default [
  suite('E-SUITE-OFFLINE', 'Existing verification suites, offline and keyless',
    'Every deterministic check in the repository passes with recorded fixtures, no network and no API keys, which is how a judge\'s machine will run them.',
    [['01 hardware attestation (recorded fixture)', 'verifications/01-hardware-attestation.js'], ...common],
    { env: OFFLINE, requires: ['dcap-qvl'], limits: ['Offline mode replays recorded fixtures for attestation, the 1Click registry and the testnet ledger. It shows the logic is sound against recorded data, not that the live services still behave the same.', 'Facilities (RFQ, OTC, FAR shard, compute syndicate) are in-memory simulations; passing here means the simulation is internally consistent.'] }),
  {
    id: 'E-CHECK-FOUNDRY', title: 'Claims, gaps and commits are consistent with the repository', tier: 'offline',
    hypothesis: 'Every claim and gap recorded in foundry/ points to files that exist and commits that are ancestors of HEAD, so the ledger cannot drift from the code.',
    limits: ['It checks that records are consistent with the repository, not that a claim is true.'],
    async run(ctx) { await ctx.step('foundry control-plane audit', async (s) => { await runScript({ s, cmd: 'node', args: ['scripts/check-foundry.js'], cwd: ctx.rootDir, env: {}, label: 'check-foundry' }); }); },
  },
  {
    id: 'E-RUST-CONTRACT', title: 'The NEAR contract passes its Rust tests, lints and formatting', tier: 'offline', requires: [],
    hypothesis: 'The coordinator contract compiles warning-free under clippy, is formatted, and passes all unit, integration and property tests.',
    limits: ['Unit and property tests run against a mock environment; the contract has not been audited by a third party.', 'The deployed code is checked separately by comparing its on-chain code hash with a local build.'],
    async run(ctx) {
      const cwd = path.join(ctx.rootDir, 'contracts/fly-coordinator');
      await ctx.step('cargo clippy -D warnings', async (s) => { const r = await runScript({ s, cmd: 'cargo', args: ['clippy', '--quiet', '--', '-D', 'warnings'], cwd, label: 'cargo clippy' }); s.assert('clippy printed no warnings', !/warning:/.test(r.out)); });
      await ctx.step('cargo fmt --check', async (s) => { await runScript({ s, cmd: 'cargo', args: ['fmt', '--check'], cwd, label: 'cargo fmt --check' }); });
      await ctx.step('cargo test', async (s) => {
        const r = await runScript({ s, cmd: 'cargo', args: ['test'], cwd, timeoutMs: 400000, label: 'cargo test' });
        const results = [...r.out.matchAll(/test result: (\w+)\. (\d+) passed; (\d+) failed/g)];
        const total = results.reduce((a, m) => a + Number(m[2]), 0); const failed = results.reduce((a, m) => a + Number(m[3]), 0);
        s.assert('no Rust test failed', failed === 0, { actual: failed });
        // A pinned count on purpose: it catches tests being deleted. Raised 53 -> 66 on 2026-11-07 for the pro-rata overflow fix (GAP-022), the charged settlement and the cross-language hash vector.
        s.assert('the expected number of Rust tests ran (145: 128 unit, 6 integration, 5 invariant, 6 state machine)', total === 145, { expected: 145, actual: total }); // raised 140 -> 145 for removing a never-funded group (GAP-030); // raised 129 -> 140 for the nonce-checked follow-up (GAP-028) and the phase view; // raised 66 -> 79 -> 82 -> 92 -> 106 -> 118 on 2026-11-07 (two-room agreement, the exit-rule tests, GAP-008) -> 129 on 2026-11-08: audit-fix tests (+5 unit) and tests/state_machine_tests.rs (+6) recovery, GAP-024 release window, then GAP-025 timer consent
      });
    },
  },
];
