import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createStore } from '../backend/store.js';
import { createApp } from '../backend/app.js';
import { createAiService } from '../backend/ai.js';
import { CARD_FIELDS } from '../backend/schema.js';
import { createApiClient } from '../shared/api-client.js';

// Isolated demonstration: never modifies the team's saved database.
const store = createStore(':memory:');
const server = createApp({ store, ai: createAiService({ mode: 'mock' }) }).listen(0, '127.0.0.1');
await once(server, 'listening');
const api = createApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
try {
  let task = await api.createTask({ rawDescription: 'Нужен помощник, чтобы отвечать клиентам учебного центра.', topic: 'Образование' });
  console.log(`1. Черновик создан. Рейтинг: ${task.rating.score}/100.`);
  const analysis = await api.analyzeTask({ rawDescription: task.rawDescription });
  console.log(`2. Получены уточняющие вопросы (${analysis.mode}):`);
  analysis.questions.forEach(({ question }) => console.log(`   ${question}`));
  const answers = {
    title: 'Помощник администратора учебного центра',
    context: 'Администратор вручную отвечает на повторяющиеся вопросы о курсах.',
    need: 'Помочь администратору быстро находить согласованные ответы.',
    users: 'Два администратора синтетического учебного центра.',
    data: 'CSV с 50 синтетическими вопросами и утверждёнными ответами.',
    constraints: 'Прототип за 5 часов, без персональных данных и рассылок.',
    expectedResult: 'Веб-прототип поиска ответов в предоставленной таблице.',
    successCriteria: 'Верный ответ найден минимум для 8 из 10 контрольных вопросов.',
    contact: 'demo@example.test', interactionFormat: 'Консультация 15 минут и итоговая демонстрация.',
  };
  const composed = await api.analyzeTask({ rawDescription: task.rawDescription, card: task.card, answers });
  task = await api.updateTask(task.id, { revision: task.revision, card: composed.suggestedCard });
  console.log(`3. Ответы перенесены в редактируемую карточку. До подтверждения: ${task.rating.score}/100.`);
  task = await api.confirmTask(task.id, { revision: task.revision, fields: CARD_FIELDS });
  assert.equal(task.rating.score, 100);
  console.log(`4. В демонстрации бизнес подтвердил сведения. Рейтинг: ${task.rating.score}/100.`);
  task = await api.publishTask(task.id, { revision: task.revision });
  assert.equal((await api.listTasks()).items[0].id, task.id);
  console.log('5. Задача опубликована и найдена в каталоге.');
  const team = await api.createTeam({ name: 'Демо-команда', interests: ['Образование'], skills: ['JavaScript'], technologies: ['React'] });
  const proposal = await api.createProposal(task.id, { teamId: team.id, idea: 'Сделаем поиск по проверенной базе вопросов.', plan: 'Загрузим таблицу, добавим поиск и покажем контрольные примеры.', timeline: '5 часов', prototypeUrl: 'https://example.test/prototype' });
  console.log('6. Команда отправила предложение. Статус: ожидает решения.');
  const accepted = await api.decideProposal(proposal.id, 'accepted');
  assert.equal(accepted.status, 'accepted');
  console.log('7. В демонстрации бизнес принял отклик отдельным действием. Сквозной сценарий пройден.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  store.close();
}
