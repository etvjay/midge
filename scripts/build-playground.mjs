#!/usr/bin/env node
/**
 * Build the playground page script:   npm run build:playground
 *   site/playground/playground.bundle.js   the page script, with the browser client, the verifier and the shared run rules bundled in
 * It uses Replay's stylesheet (site/replay/replay.css) and its own (site/playground/playground.css), and reads the service's address from
 * site/playground/config.js, which stays null until the service is deployed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = await build({ entryPoints: [path.join(root, 'site/src/playground-page.js')], bundle: true, minify: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', legalComments: 'none', logLevel: 'silent' });
fs.writeFileSync(path.join(root, 'site/playground/playground.bundle.js'), out.outputFiles[0].text);
console.log(`site/playground/playground.bundle.js ${(out.outputFiles[0].text.length / 1024).toFixed(1)} KB`);
