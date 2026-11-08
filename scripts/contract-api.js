// The public functions of the contract's `impl FlyCoordinator` blocks. Used to keep docs/STATE_MACHINE.md complete.
// Comments and string literals are blanked first so a function named in either is not counted.

function blank(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const c = src[i]; const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && n === '*') { let d = 1; out += '  '; i += 2; while (i < src.length && d > 0) { if (src[i] === '/' && src[i + 1] === '*') { d++; out += '  '; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { d--; out += '  '; i += 2; } else { out += src[i] === '\n' ? '\n' : ' '; i++; } } continue; }
    if (c === '"') { out += '"'; i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') { out += ' '; i++; } out += src[i] === '\n' ? '\n' : ' '; i++; } out += '"'; i++; continue; }
    out += c; i++;
  }
  return out;
}

export function contractPublicFns(libRsText) {
  const s = blank(libRsText); const names = new Set();
  const re = /impl\s+FlyCoordinator\s*\{/g; let m;
  while ((m = re.exec(s))) {
    let depth = 1; let j = re.lastIndex;
    while (j < s.length && depth > 0) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
    for (const f of s.slice(re.lastIndex, j).matchAll(/\bpub\s+fn\s+([a-z_][a-z0-9_]*)/g)) names.add(f[1]);
  }
  return [...names].sort();
}
