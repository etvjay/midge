import { spawn } from 'node:child_process';

/**
 * Adapter for the checks that already exist as scripts. It runs one as a child process and turns every
 * individual check line it prints (✓ / ✗ / ✅ / ❌) into a recorded assertion, plus one assertion on the exit
 * code, so nothing hides behind a script-level "PASS". The full output is stored as a redacted blob.
 */
const LINE = /^\s*(✓|✗|✅|❌)\s+(.+?)\s*$/;

export function runScript({ s, cmd, args, cwd, env = {}, timeoutMs = 240000, label }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const checks = [];
      for (const line of out.split('\n')) { const m = line.match(LINE); if (m) checks.push({ ok: m[1] === '✓' || m[1] === '✅', text: m[2] }); }
      for (const c of checks) s.assert(c.text, c.ok);
      const banner = out.match(/^>>>\s*\[(PASS|FAIL|REJECT|SKIP)\]\s*(.*)$/m);
      if (banner) {
        if (banner[1] === 'SKIP') s.skip(`the script skipped itself: ${banner[2]}`);
        else s.assert(`the script's own verdict banner says ${banner[1]}: ${banner[2].slice(0, 110)}`, banner[1] === 'PASS');
        s.observe('data source the script reported', /\[RECORDED FIXTURE\]|OFFLINE FIXTURE/.test(out) ? 'recorded fixture (not live)' : (/LIVE/.test(out) ? 'live' : 'in-process'));
      }
      const details = [...out.matchAll(/^\s+-\s+([^:\n]{3,60}):\s+(.{1,140})$/gm)].slice(0, 40);
      if (details.length) s.observe('detail lines the script reported', details.map((m) => `${m[1].trim()}: ${m[2].trim()}`));
      s.assert(`${label || args.join(' ')} exited with code 0${signal ? ` (killed by ${signal})` : ''}`, code === 0, { expected: 0, actual: code });
      s.observe('checks parsed from the output', checks.length);
      s.observe('duration (ms)', Date.now() - started);
      s.observe('full output', out, { keep: true });
      if (checks.length === 0) s.problem('minor', `${label || cmd} does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source`);
      resolve({ code, out, checks });
    });
  });
}
