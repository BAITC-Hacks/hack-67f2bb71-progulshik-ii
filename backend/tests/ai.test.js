import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiService } from '../ai.js';
import { CARD_FIELDS, emptyCard } from '../schema.js';

const input = { rawDescription: 'Магазину нужен учёт заявок покупателей.', card: {}, answers: {} };
const proposed = (patch = {}, questions = []) => ({
  suggestedFields: Object.fromEntries(CARD_FIELDS.map((field) => [field, patch[field] ?? { value: '', evidence: '' }])),
  questions,
});
const response = (payload, status = 'completed') => ({
  ok: true,
  json: async () => ({ status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }),
});
const remote = (fetchImpl, options = {}) => createAiService({ mode: 'openai', apiKey: 'test-secret', fetchImpl, ...options });

test('mock is explicit, preserves provided fields and answers, invents no fields from draft', async () => {
  const result = await createAiService().analyze({ ...input, card: { title: 'Исходное название', contact: 'manager@example.org' }, answers: { title: 'Новое название' } });
  assert.equal(result.mode, 'mock');
  assert.equal(result.suggestedCard.title, 'Новое название');
  assert.equal(result.suggestedCard.contact, 'manager@example.org');
  assert.equal(result.suggestedCard.context, '');
  assert.equal(result.suggestedCard.need, '');
  assert.ok(result.questions.length >= 3);
  assert.equal(new Set(result.questions.map((question) => question.question)).size, result.questions.length);
  assert.ok(result.questions.every((question) => result.missingFields.includes(question.field)));
  assert.ok(result.warnings.length);
});

test('complete or nearly complete cards still get at least three distinct questions', async () => {
  for (const missing of [[], ['data'], ['successCriteria', 'need']]) {
    const card = Object.fromEntries(CARD_FIELDS.map((field) => [field, missing.includes(field) ? '' : `Сведения: ${field}`]));
    const result = await createAiService().analyze({ ...input, card });
    assert.ok(result.questions.length >= 3);
    assert.equal(new Set(result.questions.map((question) => question.question)).size, result.questions.length);
    for (const field of missing) assert.ok(result.questions.some((question) => question.field === field));
  }
});

test('OpenAI uses Responses strict structured format; extracts only exact supporting quotes', async () => {
  let captured;
  const service = remote(async (url, options) => {
    captured = { url, ...options, body: JSON.parse(options.body) };
    return response(proposed({ need: { value: 'учёт заявок покупателей', evidence: 'учёт заявок покупателей' } }));
  });
  const result = await service.analyze(input);
  assert.equal(result.mode, 'openai');
  assert.equal(result.suggestedCard.need, 'учёт заявок покупателей');
  assert.ok(result.questions.length >= 3);
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.text.format.type, 'json_schema');
  assert.equal(captured.body.text.format.strict, true);
  assert.deepEqual(JSON.parse(captured.body.input[0].content[0].text), input);
  assert.ok(captured.signal instanceof AbortSignal);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('grounding rejects invented value despite valid quote and rejects invented evidence', async () => {
  const service = remote(async () => response(proposed({
    constraints: { value: 'Бюджет 1 миллион тенге', evidence: 'учёт заявок покупателей' },
    successCriteria: { value: 'Точность 99%', evidence: 'Точность 99%' },
    need: { value: 'учёт заявок покупателей', evidence: 'учёт заявок покупателей' },
  })));
  const result = await service.analyze(input);
  assert.equal(result.suggestedCard.constraints, '');
  assert.equal(result.suggestedCard.successCriteria, '');
  assert.equal(result.suggestedCard.need, 'учёт заявок покупателей');
  assert.ok(result.warnings.some((warning) => warning.includes('исключены')));
});

test('AI cannot overwrite user fields or repopulate explicitly cleared answers', async () => {
  const quote = 'учёт заявок покупателей';
  const service = remote(async () => response(proposed({
    title: { value: quote, evidence: quote }, need: { value: quote, evidence: quote },
  })));
  const result = await service.analyze({ ...input, card: { title: 'Название бизнеса', need: 'Старая потребность' }, answers: { need: '' } });
  assert.equal(result.suggestedCard.title, 'Название бизнеса');
  assert.equal(result.suggestedCard.need, '');
});

test('missing API key uses safe local fallback and never calls provider', async () => {
  const result = await remote(() => { throw new Error('must not be called'); }, { apiKey: '' }).analyze(input);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.questions.length >= 3);
  assert.deepEqual(result.suggestedCard, emptyCard());
});

