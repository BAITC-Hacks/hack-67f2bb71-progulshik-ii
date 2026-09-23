import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRating, readiness, isFilled } from '../scoring.js';
import { CARD_FIELDS, emptyCard } from '../schema.js';

test('unconfirmed values never earn points; a complete confirmed card scores 100', () => {
  const card = Object.fromEntries(CARD_FIELDS.map((field) => [field, 'Подтверждённое описание']));
  assert.equal(calculateRating(card, []).score, 0);
  const full = calculateRating(card, CARD_FIELDS);
  assert.equal(full.score, 100);
  assert.equal(full.level, 'priority');
  assert.equal(full.breakdown.reduce((sum, item) => sum + item.maxPoints, 0), 100);
});

test('two-field groups split points evenly and explain omissions', () => {
  const card = { ...emptyCard(), context: 'Текущий процесс', contact: 'demo@example.test' };
  const result = calculateRating(card, ['context', 'contact']);
  assert.equal(result.score, 15);
  assert.ok(result.missingFields.includes('need'));
  assert.ok(result.missingFields.includes('interactionFormat'));
  assert.equal(result.breakdown[0].points, 10);
});

test('readiness boundaries match the brief', () => {
  for (const [score, level] of [[0,'draft'],[39,'draft'],[40,'working'],[69,'working'],[70,'ready'],[89,'ready'],[90,'priority'],[100,'priority']]) {
    assert.equal(readiness(score).level, level);
  }
});

test('empty values and common placeholders do not earn points', () => {
  for (const value of ['', '   ', '???', 'TBD', 'Не знаю', 'не указано']) assert.equal(isFilled(value), false);
  assert.equal(isFilled('Данных пока нет; бизнес предоставит примеры на первой встрече.'), true);
});
