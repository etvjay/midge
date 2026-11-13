import fs from 'node:fs';
import path from 'node:path';

/**
 * A list of what the service has created on chain and not yet cleaned up: accounts and groups. It is written to a file after every change, so a
 * service that is restarted, or that crashes, can find and clean up what it left. With no path it is kept in memory (tests, local runs).
 */
export function createFileLedger(file = null) {
  const rows = new Map();
  if (file) { try { for (const r of JSON.parse(fs.readFileSync(file, 'utf8'))) rows.set(r.id, r); } catch { /* a new ledger */ } }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify([...rows.values()], null, 1), { mode: 0o600 }); fs.renameSync(tmp, file);
  };
  return {
    add(row) { rows.set(row.id, { ...row, at: row.at ?? new Date().toISOString() }); save(); },
    remove(id) { if (rows.delete(id)) save(); },
    all() { return [...rows.values()]; },
  };
}
