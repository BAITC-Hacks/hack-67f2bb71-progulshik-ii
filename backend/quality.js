import { createHash } from 'node:crypto';
import { CARD_FIELDS, FIELD_LABELS } from './schema.js';

export const QUALITY_VERSION = 1;
const STATUSES = new Set(['valid', 'needs_detail', 'invalid', 'empty']);
const MODES = new Set(['local', 'openai', 'fallback']);
const PLACEHOLDERS = new Set([
  'tbd', 'todo', 'test', 'testing', 'placeholder', 'lorem ipsum', 'n/a', 'na',
  'тест', 'тестовый текст', 'пример', 'не знаю', 'не указано', 'неизвестно',
  'заглушка', 'потом', 'позже', 'что угодно', '123', '1234', '12345', '123456',
]);
const VAGUE = /^(все|всё|всем|люди|человек|пользователи|клиенты|данные|материалы|результат|хорошо|отлично|нормально|готово|да|нет|ок|okay|ok|everyone|users|people|data|result|good|yes|no)$/iu;
const DETAIL_MESSAGES = {
  title: 'Укажите понятное название задачи.',
  context: 'Опишите, как сейчас устроен процесс и где возникает проблема.',
  need: 'Укажите конкретную проблему и желаемое изменение.',
  users: 'Назовите конкретную группу пользователей или их роль.',
  data: 'Назовите доступные данные, документы, примеры или источник материалов.',
  constraints: 'Укажите срок, ограничение технологии или доступа; если ограничений нет, напишите это явно.',
  expectedResult: 'Назовите конкретный результат, который должна передать команда.',
  successCriteria: 'Добавьте измеримый порог или проверяемое условие приёмки результата.',
  contact: 'Укажите email, телефон, @имя пользователя или ссылку для связи.',
  interactionFormat: 'Опишите способ консультаций, периодичность или порядок обратной связи.',
};

function valueOf(card, field) {
  return typeof card?.[field] === 'string' ? card[field] : '';
}

export function qualityFingerprint(card) {
  return createHash('sha256').update(JSON.stringify(CARD_FIELDS.map((field) => [field, valueOf(card, field)]))).digest('hex');
}

function normalized(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/gu, ' ').trim();
}

function obviousNoise(value) {
  const text = normalized(value);
  const plain = text.replace(/[\p{P}\p{S}\s]/gu, '');
  if (PLACEHOLDERS.has(text) || PLACEHOLDERS.has(plain)) return true;
  if (!/[\p{L}\p{N}]/u.test(text)) return true;
  if (/^(.)\1{3,}$/u.test(plain)) return true;
  if (/^(.{1,3})\1{2,}$/u.test(plain)) return true;
  const words = text.match(/[\p{L}]+/gu) ?? [];
  if (words.length >= 4 && new Set(words).size === 1) return true;
  const letters = text.replace(/[^\p{L}]/gu, '');
  // Narrow, recognizable keyboard mashing only: ordinary short words, names,
  // acronyms and non-Latin scripts must not be rejected by a language detector.
  return /^(?:[фыв]{3,}|[фыва]{5,}|[asdf]{4,}|[zxcv]{4,}|[йцу]{3,}|qwerty\w*|asdfgh\w*|zxcvbn\w*|йцукен[а-я]*|фывапр[а-я]*|ячсмит[а-я]*)$/iu.test(letters);
}

function containsContact(value) {
  if (/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/iu.test(value)) return true;
  if (/(?:^|\s)@[\p{L}\p{N}_]{3,32}(?:$|[\s,;.])/u.test(value)) return true;
  const phones = value.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? [];
  if (phones.some((phone) => { const digits = phone.replace(/\D/g, ''); return digits.length >= 7 && digits.length <= 15 && !/^(\d)\1+$/.test(digits); })) return true;
  const links = value.match(/https?:\/\/[^\s<>]+/giu) ?? [];
  return links.some((link) => {
    try { const url = new URL(link); return Boolean(url.hostname.includes('.') && url.hostname.length > 3); } catch { return false; }
  });
}

function isDescriptive(text, minWords, minLetters) {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const letters = text.replace(/[^\p{L}]/gu, '').length;
  // Languages without spaces are not treated as one-word answers.
  const unspacedScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(text);
  return letters >= minLetters && (words.length >= minWords || unspacedScript);
}

