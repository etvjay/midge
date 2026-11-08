// The contract's group statuses and the JavaScript simulation's (src/contracts/nest.js) must be the same set under a fixed spelling map.
export const STATUS_MAP = { Active: 'ACTIVE', Settled: 'SETTLED', AbortedRefunded: 'ABORTED_REFUNDED' };

export function statusDrift(libRsText, nestJsText) {
  const problems = [];
  const body = (libRsText.match(/pub enum SyndicateStatus\s*\{([^}]*)\}/) || [])[1] || '';
  const variants = [...body.matchAll(/^\s*([A-Z][A-Za-z0-9]*)\s*,?\s*$/gm)].map((m) => m[1]);
  for (const v of variants) if (!STATUS_MAP[v]) problems.push(`the contract has status ${v}, which STATUS_MAP and nest.js do not know`);
  for (const [v, js] of Object.entries(STATUS_MAP)) if (!variants.includes(v)) problems.push(`STATUS_MAP lists ${v}, which the contract no longer has`);
  const used = new Set([...nestJsText.matchAll(/\bstatus\s*(?:===|!==|=|:)\s*'([A-Z][A-Z_]+)'/g)].map((m) => m[1]));
  const allowed = new Set(Object.values(STATUS_MAP));
  for (const u of used) if (!allowed.has(u)) problems.push(`nest.js uses status ${u}, which the contract does not have`);
  for (const [v, js] of Object.entries(STATUS_MAP)) if (variants.includes(v) && !used.has(js)) problems.push(`nest.js never uses ${js}, the simulation of ${v}`);
  return problems;
}
