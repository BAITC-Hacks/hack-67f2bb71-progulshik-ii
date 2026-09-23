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
export const createTaskSchema = z.object({
  rawDescription: z.string().trim().min(10).max(12000),
  topic: z.string().trim().min(1).max(100).default('Другое'),
  card: partialCardSchema.default({}),
}).strict();
export const updateTaskSchema = z.object({
  revision: z.number().int().positive(),
  rawDescription: z.string().trim().min(10).max(12000).optional(),
  topic: z.string().trim().min(1).max(100).optional(),
  card: partialCardSchema.optional(),
}).strict().refine((data) => data.card !== undefined || data.topic !== undefined || data.rawDescription !== undefined, 'Передайте изменённые поля');
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
