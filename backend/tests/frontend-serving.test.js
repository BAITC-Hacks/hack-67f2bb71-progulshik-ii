import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStore } from '../store.js';
import { createApp } from '../app.js';
import { createAiService } from '../ai.js';

test('serves the task builder and assets on the API origin, while keeping repository files private', async (t) => {
  const store = createStore(':memory:');
  const server = createApp({ store, ai: createAiService({ mode: 'mock' }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /AI Sana/);
  for (const path of ['/styles.css', '/js/config.js', '/js/model.js', '/js/http-service.js', '/js/app.js', '/assets/favicon.svg']) {
    assert.equal((await fetch(`${base}${path}`)).status, 200, path);
  }
  const config = await (await fetch(`${base}/js/config.js`)).text();
  assert.match(config, /mode:\s*'http'/);
  assert.doesNotMatch(config, /OPENAI_API_KEY|sk-proj-/);
  for (const path of ['/.env', '/.git/config', '/backend/server.js', '/data/hub.sqlite', '/package.json']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
});
