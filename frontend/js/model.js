/* Модель интерфейса и проверка серверных ответов.
 * В подключённом сервисе рейтинг и подтверждение принадлежат серверу.
 * DemoService используется только при явно выбранном деморежиме.
 */
(function (S) {
  'use strict';
  const fields = [
    {key:'title', label:'Название задачи', hint:'Кратко: что нужно сделать', kind:'input', max:6000},
    {key:'topic', label:'Тема', kind:'select', max:100},
    {key:'context', label:'Контекст', hint:'Как сейчас устроен процесс?', max:6000},
    {key:'need', label:'Проблема и потребность', hint:'Что нужно изменить и почему?', max:6000},
    {key:'users', label:'Пользователи', hint:'Кто будет пользоваться решением?', max:6000},
    {key:'data_materials', label:'Данные и материалы', hint:'Какие примеры, файлы или источники доступны?', max:6000},
    {key:'expected_result', label:'Ожидаемый результат', hint:'Что команда должна передать в конце?', max:6000},
    {key:'success_criteria', label:'Критерии успеха', hint:'По каким проверяемым признакам вы примете результат?', max:6000},
    {key:'constraints', label:'Ограничения', hint:'Сроки, технологии, доступы и другие рамки', max:6000},
    {key:'contact', label:'Контакт бизнеса', hint:'Рабочая почта или другой контакт для связи', max:6000, kind:'input'},
    {key:'interaction_format', label:'Формат взаимодействия', hint:'Как часто и в каком формате вы готовы отвечать на вопросы?', max:6000}
  ];
  const topics = ['Автоматизация', 'Веб-разработка', 'Аналитика данных', 'Образование', 'Дизайн и медиа', 'Другое'];
  const groups = [
    {title:'О задаче', subtitle:'Контекст, потребность и будущие пользователи', keys:['title','topic','context','need','users']},
    {title:'Результат и материалы', subtitle:'Что нужно получить и с чем предстоит работать', keys:['data_materials','expected_result','success_criteria']},
    {title:'Условия сотрудничества', subtitle:'Границы задачи и связь с вашей командой', keys:['constraints','contact','interaction_format']}
  ];
  function blankTask() { return Object.fromEntries(['description', ...fields.map(f=>f.key)].map(k=>[k,''])); }
  function normalizeTask(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный формат карточки. Ожидается объект.');
    const result = blankTask();
    Object.keys(result).forEach(k => {
      if (value[k] != null && typeof value[k] !== 'string') throw new Error('Поле «'+k+'» должно быть строкой.');
      const max = k === 'description' ? 12000 : fields.find(f=>f.key===k).max;
      result[k] = value[k] || '';
      if (result[k].length > max) throw new Error('Поле «'+k+'» превышает допустимую длину: '+max+' символов. Текст не был сокращён.');
    });
    return result;
  }
  // Отпечаток служит только UX-индикатором изменений. Это НЕ механизм защиты.
  const fingerprint = task => JSON.stringify(normalizeTask(task));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() || ('local-'+Date.now()+'-'+Math.random().toString(16).slice(2));
  const meaningful = value => typeof value === 'string' && /[\p{L}\p{N}]/u.test(value.trim().toLowerCase()) && !['tbd','todo','не знаю','не указано','неизвестно'].includes(value.trim().toLowerCase());
  function validateQuestions(value) {
    if (!Array.isArray(value) || value.length < 3 || value.length > 20) throw new Error('Сервис должен вернуть от 3 до 20 уточняющих вопросов.');
    const ids = new Set();
    for (const q of value) {
      if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id) || typeof q.text !== 'string' || !q.text.trim() || !fields.some(f=>f.key===q.field)) throw new Error('Некорректный формат уточняющих вопросов.');
      ids.add(q.id);
    }
    return clone(value);
  }
  function validateRating(r) {
    if (!r || !Number.isFinite(r.total_score) || r.total_score < 0 || r.total_score > 100 || !r.level || typeof r.level.label !== 'string' || typeof r.level.key !== 'string' || !Array.isArray(r.breakdown) || !Array.isArray(r.missing_fields)) throw new Error('Сервис вернул некорректную оценку.');
    for (const b of r.breakdown) if (typeof b.label !== 'string' || !Number.isFinite(b.earned) || !Number.isFinite(b.max) || b.earned < 0 || b.earned > b.max) throw new Error('Некорректная расшифровка оценки.');
    for (const m of r.missing_fields) if (!fields.some(f=>f.key===m.key) || typeof m.label !== 'string' || typeof m.suggestion !== 'string') throw new Error('Некорректный список недостающих сведений.');
    if (r.unconfirmed_fields != null && (!Array.isArray(r.unconfirmed_fields) || r.unconfirmed_fields.some(key=>!fields.some(f=>f.key===key)))) throw new Error('Некорректный список неподтверждённых полей.');
    if (r.recommendations != null && (!Array.isArray(r.recommendations) || r.recommendations.some(value=>typeof value!=='string'))) throw new Error('Некорректные рекомендации по карточке.');
    if (r.invalid_fields != null && (!Array.isArray(r.invalid_fields) || r.invalid_fields.some(key=>!fields.some(f=>f.key===key)))) throw new Error('Некорректный список замечаний к полям.');
    if (r.quality != null) {
      const q=r.quality;
      if(q.version!==1||!['local','openai','fallback'].includes(q.mode)||!q.fields||typeof q.fields!=='object'||Array.isArray(q.fields)||!Array.isArray(q.warnings)||q.warnings.some(text=>typeof text!=='string'))throw new Error('Некорректный результат проверки качества.');
      const expected=fields.filter(field=>field.key!=='topic').map(field=>field.key);
      if(Object.keys(q.fields).length!==expected.length||expected.some(key=>!Object.prototype.hasOwnProperty.call(q.fields,key)))throw new Error('Неполная проверка полей карточки.');
      for(const [key,result] of Object.entries(q.fields))if(!expected.includes(key)||!result||typeof result!=='object'||Array.isArray(result)||!['valid','needs_detail','invalid','empty'].includes(result.status)||typeof result.message!=='string'||!result.message.trim())throw new Error('Некорректное замечание к полю карточки.');
    }
    return r;
  }
  function validateRecord(r) {
    if (!r || typeof r.id !== 'string' || !r.id || !Number.isInteger(r.revision) || r.revision < 1 || !r.task || typeof r.task !== 'object' || Array.isArray(r.task)) throw new Error('Сервис вернул некорректную сохранённую задачу.');
    r.task = normalizeTask(r.task);
    if (r.rating) validateRating(r.rating);
    if (r.published) { r.published.task = normalizeTask(r.published.task); validateRating(r.published.rating); }
    return r;
  }
  // Не стираем повреждённые данные автоматически и не очищаем чужие ключи.
  const storage = {
    available: true,
    read(key, fallback) {
      let raw;
      try { raw = localStorage.getItem(key); }
      catch (_) { this.available = false; return fallback; }
      if (raw == null) return fallback;
      try { return JSON.parse(raw); }
      catch (_) { throw new Error('Локальный черновик не удалось прочитать. Можно сбросить текущий сеанс редактора и открыть сохранённую задачу.'); }
    },
    write(key, value) {
      if (!this.available) return false;
      try { localStorage.setItem(key,JSON.stringify(value)); return true; }
      catch (_) { this.available = false; return false; }
    },
    remove(key) { try {localStorage.removeItem(key);return true;} catch (_) {this.available=false;return false;} }
  };
  S.model = {fields,topics,groups,blankTask,normalizeTask,fingerprint,clone,uid,meaningful,validateQuestions,validateRating,validateRecord};
  S.storage = storage;
})(window.Sana);