function assessField(field, value) {
  const text = normalized(value);
  if (!text) return { status: 'empty', message: `Добавьте: ${FIELD_LABELS[field]}.` };
  if (obviousNoise(text)) return { status: 'invalid', message: 'Замените набор символов или заглушку содержательным описанием.' };
  const detail = () => ({ status: 'needs_detail', message: DETAIL_MESSAGES[field] });
  const valid = () => ({ status: 'valid', message: 'Прошло базовую проверку содержания; достоверность подтверждает представитель бизнеса.' });
  if (field === 'contact') return containsContact(value) ? valid() : detail();
  if (VAGUE.test(text.replace(/[.!?…]+$/u, '').trim())) return detail();
  if (field === 'title') return isDescriptive(text, 1, 2) ? valid() : detail();
  if (field === 'users') return isDescriptive(text, 1, 4) || /^[A-ZА-Я]{2,8}$/.test(value.trim()) ? valid() : detail();
  if (field === 'constraints') {
    if (/^(без ограничений|ограничений нет|нет ограничений|no restrictions|no constraints)[.!]?$/iu.test(text)) return valid();
    if (/^(?:до\s+|не более\s+|за\s+|within\s+|up to\s+)?\d+(?:[.,]\d+)?\s*(?:час(?:а|ов)?|день|дня|дней|недел(?:я|и|ь)|месяц(?:а|ев)?|hours?|days?|weeks?|months?)[.!]?$/iu.test(text)) return valid();
    return isDescriptive(text, 2, 5) ? valid() : detail();
  }
  if (field === 'data') {
    if (/^(нет данных|данных нет|материалов нет|нет материалов|данные отсутствуют|данные будут позже|no data|no materials)[.!]?$/iu.test(text)) return detail();
    return isDescriptive(text, 2, 8) ? valid() : detail();
  }
  if (field === 'successCriteria') {
    const hasThreshold = /\d/u.test(text) || /(?:минимум|не менее|не более|кажд\p{L}*|все\s|всех\s|каждого|без ошибок|успешно|не должен|не должна|при отсутствии|не найден|экспорт|импорт|сохраня\p{L}*|minimum|maximum|at least|at most|every|each|all |without errors|export|import|must|should)/iu.test(text);
    return hasThreshold && isDescriptive(text, 3, 12) ? valid() : detail();
  }
  if (field === 'interactionFormat') return isDescriptive(text, 2, 8) ? valid() : detail();
  if (field === 'expectedResult') return isDescriptive(text, 2, 10) ? valid() : detail();
  return isDescriptive(text, 3, 12) ? valid() : detail();
}

export function assessLocalQuality(card, mode = 'local') {
  const fields = Object.fromEntries(CARD_FIELDS.map((field) => [field, assessField(field, valueOf(card, field))]));
  // Identical prose in unrelated fields does not describe each field's purpose.
  const groups = new Map();
  for (const field of CARD_FIELDS.filter((name) => !['title', 'contact'].includes(name))) {
    const text = normalized(valueOf(card, field));
    if (text && fields[field].status === 'valid') groups.set(text, [...(groups.get(text) ?? []), field]);
  }
  for (const names of groups.values()) {
    if (names.length < 3) continue;
    for (const field of names) fields[field] = { status: 'needs_detail', message: `В нескольких полях повторён один текст. ${DETAIL_MESSAGES[field]}` };
  }
  return {
    version: QUALITY_VERSION,
    cardFingerprint: qualityFingerprint(card),
    mode: mode === 'fallback' ? 'fallback' : 'local',
    fields,
    warnings: [mode === 'fallback'
      ? 'Проверка ИИ недоступна. Применены локальные правила; они выявляют явный мусор и неполные ответы, но не проверяют весь смысл текста.'
      : 'Применены локальные правила качества. Полная смысловая проверка доступна при подключённом ИИ; достоверность сведений подтверждает человек.'],
  };
}

export function resolveQuality(card, storedReport) {
  const local = assessLocalQuality(card);
  const report = storedReport;
  if (!report || typeof report !== 'object' || Array.isArray(report)
    || report.version !== QUALITY_VERSION || report.cardFingerprint !== local.cardFingerprint
    || !MODES.has(report.mode) || !report.fields || typeof report.fields !== 'object' || Array.isArray(report.fields) || !Array.isArray(report.warnings)
    || report.warnings.length > 10 || report.warnings.some((warning) => typeof warning !== 'string' || warning.length > 1000)
    || CARD_FIELDS.some((field) => !report.fields[field] || typeof report.fields[field] !== 'object' || Array.isArray(report.fields[field])
      || !STATUSES.has(report.fields[field].status)
      || typeof report.fields[field].message !== 'string' || !report.fields[field].message.trim() || report.fields[field].message.length > 600)) return local;
  return {
    version: QUALITY_VERSION,
    cardFingerprint: local.cardFingerprint,
    mode: report.mode,
    fields: Object.fromEntries(CARD_FIELDS.map((field) => [field,
      ['empty', 'invalid'].includes(local.fields[field].status) ? local.fields[field] : { ...report.fields[field] },
    ])),
    warnings: [...report.warnings],
  };
}