test('malformed, invalid-schema, incomplete, refusal and empty outputs fall back safely', async () => {
  const cases = [
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'broken JSON test-secret' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"suggestedFields":{},"questions":[]}' }] }] },
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private provider text' }] }] },
    { status: 'completed', output: [] },
  ];
  for (const body of cases) {
    const result = await remote(async () => ({ ok: true, json: async () => body })).analyze({ ...input, answers: { data: 'Пять файлов CSV' } });
    assert.equal(result.mode, 'fallback');
    assert.equal(result.suggestedCard.data, 'Пять файлов CSV');
    assert.ok(result.questions.length >= 3);
    assert.ok(!JSON.stringify(result).includes('test-secret'));
    assert.ok(!JSON.stringify(result).includes('private provider text'));
  }
});

test('network and HTTP errors fall back without leaking error details', async () => {
  const failures = [
    async () => { throw new Error('test-secret private provider error'); },
    async () => ({ ok: false, status: 429, json: async () => { throw new Error('must not read error body'); } }),
  ];
  for (const fetchImpl of failures) {
    const result = await remote(fetchImpl).analyze(input);
    assert.equal(result.mode, 'fallback');
    assert.ok(!JSON.stringify(result).includes('test-secret'));
  }
});

test('timeout aborts hanging fetch and also bounds response-body reading', async () => {
  for (const stage of ['fetch', 'body']) {
    let signal;
    const result = await remote(async (_url, options) => {
      signal = options.signal;
      if (stage === 'fetch') return new Promise(() => {});
      return { ok: true, json: async () => new Promise(() => {}) };
    }, { timeoutMs: 15 }).analyze(input);
    assert.equal(result.mode, 'fallback');
    assert.equal(signal.aborted, true);
  }
});

test('duplicate provider questions are filled locally and missing fields stay first', async () => {
  const duplicate = 'Какие сведения доступны?';
  const card = Object.fromEntries(CARD_FIELDS.map((field) => [field, `Сведения: ${field}`]));
  card.need = '';
  card.context = '';
  const questions = [
    { field: 'need', question: duplicate, reason: 'Проверка' },
    { field: 'context', question: duplicate, reason: 'Проверка' },
  ];
  const result = await remote(async () => response(proposed({}, questions))).analyze({ ...input, card });
  assert.ok(result.questions.length >= 3);
  assert.equal(result.questions[0].field, 'need');
  assert.equal(result.questions[1].field, 'context');
  assert.equal(new Set(result.questions.map((question) => question.question)).size, result.questions.length);
});

test('placeholders stay missing and get relevant questions while explicit answers are preserved', async () => {
  const card = Object.fromEntries(CARD_FIELDS.map((field) => [field, `Сведения: ${field}`]));
  card.context = 'TBD';
  const incomplete = { ...input, card, answers: { need: 'не знаю', data: '???' } };
  const local = await createAiService().analyze(incomplete);
  assert.deepEqual(local.missingFields, ['context', 'need', 'data']);
  assert.deepEqual(local.questions.map((question) => question.field), ['need', 'context', 'data']);

  const quote = 'учёт заявок покупателей';
  const result = await remote(async () => response(proposed({
    context: { value: 'Магазину', evidence: 'Магазину' },
    need: { value: quote, evidence: quote },
  }))).analyze(incomplete);
  assert.equal(result.suggestedCard.context, 'Магазину');
  assert.equal(result.suggestedCard.need, 'не знаю');
  assert.equal(result.suggestedCard.data, '???');
  assert.deepEqual(result.missingFields, ['need', 'data']);
  assert.deepEqual(result.questions.slice(0, 2).map((question) => question.field), ['need', 'data']);
  assert.ok(result.questions.length >= 3);
});
