import { CARD_FIELDS, FIELD_LABELS } from './schema.js';

export const RUBRIC = [
  { id: 'contextAndNeed', label: 'Контекст и потребность', maxPoints: 20, fields: ['context', 'need'] },
  { id: 'data', label: 'Данные и материалы', maxPoints: 20, fields: ['data'] },
  { id: 'expectedResult', label: 'Ожидаемый результат', maxPoints: 15, fields: ['expectedResult'] },
  { id: 'successCriteria', label: 'Критерии успеха', maxPoints: 15, fields: ['successCriteria'] },
  { id: 'constraints', label: 'Ограничения', maxPoints: 10, fields: ['constraints'] },
  { id: 'users', label: 'Пользователи', maxPoints: 10, fields: ['users'] },
  { id: 'contact', label: 'Связь с бизнесом', maxPoints: 10, fields: ['contact', 'interactionFormat'] },
];

export function isFilled(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return /[\p{L}\p{N}]/u.test(normalized) && !['tbd', 'todo', 'не знаю', 'не указано', 'неизвестно'].includes(normalized);
}

export function readiness(score) {
  if (score >= 90) return { level: 'priority', label: 'Приоритетная' };
  if (score >= 70) return { level: 'ready', label: 'Готовая' };
  if (score >= 40) return { level: 'working', label: 'Рабочая' };
  return { level: 'draft', label: 'Требует уточнения' };
}

export function calculateRating(card, confirmedFields = []) {
  const confirmed = new Set(confirmedFields);
  const missingFields = CARD_FIELDS.filter((field) => !isFilled(card[field]));
  const unconfirmedFields = CARD_FIELDS.filter((field) => isFilled(card[field]) && !confirmed.has(field));
  const breakdown = RUBRIC.map((criterion) => {
    const missing = criterion.fields.filter((field) => !isFilled(card[field]));
    const unconfirmed = criterion.fields.filter((field) => isFilled(card[field]) && !confirmed.has(field));
    const earned = criterion.fields.filter((field) => isFilled(card[field]) && confirmed.has(field));
    const points = earned.length * (criterion.maxPoints / criterion.fields.length);
    const explanations = [];
    if (missing.length) explanations.push(`Добавьте: ${missing.map((field) => FIELD_LABELS[field]).join(', ')}`);
    if (unconfirmed.length) explanations.push(`Подтвердите: ${unconfirmed.map((field) => FIELD_LABELS[field]).join(', ')}`);
    return { ...criterion, points, missingFields: missing, unconfirmedFields: unconfirmed,
      explanation: explanations.join('. ') || 'Сведения заполнены и подтверждены представителем бизнеса' };
  });
  const score = breakdown.reduce((sum, criterion) => sum + criterion.points, 0);
  const recommendations = breakdown.filter((criterion) => criterion.points < criterion.maxPoints)
    .sort((a, b) => (b.maxPoints - b.points) - (a.maxPoints - a.points))
    .map((criterion) => `${criterion.explanation}. Можно получить ещё ${criterion.maxPoints - criterion.points} балл(ов).`);
  if (missingFields.includes('title')) recommendations.push('Добавьте название для публикации. Оно не влияет на рейтинг.');
  if (unconfirmedFields.includes('title')) recommendations.push('Подтвердите название перед публикацией.');
  return { score, ...readiness(score), breakdown, missingFields, unconfirmedFields, recommendations };
}
