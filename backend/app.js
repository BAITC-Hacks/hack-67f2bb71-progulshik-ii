import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import {
  emptyCard, createTaskSchema, updateTaskSchema, confirmationSchema, revisionSchema,
  analysisSchema, teamSchema, proposalSchema, decisionSchema, CARD_FIELDS, FIELD_LABELS,
} from './schema.js';
import { RUBRIC, calculateRating, isFilled } from './scoring.js';
import { AiSettingsError } from './ai-runtime.js';
import { assessLocalQuality, resolveQuality } from './quality.js';

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

export function createApp({ store, ai, allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }));
  app.use(express.json({ limit: '128kb' }));

  const find = (collection, id) => {
    const item = store.get(collection, id);
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Запись не найдена');
    return item;
  };
  const viewTask = (task) => ({ ...task, rating: calculateRating(task.card, task.confirmedFields, task.qualityReview) });
  const checkRevision = (task, revision) => {
    if (task.revision !== revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Карточка уже изменилась. Загрузите актуальную версию.', { currentRevision: task.revision });
  };
  const saveTask = (task) => {
    const updated = { ...task, revision: task.revision + 1, updatedAt: new Date().toISOString() };
    store.put('tasks', updated);
    return viewTask(updated);
  };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ai-sana-challenge-hub', aiMode: ai.mode }));
  app.get('/api/rubric', (_req, res) => res.json({ fields: FIELD_LABELS, criteria: RUBRIC,
    levels: [{ min: 0, max: 39, level: 'draft' }, { min: 40, max: 69, level: 'working' }, { min: 70, max: 89, level: 'ready' }, { min: 90, max: 100, level: 'priority' }] }));

  app.post('/api/ai/analyze', async (req, res) => res.json(await ai.analyze(analysisSchema.parse(req.body))));

  // Runtime credentials can only be managed from this local application's own page.
  // Nothing in these routes returns credentials or writes them to persistent storage.
  function localAiSettings(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const address = req.socket.remoteAddress || '';
    const loopback = address === '::1' || /^127\./.test(address) || /^::ffff:127\./.test(address);
    let origin, hostname;
    try { const local = new URL(`${req.protocol}://${req.get('host')}`); origin = local.origin; hostname = local.hostname; }
    catch { return next(new ApiError(403, 'LOCAL_SETTINGS_ONLY', 'Откройте настройки на компьютере, где запущено приложение.')); }
    if (!loopback || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      return next(new ApiError(403, 'LOCAL_SETTINGS_ONLY', 'Настройки ИИ доступны только через localhost на компьютере, где запущено приложение.'));
    }
    if (req.method !== 'GET' && (req.get('origin') !== origin || req.get('x-ai-settings') !== 'local' || !req.is('application/json'))) {
      return next(new ApiError(403, 'LOCAL_SETTINGS_ONLY', 'Измените настройки через окно «Настройки ИИ» в этом приложении.'));
    }
    if (typeof ai.getSettings !== 'function') return next(new ApiError(503, 'AI_SETTINGS_UNAVAILABLE', 'Настройки ИИ недоступны. Перезапустите обновлённое приложение.'));
    next();
  }
  app.get('/api/ai/settings', localAiSettings, (_req, res) => res.json(ai.getSettings()));
  app.post('/api/ai/settings', localAiSettings, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['apiKey', 'model'].includes(key))) {
      throw new ApiError(400, 'INVALID_AI_SETTINGS', 'Укажите ключ и название модели в окне настроек.');
    }
    res.json(await ai.connect(body));
  });
  app.post('/api/ai/settings/demo', localAiSettings, (_req, res) => res.json(ai.disable()));

  app.get('/api/tasks', (req, res) => {
    const { status = 'published', topic, level, q } = req.query;
    if (![status, topic, level, q].every((value) => value === undefined || typeof value === 'string') ||
        !['published', 'draft', 'all'].includes(status) ||
        (level !== undefined && !['draft', 'working', 'ready', 'priority'].includes(level))) {
      throw new ApiError(400, 'INVALID_FILTER', 'Некорректный фильтр каталога');
    }
    const search = q?.trim().toLocaleLowerCase('ru');
    const items = store.list('tasks').filter((task) => status === 'all' || task.status === status)
      .filter((task) => !topic || task.topic === topic).map(viewTask)
      .filter((task) => !level || task.rating.level === level)
      .filter((task) => !search || `${task.card.title} ${task.rawDescription} ${task.card.context} ${task.card.need}`.toLocaleLowerCase('ru').includes(search))
      .sort((a, b) => b.rating.score - a.rating.score || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    res.json({ items });
  });

  app.post('/api/tasks', (req, res) => {
    const input = createTaskSchema.parse(req.body);
    const now = new Date().toISOString();
    const task = { id: randomUUID(), rawDescription: input.rawDescription, topic: input.topic,
      card: { ...emptyCard(), ...input.card }, interview: input.interview ?? { source: '', questions: [], answers: {} }, confirmedFields: [], status: 'draft', revision: 1,
      createdAt: now, updatedAt: now, publishedAt: null };
    store.put('tasks', task);
    res.status(201).json(viewTask(task));
  });
  app.get('/api/tasks/:id', (req, res) => res.json(viewTask(find('tasks', req.params.id))));

  app.patch('/api/tasks/:id', (req, res) => {
    const input = updateTaskSchema.parse(req.body);
    const task = find('tasks', req.params.id);
    checkRevision(task, input.revision);
    const card = { ...task.card, ...input.card };
    const changedFields = CARD_FIELDS.filter((field) => card[field] !== task.card[field]);
    const rawChanged = input.rawDescription !== undefined && input.rawDescription !== task.rawDescription;
    const changed = changedFields.length > 0 || rawChanged || (input.topic !== undefined && input.topic !== task.topic);
    const interview = input.interview ?? (rawChanged ? { source: '', questions: [], answers: {} } : task.interview);
    const interviewChanged = JSON.stringify(interview) !== JSON.stringify(task.interview);
    if (!changed && !interviewChanged) return res.json(viewTask(task));
    res.json(saveTask({ ...task, card, topic: input.topic ?? task.topic,
      rawDescription: input.rawDescription ?? task.rawDescription,
      interview,
      // A changed field can change the meaning of the entire card. Review it again.
      confirmedFields: changed ? [] : task.confirmedFields,
      qualityReview: changed ? null : task.qualityReview,
      status: changed ? 'draft' : task.status, publishedAt: changed ? null : task.publishedAt }));
  });

  app.post('/api/tasks/:id/confirm', async (req, res) => {
    const input = confirmationSchema.parse(req.body);
    const task = find('tasks', req.params.id);
    checkRevision(task, input.revision);
    const empty = input.fields.filter((field) => !isFilled(task.card[field]));
    if (empty.length) throw new ApiError(400, 'EMPTY_FIELDS', 'Нельзя подтвердить пустые поля или заглушки.', { fields: empty });
    const review = typeof ai.reviewCard === 'function'
      ? await ai.reviewCard(task.card)
      : assessLocalQuality(task.card);
    // The provider request may take time. Never overwrite a newer edit or review.
    checkRevision(find('tasks', req.params.id), input.revision);
    const qualityReview = { ...resolveQuality(task.card, review), checkedAt: new Date().toISOString() };
    const confirmedFields = [...new Set([...task.confirmedFields, ...input.fields])];
    res.json(saveTask({ ...task, confirmedFields, qualityReview }));
  });

  app.post('/api/tasks/:id/publish', (req, res) => {
    const input = revisionSchema.parse(req.body);
    const task = find('tasks', req.params.id);
    checkRevision(task, input.revision);
    if (!isFilled(task.card.title)) throw new ApiError(400, 'TITLE_REQUIRED', 'Укажите название задачи.');
    const unconfirmed = CARD_FIELDS.filter((field) => isFilled(task.card[field]) && !task.confirmedFields.includes(field));
    if (unconfirmed.length) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Прочитайте и подтвердите все заполненные поля перед публикацией.', { fields: unconfirmed });
    res.json(saveTask({ ...task, status: 'published', publishedAt: task.publishedAt ?? new Date().toISOString() }));
  });

  app.get('/api/teams', (_req, res) => res.json({ items: store.list('teams') }));
  app.post('/api/teams', (req, res) => {
    const input = teamSchema.parse(req.body);
    const team = { id: randomUUID(), ...input };
    store.put('teams', team);
    res.status(201).json(team);
  });

  app.get('/api/proposals', (req, res) => {
    const { taskId, teamId } = req.query;
    if (![taskId, teamId].every((value) => value === undefined || (typeof value === 'string' && value.length <= 100))) {
      throw new ApiError(400, 'INVALID_FILTER', 'Некорректный фильтр откликов');
    }
    res.json({ items: store.list('proposals')
      .filter((proposal) => (!taskId || proposal.taskId === taskId) && (!teamId || proposal.teamId === teamId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)) });
  });
  app.get('/api/tasks/:id/proposals', (req, res) => {
    find('tasks', req.params.id);
    res.json({ items: store.list('proposals').filter((proposal) => proposal.taskId === req.params.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  });
  app.post('/api/tasks/:id/proposals', (req, res) => {
    const input = proposalSchema.parse(req.body);
    const task = find('tasks', req.params.id);
    if (task.status !== 'published') throw new ApiError(400, 'TASK_NOT_PUBLISHED', 'Отклик доступен после публикации задачи.');
    find('teams', input.teamId);
    const now = new Date().toISOString();
    const proposal = { id: randomUUID(), taskId: task.id, ...input, status: 'pending', createdAt: now, updatedAt: now };
    store.put('proposals', proposal);
    res.status(201).json(proposal);
  });
  app.patch('/api/proposals/:id', (req, res) => {
    const input = decisionSchema.parse(req.body);
    const proposal = find('proposals', req.params.id);
    const updated = { ...proposal, status: input.status, updatedAt: new Date().toISOString() };
    store.put('proposals', updated);
    res.json(updated);
  });

  // Only public frontend assets are served. The repository root and .env stay private.
  app.use(express.static(fileURLToPath(new URL('../frontend/', import.meta.url)), { dotfiles: 'deny', maxAge: 0 }));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Такой адрес API не найден')));
  app.use((error, _req, res, _next) => {
    if (error instanceof AiSettingsError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) return res.status(400).json({ error: {
      code: 'VALIDATION_ERROR', message: 'Проверьте заполнение полей.',
      details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    } });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некорректный JSON в запросе.' } });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Слишком большой запрос.' } });
    if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Не удалось обработать запрос. Повторите попытку.' } });
  });
  return app;
}
