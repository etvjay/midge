#!/usr/bin/env node
// Bundle site/src/scene3d.js (three.js 0.186.1, tree-shaken and minified) into site/scene3d.js.
// The site itself has no build step; only this module is bundled.   npm run build:site
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
execFileSync('node_modules/.bin/esbuild', ['site/src/scene3d.js', '--bundle', '--minify', '--format=esm', '--target=es2020', '--legal-comments=eof', '--outfile=site/scene3d.js'], { stdio: 'inherit' });
const kb = (n) => (n / 1024).toFixed(1);
const raw = fs.readFileSync('site/scene3d.js'); const gz = (await import('node:zlib')).gzipSync(raw).length;
console.log(`site/scene3d.js ${kb(raw.length)} KB, ${kb(gz)} KB gzipped`);
