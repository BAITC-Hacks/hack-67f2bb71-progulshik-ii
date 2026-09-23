/* Каталог, профили команд и отклики. Данные и решения сохраняет общий API.
 * Переключение роли — навигация демонстрационного пространства, не авторизация. */
(function (S) {
  'use strict';
  S.createCollaboration = function (options) {
    const { service, e, i, btn, heading, toast } = options;
    const KEY = 'aisana.collaboration.v1';
    const pages = new Set(['catalog', 'team-proposals', 'business-proposals', 'teams']);
    const statusNames = { pending: 'Ожидает решения', accepted: 'Команда выбрана', rejected: 'Отклонён' };
    const fields = ['idea', 'plan', 'timeline', 'prototypeUrl'];
    const blankTeam = () => ({ name: '', interests: '', skills: '', technologies: '' });
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { /* Данные API доступны и без localStorage. */ }
    const state = {
      page: 'catalog', ready: false, tasks: [], teams: [], proposals: [], teamId: typeof saved.teamId === 'string' ? saved.teamId : '',
      selectedTaskId: '', search: '', topic: '', level: '', taskFilter: '', statusFilter: '',
      drafts: saved.drafts && typeof saved.drafts === 'object' && !Array.isArray(saved.drafts) ? saved.drafts : {},
      teamDraft: Object.fromEntries(Object.keys(blankTeam()).map(key => [key, typeof saved.teamDraft?.[key] === 'string' ? saved.teamDraft[key] : ''])),
      busy: false, busyText: '', error: '', success: '', fieldErrors: {}, storageWarning: false
    };
    const isTeam = () => options.getRole() === 'team';
    const teamById = id => state.teams.find(team => team.id === id);
    const taskById = id => state.tasks.find(task => task.id === id);
    const publishedTasks = () => state.tasks.filter(record => record.published).sort((a, b) => b.published.rating.total_score - a.published.rating.total_score || a.published.task.title.localeCompare(b.published.task.title, 'ru'));
    const taskTitle = id => taskById(id)?.task.title || 'Задача недоступна';
    const draftKey = () => JSON.stringify([state.selectedTaskId, state.teamId]);
    function draft() {
      const value = state.drafts[draftKey()];
      return Object.fromEntries(fields.map(key => [key, typeof value?.[key] === 'string' ? value[key] : '']));
    }
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify({ teamId: state.teamId, drafts: state.drafts, teamDraft: state.teamDraft })); }
      catch (_) { state.storageWarning = true; }
    }
    function safeUrl(value) {
      try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
    }
    function date(value) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
    function statusBadge(status) {
      return `<span class="pill collab-status ${status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'orange'}">${e(statusNames[status] || 'Статус неизвестен')}</span>`;
    }
    function tags(items, fallback) {
      return items?.length ? `<div class="collab-tags">${items.map(value => `<span class="pill outline">${e(value)}</span>`).join('')}</div>` : `<span class="muted tiny">${e(fallback || 'Не указаны')}</span>`;
    }
    function empty(title, text, actions = '') {
      return `<section class="card empty-state"><div class="empty-icon">${i('grid')}</div><h2>${e(title)}</h2><p>${e(text)}</p><div class="row wrap">${actions}</div></section>`;
    }
    function stats(items) {
      return `<div class="list-stats collab-stats">${items.map(([value, label, icon]) => `<div class="card stat-card"><span class="stat-icon">${i(icon)}</span><div><b>${e(value)}</b><p>${e(label)}</p></div></div>`).join('')}</div>`;
    }
    function teamPicker() {
      if (!isTeam()) return '';
      return `<section class="collab-team-picker"><div class="field"><label for="collab-active-team">Вы действуете от имени команды</label><select id="collab-active-team" data-collab-team ${state.busy ? 'disabled' : ''}><option value="">Выберите команду</option>${state.teams.map(team => `<option value="${e(team.id)}" ${team.id === state.teamId ? 'selected' : ''}>${e(team.name)}</option>`).join('')}</select></div>${btn('collab-goto-teams', 'Профили команд', 'secondary small', 'folder')}</section>`;
    }
    function feedback() {
      return `${state.error ? `<div class="error-banner" role="alert">${i('info')}<span>${e(state.error)}</span></div>` : ''}${state.success ? `<div class="inline-notice collab-notice" role="status">${i('check')}<span>${e(state.success)}</span></div>` : ''}${state.storageWarning ? '<p class="collab-storage-note" role="status">Не удалось сохранить незавершённый отклик на устройстве. До отправки сохраните текст отдельно.</p>' : ''}`;
    }
    async function load(page) {
      if (!pages.has(page)) return;
      state.page = page;
      state.error = '';
      state.success = '';
      // Обновляем три списка вместе, чтобы у откликов были названия задач и команд.
      const [tasks, teams, proposals] = await Promise.all([service.listTasks(), service.listTeams(), service.listProposals()]);
      state.tasks = tasks;
      state.teams = teams;
      state.proposals = proposals;
      state.ready = true;
      if (state.teamId && !teamById(state.teamId)) { state.teamId = ''; persist(); }
      if(page==='team-proposals'&&state.taskFilter&&!state.proposals.some(p=>p.teamId===state.teamId&&p.taskId===state.taskFilter))state.taskFilter='';
    }
    function render(page) {
      if (!pages.has(page)) return '';
      state.page = page;
      if (!state.ready) return empty('Открываем рабочее пространство', 'Загружаем задачи, профили команд и отклики.', btn('collab-refresh', 'Повторить загрузку', 'secondary', 'grid'));
      const body = page === 'catalog' ? catalog() : page === 'teams' ? teamsPage() : proposalsPage(page === 'business-proposals');
      return `<div class="collab-root" aria-busy="${state.busy}">${feedback()}${state.busy ? `<div class="collab-pending" role="status"><span class="spinner"></span>${e(state.busyText)}</div>` : ''}${body}</div>`;
    }
    function catalog() {
      if (state.selectedTaskId) return taskDetail();
      const records = publishedTasks();
      return heading('ОТКРЫТЫЕ ВОЗМОЖНОСТИ', 'Найдите задачу.<br>Предложите решение.', 'Все опубликованные задачи доступны каждой команде. Выбор исполнителей остаётся за бизнесом.', btn('collab-refresh', 'Обновить', 'secondary', 'grid')) +
        stats([[records.length, 'задач в каталоге', 'grid'], [records.filter(r => r.published.rating.total_score >= 70).length, 'готовы к работе', 'check'], [state.teams.length, 'команд в пространстве', 'folder']]) + teamPicker() +
        `<div class="filters collab-filters"><div class="search-box">${i('search')}<input class="filter-input" data-collab-filter="search" value="${e(state.search)}" placeholder="Найти задачу по названию или описанию" aria-label="Поиск задач"></div><select data-collab-filter="topic" aria-label="Тема задачи"><option value="">Все темы</option>${[...new Set(records.map(r => r.published.task.topic).filter(Boolean))].sort().map(topic => `<option value="${e(topic)}" ${topic === state.topic ? 'selected' : ''}>${e(topic)}</option>`).join('')}</select><select data-collab-filter="level" aria-label="Уровень готовности"><option value="">Любая готовность</option>${[['draft', '0–39 · Требует уточнения'], ['working', '40–69 · Рабочая'], ['ready', '70–89 · Готовая'], ['priority', '90–100 · Приоритетная']].map(([key, label]) => `<option value="${key}" ${key === state.level ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p class="collab-order-note">Сначала задачи с высоким рейтингом готовности. Низкий балл не ограничивает отклики.</p><div id="collab-results">${catalogResults()}</div>`;
    }
    function catalogResults() {
      const query = state.search.toLocaleLowerCase('ru').trim();
      const all = publishedTasks();
      const records = all.filter(r => {
        const task = r.published.task;
        return (!query || Object.values(task).join(' ').toLocaleLowerCase('ru').includes(query)) && (!state.topic || task.topic === state.topic) && (!state.level || r.published.rating.level.key === state.level);
      });
      if (!records.length) return empty(all.length ? 'По этим условиям задач нет' : 'Первые задачи ещё впереди', all.length ? 'Измените запрос или сбросьте фильтры.' : 'Бизнесу нужно подтвердить карточку и опубликовать её в конструкторе.', all.length ? btn('collab-clear-filters', 'Сбросить фильтры', 'secondary') : !isTeam() ? btn('collab-goto-editor', 'Создать задачу', 'primary', 'plus') : btn('collab-refresh', 'Обновить каталог', 'secondary'));
      return `<div class="catalog-grid">${records.map(record => {
        const task = record.published.task, rating = record.published.rating;
        const count = state.proposals.filter(proposal => proposal.taskId === record.id).length;
        return `<article class="card catalog-card"><div class="row between wrap"><span class="pill outline">${e(task.topic || 'Другое')}</span><span class="pill ${rating.total_score < 40 ? 'orange' : ''}">${e(rating.level.label)}</span></div><h3>${e(task.title)}</h3><p>${e(task.need || task.context || task.description || 'Описание требует уточнения.')}</p><div class="collab-card-meta"><span>${count} откликов</span><span>${e(date(record.published.published_at))}</span></div><div class="bottom"><span class="rank">${i('chart', 'sm')}${e(rating.total_score)} <span class="muted">/ 100</span></span>${btn('collab-open-task', 'Открыть задачу', 'secondary small', 'arrow', `data-id="${e(record.id)}"`)}</div></article>`;
      }).join('')}</div>`;
    }
    function taskDetail() {
      const record = taskById(state.selectedTaskId);
      if (!record?.published) return empty('Задача сейчас не опубликована', 'Бизнес мог вернуть карточку в черновики для уточнения. Ранее отправленные отклики сохранены.', btn('collab-back-catalog', 'Вернуться в каталог', 'secondary', 'back'));
      const task = record.published.task, rating = record.published.rating;
      const ownProposals = state.proposals.filter(p => p.taskId === record.id && p.teamId === state.teamId);
      return `<div class="collab-back">${btn('collab-back-catalog', 'В каталог', 'ghost small', 'back')}</div>` + heading('ЗАДАЧА ДЛЯ КОМАНД', e(task.title), e(task.topic || 'Другое'), `<span class="pill ${rating.total_score < 40 ? 'orange' : ''}">${e(rating.level.label)} · ${e(rating.total_score)}/100</span>`) +
        `<div class="collab-detail-grid"><section class="card card-body collab-task-details"><h2>Описание задачи</h2>${S.model.fields.filter(f => !['title', 'topic'].includes(f.key)).map(field => `<div class="detail-field"><h3>${e(field.label)}</h3><p class="${task[field.key] ? '' : 'muted'}">${e(task[field.key] || 'Пока не указано — уточните у бизнеса')}</p></div>`).join('')}<details class="collab-original"><summary>Исходное описание</summary><p>${e(task.description || 'Не указано')}</p></details></section><aside class="stack collab-task-aside"><section class="card card-body"><div class="collab-score-heading"><h2>Готовность задачи</h2><strong>${e(rating.total_score)}<small>/100</small></strong></div><p class="muted tiny">Баллы начислены за заполненные и подтверждённые сведения.</p><div class="rubric">${rating.breakdown.map(item => `<div class="rubric-item"><div class="row"><span>${e(item.label)}</span><b>${e(item.earned)}/${e(item.max)}</b></div><progress class="collab-score-progress" max="${e(item.max)}" value="${e(item.earned)}" aria-label="${e(item.label)}"></progress></div>`).join('')}</div>${rating.missing_fields.length ? `<div class="collab-missing"><h3>Что стоит уточнить</h3><ul>${rating.missing_fields.map(field => `<li>${e(field.label)}</li>`).join('')}</ul></div>` : '<p class="collab-complete">Все сведения для старта заполнены.</p>'}</section>${isTeam() ? `<section class="card card-body collab-offer-summary"><h3>Ваш вклад начинается с идеи</h3><p>Опишите подход и план работы. Бизнес прочитает предложение и самостоятельно примет решение.</p><p class="tiny muted">Можно откликаться при любом рейтинге задачи.</p></section>` : `<section class="card card-body"><h3>Решение за бизнесом</h3><p class="muted tiny collab-gap">Сравните предложения и выберите одну, несколько или ни одной команды.</p>${btn('collab-manage-task', 'Посмотреть отклики', 'primary wide', 'folder', `data-id="${e(record.id)}"`)}</section>`}</aside></div>${isTeam() ? teamPicker() + (ownProposals.length ? `<section class="collab-own-status"><h3>Ваши отклики на эту задачу</h3>${ownProposals.map(p => `<div class="row wrap"><span>${e(date(p.createdAt))}</span>${statusBadge(p.status)}</div>`).join('')}</section>` : '') + proposalForm() : ''}`;
    }
    function fieldError(key) { return state.fieldErrors[key] ? `<span class="field-error" id="collab-error-${key}">${e(state.fieldErrors[key])}</span>` : ''; }
    function proposalForm() {
      if (!state.teamId) return empty('Выберите команду для отклика', 'Используйте список профилей выше или создайте профиль своей команды.', btn('collab-goto-teams', 'Создать профиль команды', 'primary', 'plus'));
      const value = draft();
      const input = (key, label, hint, max, multiline = true) => `<div class="field ${multiline ? 'full' : ''}"><label for="collab-proposal-${key}">${label}</label>${multiline ? `<textarea id="collab-proposal-${key}" data-collab-proposal="${key}" maxlength="${max}" ${state.fieldErrors[key] ? `aria-invalid="true" aria-describedby="collab-error-${key}"` : ''}>${e(value[key])}</textarea>` : `<input id="collab-proposal-${key}" data-collab-proposal="${key}" maxlength="${max}" value="${e(value[key])}" ${key === 'prototypeUrl' ? 'type="url" placeholder="https://..."' : ''} ${state.fieldErrors[key] ? `aria-invalid="true" aria-describedby="collab-error-${key}"` : ''}>`}<span class="hint">${hint}</span>${fieldError(key)}</div>`;
      return `<section class="card collab-proposal-form" aria-labelledby="collab-offer-title"><div class="card-body"><div class="card-heading"><div><h2 id="collab-offer-title">Предложить решение</h2><p>От команды «${e(teamById(state.teamId)?.name || '')}». Все четыре поля обязательны.</p></div>${i('send')}</div><fieldset class="collab-fieldset" ${state.busy ? 'disabled' : ''}><div class="field-grid">${input('idea', 'Идея решения', 'Опишите подход и пользу для бизнеса. Минимум 10 символов.', 6000)}${input('plan', 'План работы', 'Перечислите основные шаги и что передадите в результате. Минимум 10 символов.', 6000)}${input('timeline', 'Срок', 'Например: прототип за 5 часов.', 500, false)}${input('prototypeUrl', 'Ссылка на прототип или репозиторий', 'Открытая ссылка, начинающаяся с https:// или http://.', 2048, false)}</div><div class="collab-form-bottom"><span class="muted tiny">Текст отклика сохраняется на этом устройстве до отправки.</span>${btn('collab-submit-proposal', state.busy ? 'Отправляем…' : 'Отправить отклик', 'primary', 'send', state.busy ? 'disabled' : '')}</div></fieldset></div></section>`;
    }
    function proposalsPage(business) {
      const own = business ? state.proposals : state.proposals.filter(p => p.teamId === state.teamId);
      return heading(business ? 'РЕШЕНИЕ ЗА ВАМИ' : 'ОТ ИДЕИ К СОТРУДНИЧЕСТВУ', business ? 'Команды предложили.<br>Вы выбираете.' : 'Ваши идеи.<br>Следующий шаг.', business ? 'Сравните подходы, планы и сроки. Можно выбрать несколько команд для одной задачи.' : 'Здесь видны отправленные предложения и решения бизнеса по ним.', btn('collab-refresh', 'Обновить', 'secondary', 'grid')) + (business ? '' : teamPicker()) + stats([[own.length, 'всего откликов', 'folder'], [own.filter(p => p.status === 'pending').length, 'ожидают решения', 'clock'], [own.filter(p => p.status === 'accepted').length, 'принятых предложений', 'check']]) +
        `<div class="filters collab-filters"><select class="collab-task-filter" data-collab-proposal-filter="taskFilter" aria-label="Фильтр по задаче"><option value="">Все задачи</option>${state.tasks.filter(t => business || own.some(p => p.taskId === t.id)).map(t => `<option value="${e(t.id)}" ${t.id === state.taskFilter ? 'selected' : ''}>${e(t.task.title || 'Без названия')}${!t.published ? ' · черновик' : ''}</option>`).join('')}</select><select data-collab-proposal-filter="statusFilter" aria-label="Фильтр по решению"><option value="">Все решения</option>${Object.entries(statusNames).map(([value, label]) => `<option value="${value}" ${value === state.statusFilter ? 'selected' : ''}>${label}</option>`).join('')}</select>${(state.taskFilter || state.statusFilter) ? btn('collab-clear-proposal-filters', 'Сбросить', 'ghost small') : ''}</div><div id="collab-proposal-results">${proposalResults(business)}</div>`;
    }
    function proposalResults(business) {
      if (!business && !state.teamId) return empty('От чьего имени будем работать?', 'Выберите команду в списке выше или создайте собственный профиль.', btn('collab-goto-teams', 'Профили команд', 'primary', 'folder'));
      const items = state.proposals.filter(p => (business || p.teamId === state.teamId) && (!state.taskFilter || p.taskId === state.taskFilter) && (!state.statusFilter || p.status === state.statusFilter)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      if (!items.length) return empty('Откликов пока нет', state.taskFilter || state.statusFilter ? 'Попробуйте убрать фильтры или дождитесь новых предложений.' : business ? 'Команды увидят опубликованные задачи в каталоге и смогут предложить решения.' : 'Откройте интересную задачу в каталоге и опишите свой подход.', btn('collab-back-catalog', 'Открыть каталог', 'secondary', 'grid'));
      return `<div class="collab-proposals-grid">${items.map(p => proposalCard(p, business)).join('')}</div>`;
    }
    function proposalCard(proposal, business) {
      const team = teamById(proposal.teamId), url = safeUrl(proposal.prototypeUrl), record = taskById(proposal.taskId);
      return `<article class="card collab-proposal-card"><div class="collab-proposal-top"><span class="muted tiny">${e(date(proposal.createdAt))}</span>${statusBadge(proposal.status)}</div><h2>${e(business ? team?.name || 'Команда недоступна' : taskTitle(proposal.taskId))}</h2><p class="collab-proposal-task">${business ? e(taskTitle(proposal.taskId)) : e(team?.name || '')}${record && !record.published ? '<span class="pill gray">Задача уточняется</span>' : ''}</p>${business && team ? `<details class="collab-team-summary"><summary>Навыки и интересы команды</summary><h3>Интересы</h3>${tags(team.interests)}<h3>Навыки</h3>${tags(team.skills)}<h3>Технологии</h3>${tags(team.technologies)}</details>` : ''}<div class="detail-field"><h3>Идея решения</h3><p>${e(proposal.idea)}</p></div><div class="detail-field"><h3>План работы</h3><p>${e(proposal.plan)}</p></div><div class="detail-field"><h3>Срок</h3><p>${e(proposal.timeline)}</p></div>${url ? `<a class="text-link collab-prototype-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">${i('globe', 'sm')}Открыть прототип или репозиторий ${i('arrow', 'sm')}</a>` : '<p class="field-error">Ссылка на прототип недоступна.</p>'}<div class="collab-proposal-actions">${business ? `${btn('collab-accept', proposal.status === 'accepted' ? 'Команда выбрана' : 'Выбрать команду', proposal.status === 'accepted' ? 'secondary small' : 'primary small', 'check', `data-id="${e(proposal.id)}" ${state.busy || proposal.status === 'accepted' ? 'disabled' : ''}`)}${btn('collab-reject', proposal.status === 'rejected' ? 'Отклонён' : 'Отклонить', 'danger small', '', `data-id="${e(proposal.id)}" ${state.busy || proposal.status === 'rejected' ? 'disabled' : ''}`)}` : record?.published ? btn('collab-open-task', 'Открыть задачу', 'secondary small', 'arrow', `data-id="${e(proposal.taskId)}"`) : '<span class="muted tiny">Отклик сохранён. Карточка появится после повторной публикации.</span>'}</div>${business && proposal.status !== 'pending' ? `<p class="muted tiny collab-decision-note">Решение принято вручную. Его можно изменить кнопкой выше.</p>` : ''}</article>`;
    }
    function teamsPage() {
      return heading('ЛЮДИ ЗА РЕШЕНИЯМИ', 'Профили команд', 'Интересы, навыки и технологии помогают бизнесу понять вашу команду.', btn('collab-refresh', 'Обновить', 'secondary', 'grid')) +
        `<div class="collab-teams-layout"><div class="stack">${state.teams.length ? state.teams.map(team => `<article class="card card-body collab-team-card"><div class="row between wrap"><h2>${e(team.name)}</h2>${team.id === state.teamId ? '<span class="pill">Текущая команда</span>' : ''}</div><h3>Интересы</h3>${tags(team.interests)}<h3>Навыки</h3>${tags(team.skills)}<h3>Технологии</h3>${tags(team.technologies)}${isTeam() ? `<div class="collab-team-actions">${btn('collab-select-team', team.id === state.teamId ? 'Выбрана' : 'Выбрать эту команду', 'secondary small', 'check', `data-id="${e(team.id)}" ${state.busy || team.id === state.teamId ? 'disabled' : ''}`)}</div>` : ''}</article>`).join('') : empty('В пространстве пока нет команд', 'Создайте первый профиль, чтобы отправлять отклики.')}</div><section class="card card-body collab-team-create"><div class="card-heading"><div><h2>Новая команда</h2><p>Опишите, что вам интересно и что вы умеете.</p></div>${i('plus')}</div><fieldset class="collab-fieldset" ${state.busy ? 'disabled' : ''}><div class="stack">${[['name', 'Название команды', 'Минимум 2 символа', 120], ['interests', 'Интересы', 'Например: образование, экология', 2019], ['skills', 'Навыки', 'Например: дизайн, анализ данных', 2019], ['technologies', 'Технологии', 'Например: JavaScript, Python', 2019]].map(([key, label, hint, max]) => `<div class="field"><label for="collab-team-${key}">${label}</label><input id="collab-team-${key}" data-collab-team-field="${key}" value="${e(state.teamDraft[key])}" maxlength="${max}" ${state.fieldErrors['team-' + key] ? `aria-invalid="true" aria-describedby="collab-error-team-${key}"` : ''}><span class="hint">${hint}${key === 'name' ? '' : '. Перечислите через запятую, до 20 значений.'}</span>${fieldError('team-' + key)}</div>`).join('')}</div><div class="collab-form-bottom">${btn('collab-create-team', state.busy ? 'Создаём…' : 'Создать профиль', 'primary wide', 'plus', state.busy ? 'disabled' : '')}</div></fieldset></section></div>`;
    }
    function updateFilteredResults() {
      const results = document.getElementById('collab-results');
      if (results) results.innerHTML = catalogResults();
    }
    function handleInput(event) {
      const target = event.target;
      const key = target.dataset.collabProposal;
      if (fields.includes(key)) {
        const value = draft(); value[key] = target.value; state.drafts[draftKey()] = value; persist();
      } else if (Object.prototype.hasOwnProperty.call(state.teamDraft, target.dataset.collabTeamField)) {
        state.teamDraft[target.dataset.collabTeamField] = target.value; persist();
      } else if (['search', 'topic', 'level'].includes(target.dataset.collabFilter)) {
        state[target.dataset.collabFilter] = target.value; updateFilteredResults();
      }
    }
    function handleChange(event) {
      const target = event.target;
      if (target.hasAttribute('data-collab-team')) {
        state.teamId = target.value; state.taskFilter = ''; state.fieldErrors = {}; state.error = ''; state.success = ''; persist(); options.render();
      } else if (['taskFilter', 'statusFilter'].includes(target.dataset.collabProposalFilter)) {
        state[target.dataset.collabProposalFilter] = target.value; options.render();
      } else if (['search', 'topic', 'level'].includes(target.dataset.collabFilter)) {
        state[target.dataset.collabFilter] = target.value; updateFilteredResults();
      }
    }
    function validateProposal(value) {
      const errors = {};
      if (value.idea.trim().length < 10) errors.idea = 'Добавьте идею решения: не менее 10 символов.';
      if (value.plan.trim().length < 10) errors.plan = 'Опишите план: не менее 10 символов.';
      if (value.timeline.trim().length < 2) errors.timeline = 'Укажите предполагаемый срок.';
      if (!safeUrl(value.prototypeUrl.trim())) errors.prototypeUrl = 'Добавьте действительную ссылку с http:// или https://.';
      return errors;
    }
    function showValidation(errors) {
      state.fieldErrors = errors; state.error = 'Проверьте отмеченные поля. Ваш текст сохранён в форме.'; state.success = ''; options.render();
      document.querySelector('.collab-root [aria-invalid="true"]')?.focus();
    }
    async function mutate(fn, busyText = 'Сохраняем изменения…') {
      if (state.busy) return;
      state.busy = true; state.busyText = busyText; state.error = ''; state.success = ''; state.fieldErrors = {}; options.render();
      try { await fn(); }
      catch (error) { state.error = error?.message || 'Не удалось сохранить изменения. Ваш текст остался в форме.'; }
      finally { state.busy = false; state.busyText = ''; options.render(); if (state.error) document.querySelector('.collab-root .error-banner')?.scrollIntoView({ block: 'nearest' }); }
    }
    async function go(page) { state.error = ''; state.success = ''; state.fieldErrors = {}; await options.navigate(page); }
    async function handleAction(action, element) {
      if (!action?.startsWith('collab-')) return false;
      if (state.busy) return true;
      const id = element?.dataset.id;
      if (action === 'collab-refresh') await mutate(async () => { await load(state.page); toast('Данные обновлены.'); }, 'Обновляем данные…');
      else if (action === 'collab-open-task') { state.selectedTaskId = id; await go('catalog'); window.scrollTo({ top: 0, behavior: 'instant' }); }
      else if (action === 'collab-back-catalog') { state.selectedTaskId = ''; await go('catalog'); window.scrollTo({ top: 0, behavior: 'instant' }); }
      else if (action === 'collab-goto-editor') await go('editor');
      else if (action === 'collab-goto-teams') await go('teams');
      else if (action === 'collab-manage-task') { state.taskFilter = id || ''; state.statusFilter = ''; await go('business-proposals'); }
      else if (action === 'collab-clear-filters') { state.search = ''; state.topic = ''; state.level = ''; options.render(); }
      else if (action === 'collab-clear-proposal-filters') { state.taskFilter = ''; state.statusFilter = ''; options.render(); }
      else if (action === 'collab-select-team') {
        if (isTeam() && teamById(id)) { state.teamId = id; state.taskFilter = ''; persist(); options.render(); toast('Выбрана команда «' + teamById(id).name + '».'); }
      } else if (action === 'collab-submit-proposal') {
        if (!isTeam() || !state.teamId) return true;
        const value = draft(), errors = validateProposal(value);
        if (Object.keys(errors).length) { showValidation(errors); return true; }
        const taskId = state.selectedTaskId, teamId = state.teamId, key = draftKey();
        await mutate(async () => {
          const proposal = await service.createProposal({ taskId, teamId, ...Object.fromEntries(fields.map(field => [field, value[field].trim()])) });
          state.proposals.unshift(proposal); delete state.drafts[key]; persist();
          state.success = 'Отклик отправлен. Бизнес увидит вашу идею и примет решение. Статус доступен в разделе «Мои отклики».';
          toast('Предложение отправлено бизнесу.');
        });
      } else if (action === 'collab-accept' || action === 'collab-reject') {
        if (isTeam() || !state.proposals.some(p => p.id === id)) return true;
        const status = action === 'collab-accept' ? 'accepted' : 'rejected';
        await mutate(async () => {
          const updated = await service.decideProposal({ id, status });
          state.proposals = state.proposals.map(p => p.id === updated.id ? updated : p);
          state.success = status === 'accepted' ? 'Команда выбрана. Остальные предложения остаются доступны для вашего решения.' : 'Отклик отклонён. Решение видно команде.';
          toast(status === 'accepted' ? 'Команда выбрана для сотрудничества.' : 'Отклик отклонён.');
        });
      } else if (action === 'collab-create-team') {
        const value = state.teamDraft, errors = {}, payload = { name: value.name.trim() };
        if (payload.name.length < 2) errors['team-name'] = 'Название должно содержать не менее 2 символов.';
        for (const key of ['interests', 'skills', 'technologies']) {
          payload[key] = [...new Set(value[key].split(',').map(item => item.trim()).filter(Boolean))];
          if (payload[key].length > 20 || payload[key].some(item => item.length > 100)) errors['team-' + key] = 'До 20 значений, каждое не длиннее 100 символов.';
        }
        if (Object.keys(errors).length) { showValidation(errors); return true; }
        await mutate(async () => {
          const team = await service.createTeam(payload);
          state.teams.push(team); state.teamId = team.id; state.teamDraft = blankTeam(); persist();
          state.success = 'Профиль «' + team.name + '» создан.' + (isTeam() ? ' Команда выбрана для отправки откликов.' : '');
          toast('Профиль команды сохранён.');
        });
      }
      return true;
    }
    return { render, load, handleAction, handleInput, handleChange, isBusy: () => state.busy };
  };
})(window.Sana);
