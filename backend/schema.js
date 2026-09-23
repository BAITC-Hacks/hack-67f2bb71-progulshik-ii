import { z } from 'zod';

export const CARD_FIELDS = ['title', 'context', 'need', 'users', 'data', 'constraints', 'expectedResult', 'successCriteria', 'contact', 'interactionFormat'];
export const FIELD_LABELS = {
  title: 'Название', context: 'Контекст', need: 'Потребность', users: 'Пользователи',
  data: 'Данные и материалы', constraints: 'Ограничения', expectedResult: 'Ожидаемый результат',
  successCriteria: 'Критерии успеха', contact: 'Контакт', interactionFormat: 'Формат взаимодействия',
};
export const emptyCard = () => Object.fromEntries(CARD_FIELDS.map((field) => [field, '']));
const fieldText = z.string().trim().max(6000);
export const cardSchema = z.object(Object.fromEntries(CARD_FIELDS.map((field) => [field, fieldText]))).strict();
export const partialCardSchema = cardSchema.partial();
export const interviewSchema = z.object({
  source: z.string().max(12000).default(''),
  questions: z.array(z.object({
    id: z.string().min(1).max(100), field: z.enum(CARD_FIELDS),
    text: z.string().min(1).max(800), hint: z.string().max(800).default(''),
  }).strict()).max(20)
    .refine((questions) => questions.length === 0 || questions.length >= 3, 'Сохраните минимум три вопроса')
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length, 'Идентификаторы вопросов должны различаться'),
  answers: z.record(z.string().min(1).max(100), z.string().max(6000))
    .refine((answers) => Object.keys(answers).length <= 20, 'Слишком много ответов'),
}).strict().refine((interview) => Object.keys(interview.answers).every((id) => interview.questions.some((question) => question.id === id)), 'Ответ должен относиться к сохранённому вопросу');
export const createTaskSchema = z.object({
  rawDescription: z.string().trim().min(10).max(12000),
  topic: z.string().trim().min(1).max(100).default('Другое'),
  card: partialCardSchema.default({}),
  interview: interviewSchema.optional(),
}).strict();
export const updateTaskSchema = z.object({
  revision: z.number().int().positive(),
  rawDescription: z.string().trim().min(10).max(12000).optional(),
  topic: z.string().trim().min(1).max(100).optional(),
  card: partialCardSchema.optional(),
  interview: interviewSchema.optional(),
}).strict().refine((data) => data.card !== undefined || data.topic !== undefined || data.rawDescription !== undefined || data.interview !== undefined, 'Передайте изменённые поля');
export const confirmationSchema = z.object({
  revision: z.number().int().positive(),
  fields: z.array(z.enum(CARD_FIELDS)).min(1).max(CARD_FIELDS.length),
}).strict();
export const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export const analysisSchema = z.object({
  rawDescription: z.string().trim().min(10).max(12000),
  card: partialCardSchema.default({}),
  answers: partialCardSchema.default({}),
}).strict();
export const teamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  interests: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  skills: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  technologies: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
}).strict();
export const proposalSchema = z.object({
  teamId: z.string().trim().min(1).max(100),
  idea: z.string().trim().min(10).max(6000),
  plan: z.string().trim().min(10).max(6000),
  timeline: z.string().trim().min(2).max(500),
  prototypeUrl: z.string().trim().min(1).max(2048).refine((value) => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  }, 'Ссылка должна начинаться с http:// или https://'),
}).strict();
export const decisionSchema = z.object({ status: z.enum(['accepted', 'rejected']) }).strict();
