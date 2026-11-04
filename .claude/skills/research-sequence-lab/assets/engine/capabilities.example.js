// Copy to lab/capabilities.js. Return what this machine can do right now; an experiment's `requires` is checked
// against these names, and a missing one SKIPS the experiment with the reason recorded (it is never a silent pass).
import fs from 'node:fs';
import path from 'node:path';

const hasEnv = (rootDir, name) => {
  try { return new RegExp(`^\\s*${name}\\s*=\\s*\\S`, 'm').test(fs.readFileSync(path.join(rootDir, '.env'), 'utf8')) || Boolean(process.env[name]); } catch { return Boolean(process.env[name]); }
};

export default async function capabilities(rootDir) {
  return {
    network: await fetch('https://example.com', { signal: AbortSignal.timeout(8000) }).then((r) => r.ok, () => false),
    'api-key': hasEnv(rootDir, 'MY_API_KEY'),
  };
}
