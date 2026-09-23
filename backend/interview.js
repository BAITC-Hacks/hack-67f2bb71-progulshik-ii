/** Task-discovery interview. Pure rules are also the explicit offline fallback.
 * These checks guide questions; they NEVER change the readiness score.
 */
export function normalizeAnswer(value) {
  return typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('ru')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '').replace(/ё/gu, 'е')
    .replace(/\s+/gu, ' ').trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '') : '';
}
const UNKNOWN = new Set(['tbd','todo','n/a','na','unknown','not specified','not known','не знаю',
  'пока не знаю','неизвестно','пока неизвестно','не указано','не определено','пока не определено',
  'нет данных','информации нет','нет информации','уточню','нужно уточнить','будет позже']);
export function isMeaningful(value) {
  const text = normalizeAnswer(value);
  return /[\p{L}\p{N}]/u.test(text) && !UNKNOWN.has(text);
}
const ORDER = ['need','context','data','expectedResult','successCriteria','users','constraints','contact','interactionFormat','title'];
const BOOK = {
  need: {
    label: 'Проблема и ценность',
    ask: 'Какую конкретную проблему нужно решить и что изменится для бизнеса?',
    deep: 'Какой реальный случай показывает проблему и как вы поймёте, что она стала меньше?',
    verify: 'Что важнее всего решить в первой версии, а что можно отложить без потери её пользы?',
    why: 'Это отделяет бизнес-потребность от преждевременного выбора технологии.',
    guide: ['Один наблюдаемый сбой или неудобство сегодня.', 'Кого и как он затрагивает; частота или объём, если известны.', 'Желаемое изменение, а не только название приложения.'],
    example: 'Сейчас [ситуация] приводит к [последствие]. Нужно [изменение]. Частоту пока не измеряли.'
  },
  context: {
    label: 'Текущий процесс',
    ask: 'Как сейчас проходит процесс: от первого действия до результата, и где возникает затруднение?',
    deep: 'Разберите один типичный случай по шагам: кто что делает, в каких инструментах и где требуется ручная работа?',
    verify: 'Какие исключения из обычного процесса будущая команда должна обязательно учитывать?',
    why: 'Команда увидит исходную ситуацию, границы процесса и точки интеграции.',
    guide: ['Что запускает процесс и чем он заканчивается.', 'Участники, шаги и используемые инструменты.', 'Где происходят задержки, потери или повторная работа.'],
    example: '[Роль] получает [вход] в [канал], затем [шаги]. Проблема возникает на шаге [шаг].'
  },
  data: {
    label: 'Данные и доступ',
    ask: 'Какие данные или материалы уже существуют и что из них действительно доступно команде?',
    deep: 'Как устроены данные: источник, формат, пример записи, качество и способ безопасного доступа?',
    verify: 'Кто и когда предоставит материалы и что делать, если доступ не будет готов к началу работы?',
    why: 'Проверяем возможность начать работу, а не только наличие слова «данные».',
    guide: ['Источники и форматы: таблицы, документы, API или ручной ввод.', 'Объём и обезличенный пример структуры, если они известны.', 'Кто выдаёт доступ; персональные данные и ограничения использования.'],
    example: 'Есть [источник/формат] с полями [перечень]. Доступ выдаёт [роль]. Чувствительные поля [как исключить].'
  },
  expectedResult: {
    label: 'Результат и границы MVP',
    ask: 'Что именно команда должна передать: какой продукт или материал и какие действия он позволит выполнить?',
    deep: 'Опишите минимальный результат: обязательные функции, формат передачи и то, что НЕ входит в первую версию.',
    verify: 'Как выглядит демонстрация результата от начала до конца на одном вашем примере?',
    why: 'Понятный результат помогает команде оценить объём и не обещать лишнего.',
    guide: ['Артефакт: прототип, работающий инструмент, отчёт или другое.', 'Два-три обязательных действия пользователя.', 'Что исключено; где и как результат будут запускать или смотреть.'],
    example: 'Нужен [артефакт], позволяющий [действия]. Передача: [формат]. Вне первой версии: [границы].'
  },
  successCriteria: {
    label: 'Проверка успеха',
    ask: 'По каким проверяемым признакам бизнес примет результат и на каких примерах это проверит?',
    deep: 'Превратите «удобно», «быстро» или «качественно» в наблюдаемую проверку: действие, ожидаемый итог и способ проверки.',
    verify: 'Кто проведёт приёмку, какие обычные и ошибочные случаи проверит и какой результат будет считаться достаточным?',
    why: 'Без проверки успеха команда и бизнес могут по-разному понимать «готово».',
    guide: ['Что должен сделать пользователь и что он должен получить.', 'Контрольный набор, сценарий или способ измерения.', 'Целевой порог и исходное значение — только если известны; кто подтверждает результат.'],
    example: 'На [контрольный сценарий] система должна [проверяемый результат]. Проверяет [роль]. Порог [известен / нужно согласовать].'
  },
  users: {
    label: 'Пользователи и сценарии',
    ask: 'Кто будет пользоваться решением и какую главную задачу выполняет каждая роль?',
    deep: 'Какой путь проходит основной пользователь и какие права или ограничения нужны разным ролям?',
    verify: 'Кто сможет показать команде реальный рабочий сценарий и дать обратную связь по прототипу?',
    why: 'Роли и сценарии определяют нужные функции, а не абстрактный список возможностей.',
    guide: ['Роли, а не личные и чувствительные характеристики людей.', 'Главное действие каждой роли и ожидаемый результат.', 'Устройства, условия работы и различия в правах, если важны.'],
    example: '[Роль] использует решение, чтобы [действие]. Ей доступно [права], но не [ограничение].'
  },
  constraints: {
    label: 'Ограничения и риски',
    ask: 'Какие ограничения обязательны: срок, среда запуска, доступы, интеграции и требования к данным?',
    deep: 'Что может помешать началу или завершению работы и какой есть допустимый запасной вариант?',
    verify: 'Какие требования обязательны, а какие являются пожеланиями и могут обсуждаться с командой?',
    why: 'Явные границы позволяют предложить выполнимый план и ранний прототип.',
    guide: ['Срок и доступное время бизнеса на консультации.', 'Обязательные технологии и существующие системы — если есть.', 'Запреты, зависимости, безопасность; допустимые упрощения.'],
    example: 'Обязательно [граница]. Желательно [пожелание]. Риск [зависимость]; допустимо [запасной вариант].'
  },
  contact: {
    label: 'Связь с бизнесом',
    ask: 'Какой рабочий контакт можно опубликовать для вопросов команды?',
    deep: 'К какому рабочему контакту можно обратиться за уточнениями и разрешено ли публиковать его в каталоге?',
    verify: 'Этот контакт актуален и доступен для вопросов студенческих команд?',
    why: 'Команда должна иметь согласованный канал связи.',
    guide: ['Только контакт, который разрешено публиковать.', 'Для демонстрации используйте вымышленный адрес.', 'Пароли, ключи API и личные документы здесь не нужны.'],
    example: '[Разрешённая рабочая почта или другой публичный контакт]'
  },
  interactionFormat: {
    label: 'Обратная связь и приёмка',
    ask: 'Как команда будет получать консультации и кто со стороны бизнеса подтвердит результат?',
    deep: 'Как часто возможна обратная связь, в каком канале и как согласовывать промежуточные результаты?',
    verify: 'Что делать, если ответ бизнеса задерживается, и кто сможет принять итоговую демонстрацию?',
    why: 'Предсказуемая обратная связь снижает риск работы без нужных уточнений.',
    guide: ['Канал и доступное время консультаций.', 'Ожидаемый срок ответа, если согласован.', 'Роль человека, принимающего промежуточный и конечный результат.'],
    example: 'Связь через [канал], консультации [частота]. Приёмку проводит [роль]; порядок согласования [описание].'
  },
  title: {
    label: 'Название',
    ask: 'Как коротко назвать задачу, чтобы были понятны результат и рабочий процесс?',
    deep: 'Какое название точнее отражает согласованный результат, а не только технологию?',
    verify: 'По названию можно понять, что нужно сделать и для какого процесса?',
    why: 'Название помогает команде найти подходящую задачу.',
    guide: ['Действие или результат.', 'Процесс или предметная область.', 'Без неподтверждённых обещаний и рекламных формулировок.'],
    example: '[Результат] для [процесс или область]'
  }
};
const vague = /^(?:сайт|бот|приложение|удобно|быстро|качественно|автоматизация|все|всем|хорошо|улучшить|сделать лучше)$/u;
function gap(field, value) {
  if (!isMeaningful(value)) return { kind:'missing', note:'Сведения отсутствуют или пока неизвестны.' };
  const text = normalizeAnswer(value);
  if (!['title','contact'].includes(field) && (vague.test(text) || text.split(' ').length < 4)) {
    return { kind:'deepen', note:'Краткий ответ: проверьте, достаточно ли конкретики для работы команды.' };
  }
  if (field === 'successCriteria' && !/\d|провер|тест|сценари|при[её]м|ошиб|сохраня|вывод|отображ|получ|долж|совпад|экспорт/u.test(text)) {
    return { kind:'deepen', note:'Стоит уточнить наблюдаемый результат и способ его проверки.' };
  }
  return { kind:'verify', note:'Сведения указаны; можно уточнить практические детали.' };
}
function contextualQuestion(field, base, input) {
  const text = `${input.rawDescription || ''} ${input.card?.need || ''}`.toLocaleLowerCase('ru');
  if (field === 'context' && /заявк|заказ|обращени/u.test(text)) return 'Проследите одну заявку, заказ или обращение: от поступления до закрытия. Где возникает проблема?';
  if (field === 'expectedResult' && /(?:^|[^\p{L}])бот(?:$|[^\p{L}])|чат.?бот|ассистент/u.test(text)) return 'Какие запросы должен обрабатывать помощник, а какие передавать человеку или оставлять вне MVP?';
  if (field === 'data' && /аналитик|дашборд|отч[её]т/u.test(text)) return 'Из каких источников берутся данные для анализа, как они связаны и кто подтвердит определения показателей?';
  return base;
}
const questionKey = value => normalizeAnswer(value).replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim();

