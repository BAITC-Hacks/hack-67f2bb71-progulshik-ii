import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import vm from 'node:vm';
import { createApp } from '../app.js';
import { createStore } from '../store.js';
import { createAiService } from '../ai.js';
import { CARD_FIELDS } from '../schema.js';

const modelSource = readFileSync(new URL('../../frontend/js/model.js', import.meta.url), 'utf8');
const adapterSource = readFileSync(new URL('../../frontend/js/http-service.js', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const fullTask = {
  description: 'Администратор отвечает на вопросы вручную.\n\nНужен помощник для учебного центра.',
  title: 'Помощник учебного центра', topic: 'Образование',
  context: 'Администратор вручную отвечает на вопросы в мессенджере.',
  need: 'Упростить ответы на повторяющиеся вопросы.', users: 'Администраторы учебного центра.',
  data_materials: 'Таблица с 50 обезличенными вопросами и проверенными ответами.',
  constraints: 'Прототип за 5 часов, только синтетические данные.',
  expected_result: 'Веб-интерфейс поиска ответа в базе вопросов.',
  success_criteria: 'На 8 из 10 контрольных вопросов найден верный ответ.',
  contact: 'demo@example.test', interaction_format: 'Консультация 15 минут перед демонстрацией.',
};

async function fixture(t, { ai = createAiService({ mode: 'mock' }), intercept, sameOrigin = false, timeoutMs = 35000 } = {}) {
  const store = createStore(':memory:');
  const server = createApp({ store, ai }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const requests = [];
  const Sana = { config: { apiBaseUrl: sameOrigin ? '' : baseUrl, credentials: 'same-origin', timeoutMs } };
  const context = vm.createContext({
    window: { Sana }, location: { protocol: 'http:' }, AbortController, setTimeout, clearTimeout,
    fetch: async (path, options) => {
      const url = new URL(path, baseUrl);
      // All test traffic stays on this local fixture; no provider API is called.
      assert.equal(url.origin, baseUrl);
      const request = { path: url.pathname + url.search, method: options.method,
        body: options.body === undefined ? undefined : JSON.parse(options.body), options };
      requests.push(request);
      const overridden = intercept ? await intercept(request, { store, baseUrl }) : undefined;
      return overridden === undefined ? fetch(url, options) : overridden;
    },
  });
  vm.runInContext(modelSource, context, { filename: 'frontend/js/model.js' });
  vm.runInContext(adapterSource, context, { filename: 'frontend/js/http-service.js' });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  return { service: new Sana.HttpService(), Sana, store, requests };
}

test('frontend HTTP adapter completes questions, card, save, confirm, publish and both lists', async (t) => {
  const { service, Sana, store, requests } = await fixture(t, { sameOrigin: true });
  assert.equal(service.lastAi, null);
  const questions = await service.generateQuestions({ description: fullTask.description });
  assert.ok(questions.length >= 3);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.deepEqual(plain(await service.generateQuestions({ description: fullTask.description })), plain(questions));
  assert.equal(service.lastAi.mode, 'mock');
  assert.ok(service.lastAi.warnings.length);
  const answers = { [questions[0].id]: fullTask[questions[0].field] };
  const task = await service.buildCard({ task: fullTask, questions, answers });
  assert.deepEqual(plain(task), fullTask);
  assert.equal(service.lastAi.mode, 'mock');
  let record = await service.saveDraft({ task, questions, answers });
  assert.equal(record.revision, 1);
  assert.equal(record.rating, null);
  assert.equal(record.confirmed_fingerprint, null);
  const raw = store.get('tasks', record.id);
  assert.equal(raw.rawDescription, fullTask.description);
  assert.equal(raw.topic, fullTask.topic);
  assert.equal(raw.card.data, fullTask.data_materials);
  assert.equal(raw.card.expectedResult, fullTask.expected_result);
  assert.equal(raw.card.successCriteria, fullTask.success_criteria);
  assert.equal(raw.card.interactionFormat, fullTask.interaction_format);
  assert.deepEqual(Object.keys(raw.card).sort(), [...CARD_FIELDS].sort());
  record = await service.confirmAndEvaluate({ ...record, task, questions, answers });
  assert.equal(record.rating.total_score, 100);
  assert.equal(record.rating.level.key, 'priority');
  assert.equal(record.rating.source, 'server');
  assert.equal(record.confirmed_fingerprint, Sana.model.fingerprint(record.task));
  assert.equal(record.revision, 2);
  const confirmation = requests.find((request) => request.path.endsWith('/confirm'));
  assert.equal(confirmation.body.revision, 1);
  assert.deepEqual([...confirmation.body.fields].sort(), [...CARD_FIELDS].sort());
  record = await service.publish({ id: record.id, revision: record.revision });
  assert.equal(record.revision, 3);
  assert.deepEqual(plain(record.published.task), fullTask);
  assert.equal(record.published.rating.total_score, 100);
  assert.ok(record.published.published_at);
  assert.deepEqual(plain((await service.getTask({ id: record.id })).questions), plain(questions));
  assert.deepEqual(plain((await service.getTask({ id: record.id })).answers), answers);
  assert.equal((await service.listTasks())[0].id, record.id);
  assert.equal((await service.listPublished())[0].id, record.id);
  assert.ok(requests.some((request) => request.path === '/api/tasks?status=all'));
  assert.ok(requests.some((request) => request.path === '/api/tasks?status=published'));
  assert.equal(requests.find((request) => request.path.endsWith('/publish')).body.revision, 2);
  const freshSession = await new Sana.HttpService().getTask({ id: record.id });
  assert.deepEqual(plain(freshSession.questions), []);
  assert.deepEqual(plain(freshSession.answers), {});
});

test('low score and unknown placeholders are confirmed using backend fields and may be published', async (t) => {
  const { service, Sana, requests } = await fixture(t);
  const task = Sana.model.normalizeTask({ description: 'Хотим улучшить работу склада.', title: 'Задача склада',
    data_materials: 'не знаю', expected_result: 'неизвестно', success_criteria: 'TODO', constraints: '—' });
  let record = await service.confirmAndEvaluate({ task, questions: [], answers: {} });
  assert.equal(record.rating.total_score, 0);
  assert.equal(record.rating.level.key, 'draft');
  assert.equal(record.confirmed_fingerprint, Sana.model.fingerprint(record.task));
  assert.deepEqual(requests.find((request) => request.path.endsWith('/confirm')).body.fields, ['title']);
  assert.ok(record.rating.missing_fields.some((field) => field.key === 'data_materials'));
  assert.ok(record.rating.missing_fields.some((field) => field.key === 'expected_result'));
  assert.ok(record.rating.missing_fields.some((field) => field.key === 'success_criteria'));
  assert.ok(record.rating.recommendations.length);
  const confirmationCount = requests.filter((request) => request.path.endsWith('/confirm')).length;
  const sameRecord = await service.confirmAndEvaluate(record);
  assert.equal(sameRecord.revision, record.revision);
  assert.equal(requests.filter((request) => request.path.endsWith('/confirm')).length, confirmationCount);
  record = await service.publish({ id: record.id, revision: record.revision });
  assert.equal(record.published.rating.total_score, 0);
  assert.equal((await service.listPublished()).length, 1);
});

test('edits use revisions, revoke current confirmation and remove publication until confirmed again', async (t) => {
  const { service, Sana, requests } = await fixture(t);
  let record = await service.confirmAndEvaluate({ task: fullTask, questions: [], answers: {} });
  record = await service.publish(record);
  const edited = { ...record.task, data_materials: 'Новый набор проверенных примеров.' };
  const priorRevision = record.revision;
  record = await service.saveDraft({ ...record, task: edited });
  assert.equal(record.revision, priorRevision + 1);
  assert.equal(record.rating.total_score, 80);
  assert.deepEqual(plain(record.rating.unconfirmed_fields), ['data_materials']);
  assert.equal(record.confirmed_fingerprint, null);
  assert.equal(record.published, null);
  assert.equal((await service.listTasks()).length, 1);
  assert.equal((await service.listPublished()).length, 0);
  await assert.rejects(() => service.publish(record), { code: 'CONFIRMATION_REQUIRED' });
  record = await service.confirmAndEvaluate(record);
  const confirmations = requests.filter((request) => request.path.endsWith('/confirm'));
  assert.deepEqual(confirmations.at(-1).body.fields, ['data']);
  assert.equal(record.rating.total_score, 100);
  assert.equal(record.confirmed_fingerprint, Sana.model.fingerprint(record.task));
  record = await service.saveDraft({ ...record, task: { ...record.task, description: fullTask.description + '\nДополнение.' } });
  assert.equal(record.rating, null);
  assert.equal(record.confirmed_fingerprint, null);
});

test('409 conflicts retain attempted input, questions, answers and structured error details', async (t) => {
  const { service } = await fixture(t);
  const questions = await service.generateQuestions({ description: fullTask.description });
  const answers = { [questions[0].id]: 'Исходный ответ.' };
  const original = await service.saveDraft({ task: fullTask, questions, answers });
  const latest = await service.saveDraft({ ...original, task: { ...original.task, title: 'Изменение другой вкладки' } });
  const attempted = { ...original, task: { ...original.task, title: 'Несохранённый ввод пользователя' },
    questions: [], answers: { edited: 'Этот ответ нельзя потерять.' } };
  const before = plain(attempted);
  await assert.rejects(() => service.saveDraft(attempted), (error) => {
    assert.equal(error.code, 'REVISION_CONFLICT');
    assert.equal(error.status, 409);
    assert.equal(error.details.currentRevision, latest.revision);
    assert.equal(error.savedRecord, undefined);
    assert.match(error.message, /изменилась/);
    return true;
  });
  assert.deepEqual(plain(attempted), before);
  const current = await service.getTask({ id: original.id });
  assert.equal(current.task.title, latest.task.title);
  assert.deepEqual(plain(current.questions), plain(questions));
  assert.deepEqual(plain(current.answers), answers);
});

test('a failed confirm exposes the saved record and revision so retry does not lose input or create duplicates', async (t) => {
  let failConfirmation = true;
  const { service, store } = await fixture(t, { intercept(request) {
    if (request.path.endsWith('/confirm') && failConfirmation) {
      failConfirmation = false;
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Не удалось подтвердить карточку.' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } });
  const questions = await service.generateQuestions({ description: fullTask.description });
  const answers = { [questions[0].id]: 'Сохранённый ответ.' };
  let recovery;
  await assert.rejects(() => service.confirmAndEvaluate({ task: fullTask, questions, answers }), (error) => {
    assert.equal(error.code, 'INTERNAL_ERROR');
    recovery = error.savedRecord;
    assert.ok(recovery.id);
    assert.equal(recovery.revision, 1);
    assert.deepEqual(plain(recovery.task), fullTask);
    assert.deepEqual(plain(recovery.questions), plain(questions));
    assert.deepEqual(plain(recovery.answers), answers);
    assert.equal(recovery.rating, null);
    return true;
  });
  const recovered = await service.confirmAndEvaluate(recovery);
  assert.equal(recovered.id, recovery.id);
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.rating.total_score, 100);
  assert.equal(store.list('tasks').length, 1);
});

test('analysis cache preserves source facts, skips blank answers and gives explicit input priority', async (t) => {
  const mock = createAiService({ mode: 'mock' });
  let analyses = 0;
  const description = 'Работаем вручную.\n\nЕсть таблица обезличенных заявок.';
  const sourceData = 'Есть таблица обезличенных заявок.';
  const ai = { mode: 'mock', async analyze(input) {
    analyses += 1;
    const result = await mock.analyze(input);
    if (analyses === 1) result.suggestedCard.data = sourceData;
    if (analyses > 1) { result.mode = 'fallback'; result.warnings = ['Проверочный резервный режим.']; }
    return result;
  } };
  const { service, Sana, requests } = await fixture(t, { ai });
  const task = Sana.model.normalizeTask({ description, need: 'Потребность, введённая пользователем.' });
  const initial = plain(task);
  const questions = await service.generateQuestions({ description });
  assert.deepEqual(plain(task), initial);
  const dataQuestion = questions.find((question) => question.field === 'data_materials');
  const needQuestion = questions.find((question) => question.field === 'need');
  assert.ok(dataQuestion);
  assert.ok(needQuestion);
  const answers = { [dataQuestion.id]: '', [needQuestion.id]: 'Уточнённый ответ о потребности.' };
  const card = await service.buildCard({ task, questions, answers });
  const body = requests.at(-1).body;
  assert.equal(body.rawDescription, description);
  assert.equal(body.card.data, sourceData);
  assert.equal(body.card.need, task.need);
  assert.deepEqual(body.answers, { need: answers[needQuestion.id] });
  assert.equal(card.data_materials, sourceData);
  assert.equal(card.need, answers[needQuestion.id]);
  assert.equal(card.description, description);
  assert.equal(card.title, '');
  assert.equal(card.topic, '');
  assert.equal(service.lastAi.mode, 'fallback');
  assert.deepEqual(plain(service.lastAi.warnings), ['Проверочный резервный режим.']);
  const changed = await service.buildCard({ task: { ...task, description: 'Совершенно другое исходное описание.' }, questions, answers: {} });
  assert.equal(changed.data_materials, '');
  assert.deepEqual(plain(task), initial);
});

test('raw drafts remain unconfirmed and explicit empty metadata replaces earlier question state', async (t) => {
  const { service, Sana } = await fixture(t);
  const task = Sana.model.normalizeTask({ description: 'Новое описание задачи без заполненной карточки.' });
  const questions = await service.generateQuestions({ description: task.description });
  let record = await service.saveDraft({ task, questions, answers: { [questions[0].id]: 'Первый ответ.' } });
  assert.equal(record.rating, null);
  assert.equal(record.confirmed_fingerprint, null);
  record = await service.saveDraft({ ...record, questions: [], answers: {} });
  assert.deepEqual(plain(record.questions), []);
  assert.deepEqual(plain(record.answers), {});
  await assert.rejects(() => service.confirmAndEvaluate(record), (error) => {
    assert.equal(error.code, 'NOTHING_TO_CONFIRM');
    assert.equal(error.savedRecord.id, record.id);
    return true;
  });
});

test('server-valid text lengths and multiline content survive adapter save and reload', async (t) => {
  const { service } = await fixture(t);
  const task = { ...fullTask, description: 'Исходный абзац.\n\n' + 'Подробности. '.repeat(700),
    title: 'Длинное название '.repeat(20), users: 'Описание пользователей. '.repeat(200),
    contact: 'Описание канала связи. '.repeat(150), interaction_format: 'Описание встреч. '.repeat(200) };
  const saved = await service.saveDraft({ task });
  assert.deepEqual(plain(saved.task), { ...task, description: task.description.trim(),
    title: task.title.trim(), users: task.users.trim(), contact: task.contact.trim(),
    interaction_format: task.interaction_format.trim() });
  assert.deepEqual(plain((await service.getTask({ id: saved.id })).task), plain(saved.task));
});

test('network, timeout and malformed responses fail safely without changing service to demo', async (t) => {
  for (const failure of ['network', 'timeout', 'malformed']) {
    await t.test(failure, async (subtest) => {
      const { service } = await fixture(subtest, { timeoutMs: 5, intercept(request) {
        if (failure === 'network') throw new TypeError('Internal networking details must stay private');
        if (failure === 'malformed') return new Response('<html>upstream unavailable</html>', { status: 502 });
        return new Promise((_resolve, reject) => request.options.signal.addEventListener('abort',
          () => reject(new DOMException('Internal timeout details', 'AbortError')), { once: true }));
      } });
      const codes = { network: 'NETWORK_ERROR', timeout: 'TIMEOUT', malformed: 'INVALID_RESPONSE' };
      await assert.rejects(() => service.generateQuestions({ description: fullTask.description }), (error) => {
        assert.equal(error.code, codes[failure]);
        assert.doesNotMatch(error.message, /Internal|upstream/);
        return true;
      });
      assert.equal(service.kind, 'http');
      assert.equal(service.lastAi, null);
    });
  }
});
