import { buildPlayground } from './app.js';

const app = buildPlayground({ env: process.env });
const port = await app.start(Number(process.env.PORT || 8090));
console.error(`[playground] listening on ${port}`);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await app.stop(); process.exit(0); });