export function buildInterview(input, card, providerQuestions = []) {
  const history = input.interviewHistory || [];
  const asked = new Set(history.map(item => questionKey(item.question)));
  const improve = input.intent === 'improve';
  const issues = ORDER.map(field => ({ field, label:BOOK[field].label, ...gap(field, card[field]) }));
  const missing = issues.filter(issue => issue.kind === 'missing');
  const actionable = issues.filter(issue => issue.kind !== 'verify');
  const administrative = new Set(['title','contact','interactionFormat']);
  const rank = issue => administrative.has(issue.field) ? (issue.kind==='missing'?2:4)
    : issue.kind==='missing'?0:issue.kind==='deepen'?1:3;
  const sorted = improve ? [...issues].sort((a,b)=>rank(a)-rank(b))
    : [...missing, ...issues.filter(issue=>issue.kind==='deepen'), ...issues.filter(issue=>issue.kind==='verify')];
  const limit = input.questionCount || 6;
  const target = improve ? limit : Math.min(limit, Math.max(3, missing.length));
  const questions = [], selected = new Set();
  function add(issue, variant, custom) {
    const entry = BOOK[issue.field];
    const local = variant === 'ask' ? contextualQuestion(issue.field, entry.ask, input) : entry[variant];
    const text = custom?.question || local;
    const key = questionKey(text);
    if (asked.has(key) || selected.has(key)) return false;
    selected.add(key);
    const guidance = Array.isArray(custom?.guidance) && custom.guidance.length ? custom.guidance.slice(0,4) : entry.guide;
    const excerpt = String(card[issue.field] || '').trim();
    questions.push({
      field:issue.field, question:text, reason:custom?.reason || entry.why,
      kind:issue.kind, priority:issue.kind==='missing'?'high':issue.kind==='deepen'?'medium':'normal',
      guidance, example:custom?.example || entry.example,
      knownContext:excerpt ? excerpt.slice(0,180) + (excerpt.length>180?'…':'') : ''
    });
    return true;
  }
  for (const issue of sorted) {
    if (questions.length >= target) break;
    const custom = providerQuestions.find(q=>q.field===issue.field&&!asked.has(questionKey(q.question))&&!selected.has(questionKey(q.question)));
    const variant = issue.kind==='missing'?'ask':issue.kind==='deepen'?'deep':'verify';
    if (custom && add(issue,variant,custom)) continue;
    if (add(issue,variant)) continue;
    for (const alternative of ['deep','verify','ask']) if (add(issue,alternative)) break;
  }
  // Enough distinct, bounded variants for a maximum of three six-question rounds.
  for (const variant of ['deep','verify','ask']) {
    for (const issue of sorted) {
      if (questions.length >= Math.min(3,target)) break;
      add(issue,variant);
    }
  }
  const closing = [
    ['need','Какое последнее уточнение вы бы дали команде, чтобы она не решала другую задачу?'],
    ['expectedResult','Какой минимальный пример позволит показать результат, не выходя за согласованные границы?'],
    ['data','Как команда сможет проверить доступность материалов до обещания сроков?'],
    ['successCriteria','Какие условия приёмки ещё требуют согласования, а какие уже подтверждены бизнесом?']
  ];
  for (const [field,question] of closing) {
    if (questions.length>=3) break;
    add(issues.find(x=>x.field===field),'verify',{question,reason:BOOK[field].why});
  }
  return {
    questions,
    quality: {
      source:'rules', // Not an AI score or a verification of factual truth.
      summary: missing.length ? `Есть пробелы в ${missing.length} разделах. Начните с наиболее важных.`
        : actionable.length ? 'Основные разделы заполнены. Уточните конкретику и способ проверки результата.'
        : 'Разделы заполнены. Проверьте границы MVP, доступность материалов и приёмку результата.',
      issues:actionable,
      note:'Подсказки основаны на локальных признаках текста, а не на проверке его достоверности. На рейтинг они не влияют.'
    }
  };
}
