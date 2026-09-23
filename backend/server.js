import { resolve } from 'node:path';
import { createStore } from './store.js';
import { seedDemo } from './seed.js';
import { createWorkbenchApp as createApp } from './workbench-app.js';
import { createAiRuntime } from './ai-runtime.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
const mode = process.env.AI_MODE || 'mock';
if (!['mock', 'openai'].includes(mode)) throw new Error('AI_MODE must be mock or openai');
const host = process.env.HOST || '127.0.0.1';
const store = createStore(resolve(process.env.DATABASE_PATH || './data/hub.sqlite'));
if (process.env.SEED_DEMO !== 'false') seedDemo(store);
const ai = createAiRuntime({ mode, apiKey: process.env.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000) });
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const server = createApp({ store, ai, allowedOrigins }).listen(port, host, () => {
  console.log(`AI Sana API: http://${host}:${port} (AI mode: ${mode})`);
});
server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : 'Server could not start.'); store.close(); process.exitCode = 1; });
function shutdown() { server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
