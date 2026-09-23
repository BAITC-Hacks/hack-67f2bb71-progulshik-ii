import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { createStore } from '../store.js';
import { seedDemo } from '../seed.js';
import { createApp } from '../app.js';
import { createAiService } from '../ai.js';
import { createApiClient } from '../../shared/api-client.js';
import { CARD_FIELDS, emptyCard } from '../schema.js';

async function fixture(t, { seed = false } = {}) {
  const store = createStore(':memory:');
  if (seed) seedDemo(store);
  const server = createApp({ store, ai: createAiService({ mode: 'mock' }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  return { store, baseUrl, api: createApiClient({ baseUrl }) };
}

const fullCard = {
  ...emptyCard(), title: 'Помощник учебного центра', context: 'Администратор вручную отвечает на вопросы в мессенджере.',
  need: 'Упростить ответы на повторяющиеся вопросы.', users: 'Администраторы учебного центра.',
  data: 'Таблица с 50 обезличенными вопросами и проверенными ответами.', constraints: 'Прототип за 5 часов, только синтетические данные.',
  expectedResult: 'Веб-интерфейс поиска ответа в базе вопросов.', successCriteria: 'На 8 из 10 контрольных вопросов найден верный ответ.',
  contact: 'demo@example.test', interactionFormat: 'Консультация 15 минут перед демонстрацией.',
};

test('complete flow: draft, AI questions, editable card, confirmation, publishing, proposal, manual decision', async (t) => {
  const { api } = await fixture(t);
  let task = await api.createTask({ rawDescription: 'Хотим помощника для учебного центра.', topic: 'Образование' });
  assert.equal(task.rating.score, 0);
  const analysis = await api.analyzeTask({ rawDescription: task.rawDescription, card: task.card });
  assert.equal(analysis.mode, 'mock');
  assert.ok(analysis.questions.length >= 3);
  task = await api.updateTask(task.id, { revision: task.revision, card: fullCard });
  assert.equal(task.rating.score, 0);
  await assert.rejects(() => api.publishTask(task.id, { revision: task.revision }), { code: 'CONFIRMATION_REQUIRED' });
  task = await api.confirmTask(task.id, { revision: task.revision, fields: CARD_FIELDS });
  assert.equal(task.rating.score, 100);
  task = await api.publishTask(task.id, { revision: task.revision });
  assert.equal((await api.listTasks()).items[0].id, task.id);
  const team = await api.createTeam({ name: 'Команда демо', interests: ['Образование'], skills: ['JS'], technologies: ['React'] });
  const proposal = await api.createProposal(task.id, { teamId: team.id, idea: 'Сделаем поиск по базе вопросов.', plan: 'Загрузим таблицу и добавим поиск.', timeline: '5 часов', prototypeUrl: 'https://example.test/prototype' });
  assert.equal(proposal.status, 'pending');
  assert.equal((await api.decideProposal(proposal.id, 'accepted')).status, 'accepted');
  assert.equal((await api.listProposals(task.id)).items.length, 1);
});

test('editing revokes confirmation and publication; stale revisions are rejected', async (t) => {
  const { api } = await fixture(t);
  let task = await api.createTask({ rawDescription: 'Нужен поиск по частым вопросам.', card: fullCard });
  const staleRevision = task.revision;
  task = await api.confirmTask(task.id, { revision: task.revision, fields: CARD_FIELDS });
  task = await api.publishTask(task.id, { revision: task.revision });
  await assert.rejects(() => api.updateTask(task.id, { revision: staleRevision, card: { data: 'Другая база данных' } }), { code: 'REVISION_CONFLICT' });
  task = await api.updateTask(task.id, { revision: task.revision, card: { data: 'Новый набор проверенных примеров' } });
  assert.equal(task.status, 'draft');
  assert.equal(task.rating.score, 80);
  assert.ok(!task.confirmedFields.includes('data'));
  assert.equal((await api.listTasks()).items.length, 0);
  task = await api.confirmTask(task.id, { revision: task.revision, fields: ['data'] });
  assert.equal(task.rating.score, 100);
});

test('low score never blocks published task visibility or proposals; multiple teams can be accepted', async (t) => {
  const { api } = await fixture(t);
  let task = await api.createTask({ rawDescription: 'Хотим улучшить работу склада.', card: { title: 'Задача склада' } });
  task = await api.confirmTask(task.id, { revision: task.revision, fields: ['title'] });
  task = await api.publishTask(task.id, { revision: task.revision });
  assert.equal(task.rating.score, 0);
  assert.equal((await api.listTasks({ level: 'draft' })).items.length, 1);
  for (const name of ['Команда один', 'Команда два']) {
    const team = await api.createTeam({ name });
    const proposal = await api.createProposal(task.id, { teamId: team.id, idea: 'Сначала уточним процесс склада.', plan: 'Обсудим цели и соберём прототип.', timeline: '1 день', prototypeUrl: 'https://example.test/demo' });
    await api.decideProposal(proposal.id, 'accepted');
  }
  assert.equal((await api.listProposals(task.id)).items.filter((p) => p.status === 'accepted').length, 2);
});

test('unknown-value placeholders do not trap publication in an impossible confirmation state', async (t) => {
  const { api } = await fixture(t);
  let task = await api.createTask({ rawDescription: 'Нужен помощник для учёта заявок.', card: { title: 'Учёт заявок', data: 'не знаю' } });
  task = await api.confirmTask(task.id, { revision: task.revision, fields: ['title'] });
  task = await api.publishTask(task.id, { revision: task.revision });
  assert.equal(task.status, 'published');
  assert.equal(task.rating.score, 0);
  assert.ok(task.rating.missingFields.includes('data'));
});

test('input errors are structured; client cannot set score, status, confirmations, or unsafe URLs', async (t) => {
  const { api, baseUrl } = await fixture(t);
  await assert.rejects(() => api.createTask({ rawDescription: 'Достаточно длинное описание', score: 100 }), { code: 'VALIDATION_ERROR' });
  const task = await api.createTask({ rawDescription: 'Достаточно длинное описание' });
  await assert.rejects(() => api.confirmTask(task.id, { revision: 1, fields: ['data'] }), { code: 'EMPTY_FIELDS' });
  await assert.rejects(() => api.updateTask(task.id, { revision: 1, status: 'published' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(() => api.createProposal(task.id, { teamId: 'missing', idea: 'Достаточно длинная идея', plan: 'Достаточно длинный план', timeline: '5 часов', prototypeUrl: 'javascript:alert(1)' }), { code: 'VALIDATION_ERROR' });
  const malformed = await fetch(`${baseUrl}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
});

test('demo seeds provide minimum sets and catalog is sorted, filterable and idempotent', async (t) => {
  const { api, store } = await fixture(t, { seed: true });
  const catalog = (await api.listTasks()).items;
  assert.ok(catalog.length >= 5);
  assert.ok((await api.listTasks({ status: 'draft' })).items.length >= 5);
  assert.ok((await api.listTeams()).items.length >= 5);
  assert.ok(store.list('proposals').length >= 5);
  assert.ok(catalog.some((task) => task.rating.score < 40));
  assert.deepEqual(catalog.map((task) => task.rating.score), catalog.map((task) => task.rating.score).sort((a, b) => b - a));
  const topic = catalog[0].topic;
  assert.ok((await api.listTasks({ topic })).items.every((task) => task.topic === topic));
  const count = store.list('tasks').length;
  seedDemo(store);
  assert.equal(store.list('tasks').length, count);
});

test('SQLite keeps data across reopen and rolls failed transactions back', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-sana-test-'));
  t.after(() => {
    const target = resolve(dir);
    const parent = resolve(tmpdir()) + sep;
    if (!target.startsWith(parent) || !target.slice(parent.length).startsWith('ai-sana-test-')) throw new Error('Unexpected temporary directory');
    rmSync(target, { recursive: true, force: true });
  });
  const path = join(dir, 'db.sqlite');
  let store = createStore(path);
  store.put('teams', { id: 'persistent', name: 'Сохранённая команда' });
  assert.throws(() => store.transaction(() => { store.put('teams', { id: 'rollback', name: 'Не сохранять' }); throw new Error('Abort'); }));
  assert.equal(store.get('teams', 'rollback'), undefined);
  store.close();
  store = createStore(path);
  assert.equal(store.get('teams', 'persistent').name, 'Сохранённая команда');
  store.close();
});
