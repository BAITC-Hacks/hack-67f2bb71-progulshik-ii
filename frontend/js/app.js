/* Экран редактора. Здесь нет формулы рейтинга и вызовов внешнего ИИ.
 * Все бизнес-операции идут через S.service; режим выбирается в конфигурации.
 */
(function(S){
  'use strict';
  const M=S.model, app=document.getElementById('app'), dialog=document.getElementById('dialog');
  const DEMO=S.config.mode==='demo';
  const WORKSPACE=DEMO?'aisana.workspace.v1':'aisana.workspace.http.v1';
  const service=S.service=DEMO?new S.DemoService():new S.HttpService();
  const collaborationPages=['catalog','team-proposals','business-proposals','teams'];
  const pages=['editor','tasks',...collaborationPages];
  let collaboration=null,role='business';
  try{if(S.storage.read('aisana.role.v1','business')==='team')role='team';}catch(_){/* A role preference can safely use its default. */}
  const icons={
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5 5-5-5 5-5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/><path d="M13 20h7"/>',
    folder:'<path d="M3 8V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 9h18"/>',
    spark:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    save:'<path d="M4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    business:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18m-11 0v3h4v-3"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    cup:'<path d="M4 5h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 7h2a3 3 0 0 1 0 6h-2M3 21h17"/>',
    bag:'<path d="M5 7h14l2 14H3Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    book:'<path d="M12 5v16m0-16C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z"/>',
    pen:'<path d="M12 3 4 17l8 4 8-4Z"/><path d="M12 3v10"/><circle cx="12" cy="15" r="2"/>',
    tool:'<path d="M14 4a6 6 0 0 0-7 7L3 17a3 3 0 0 0 4 4l6-6a6 6 0 0 0 7-7l-4 4-4-4Z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
    send:'<path d="m3 3 18 9-18 9 4-9Z"/><path d="M7 12h14"/>',
    shield:'<path d="m12 2 8 4v7c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
  };
  const i=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`;
  // Любое значение пользователя/API экранируется перед HTML-шаблоном.
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn=(action,text,type='secondary',icon='',extra='')=>`<button type="button" class="btn ${type}" data-action="${action}" ${extra}>${icon?i(icon):''}${text}</button>`;
  const fieldByKey=key=>M.fields.find(f=>f.key===key);
  function initial(){return {page:'editor',step:1,id:null,revision:null,task:M.blankTask(),questions:[],answers:{},questionsSource:'',cardReady:false,rating:null,confirmedFingerprint:null,record:null,exampleId:null,ack:false,success:false,busy:false,busyText:'',error:'',conflict:false,records:[],catalog:[],filter:{search:'',topic:'',status:''},autosave:'Форма сохраняется на устройстве'};}
  let state=initial(),saveTimer,toastTimer;
  let startupError='',workspaceCorrupt=false;
  try{
    const saved=S.storage.read(WORKSPACE,null);
    if(saved&&saved.version===1){
      state={...state,...saved,task:M.normalizeTask(saved.task),page:'editor',busy:false,ack:false,success:false};
      if(![1,2,3].includes(state.step))state.step=1;
      if(!Array.isArray(state.questions))state.questions=[];
      if(state.questions.length)M.validateQuestions(state.questions);
      if(!state.answers||typeof state.answers!=='object')state.answers={};
      if(state.rating)M.validateRating(state.rating);
      if(state.step===2&&!state.questions.length)state.step=1;
    }
  }catch(error){state=initial();startupError=error.message;workspaceCorrupt=true;}
  const hashPage=location.hash.slice(1);if(pages.includes(hashPage))state.page=hashPage;
  if(!DEMO&&role==='team'&&['editor','tasks','business-proposals'].includes(state.page))state.page='catalog';
  if(!DEMO&&role==='business'&&state.page==='team-proposals')state.page='business-proposals';
  state.error=startupError;
  function persist(){
    clearTimeout(saveTimer);
    if(workspaceCorrupt)return; // Не перезаписывать повреждённый сеанс до явного сброса.
    const {step,id,revision,task,questions,answers,questionsSource,cardReady,rating,confirmedFingerprint,record,exampleId}=state;
    const ok=S.storage.write(WORKSPACE,{version:1,step,id,revision,task,questions,answers,questionsSource,cardReady,rating,confirmedFingerprint,record,exampleId});
    state.autosave=ok?'Форма сохранена на устройстве':'Несохранённый ввод только в этой вкладке';
    document.querySelectorAll('[data-save-note]').forEach(node=>node.textContent=state.autosave);
  }
  function scheduleSave(){state.autosave='Сохраняем локально…';document.querySelectorAll('[data-save-note]').forEach(n=>n.textContent=state.autosave);clearTimeout(saveTimer);saveTimer=setTimeout(persist,180);}
  function toast(text){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=text;el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,4500);}
  function payload(){return {id:state.id,revision:state.revision,task:M.clone(state.task),questions:M.clone(state.questions),answers:M.clone(state.answers),questionsSource:state.questionsSource};}
  function hasUnsavedDraft(){
    if(!state.record)return Object.values(state.task).some(v=>v.trim())||Object.values(state.answers).some(v=>v.trim());
    return M.fingerprint(state.record.task)!==M.fingerprint(state.task)||
      JSON.stringify(state.questions)!==JSON.stringify(state.record.questions||[])||
      JSON.stringify(state.answers)!==JSON.stringify(state.record.answers||{});
  }
  function current(){return !!state.rating&&state.confirmedFingerprint===M.fingerprint(state.task);}
  function alreadyPublished(){return !!state.record?.published&&M.fingerprint(state.record.published.task)===M.fingerprint(state.task);}
  function recordFresh(r){return !!r.rating&&r.confirmed_fingerprint===M.fingerprint(r.task);}
  function takeRecord(r){
    M.validateRecord(r);state.id=r.id;state.revision=r.revision;state.task=M.clone(r.task);state.rating=r.rating;state.confirmedFingerprint=r.confirmed_fingerprint;state.record=M.clone(r);
    state.questions=M.clone(r.questions||[]);state.answers=M.clone(r.answers||{});
    const idx=state.records.findIndex(x=>x.id===r.id);if(idx<0)state.records.unshift(M.clone(r));else state.records[idx]=M.clone(r);
    state.records.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  }
  async function run(text,fn){
    if(state.busy)return;state.busy=true;state.busyText=text;state.error='';state.conflict=false;persist();render();
    try{await fn();persist();}
    catch(error){
      if(error?.savedRecord){takeRecord(error.savedRecord);persist();}
      state.conflict=error?.code==='REVISION_CONFLICT';
      state.error=state.conflict?'Сохранённая задача изменилась в другом сеансе. Ваш ввод остался в редакторе. Скачайте его перед загрузкой актуальной версии.':error?.message||'Не удалось выполнить действие. Ваш ввод остался в редакторе.';
    }
    finally{state.busy=false;state.busyText='';render();if(state.error)document.querySelector('.error-banner')?.scrollIntoView({block:'nearest'});}
  }
  function move(step){state.step=step;state.success=false;state.error='';state.ack=false;persist();render();window.scrollTo({top:0,behavior:'instant'});document.querySelector('#page-title')?.focus({preventScroll:true});}
  function openModal(title,content,actions='',handlers={}){
    if(dialog.open)dialog.close();
    dialog.innerHTML=`<div class="modal-head"><div class="dialog-title-wrap"><h2 id="dialog-title">${e(title)}</h2></div><button class="icon-button" type="button" data-modal="close" aria-label="Закрыть">${i('close')}</button></div><div class="modal-content">${content}</div>${actions?`<div class="modal-actions">${actions}</div>`:''}`;
    dialog.onclick=event=>{const action=event.target.closest('[data-modal]')?.dataset.modal;if(!action)return;if(handlers[action])handlers[action]();else if(action==='close')dialog.close();};
    dialog.showModal();
  }
  function ask(title,text,confirm='Продолжить',danger=false){
    return new Promise(resolve=>{
      let done=false;const finish=answer=>{if(done)return;done=true;dialog.onclose=null;dialog.close();resolve(answer);};
      openModal(title,`<p>${e(text)}</p>`,`<button class="btn secondary" data-modal="cancel">Отмена</button><button class="btn ${danger?'danger':'primary'}" data-modal="yes">${e(confirm)}</button>`,{cancel:()=>finish(false),yes:()=>finish(true),close:()=>finish(false)});
      dialog.onclose=()=>finish(false);
    });
  }
  function exportJSON(value,name='ai-sana-task.json'){
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function serviceLabel(){return DEMO?'Деморежим':({openai:'ИИ подключён',fallback:'Резервные вопросы',mock:'Демонстрация'}[service.lastAi?.mode]||'Сервис подключён');}
  function aiNotice(){
    if(DEMO||!['mock','fallback'].includes(service.lastAi?.mode))return '';
    const warnings=Array.isArray(service.lastAi.warnings)?service.lastAi.warnings.filter(w=>typeof w==='string'):[];
    return `<div class="service-notice" role="status">${i('info')}<div><strong>${e(serviceLabel())}</strong><p>${e(warnings.join(' ')||'Вопросы подготовлены по локальным правилам. Проверьте и подтвердите сведения в карточке.')}</p></div></div>`;
  }
  function validateDescription(){
    if(DEMO?!!state.task.description.trim():state.task.description.trim().length>=10)return true;
    state.step=1;state.success=false;state.error=DEMO?'Расскажите о задаче в поле «Что вы хотите улучшить?».':'Опишите задачу в поле «Что вы хотите улучшить?» — нужно не менее 10 символов без пробелов по краям.';
    render();document.getElementById('description')?.focus();return false;
  }
  function openRecord(r){
    takeRecord(r);state.page='editor';
    state.cardReady=!!r.rating||M.fields.some(f=>!['title','topic'].includes(f.key)&&M.meaningful(r.task[f.key]));
    state.step=state.cardReady?3:state.questions.length?2:1;state.questionsSource=r.questions_source??r.task.description;
    state.ack=false;state.exampleId=null;state.success=false;state.conflict=false;history.replaceState(null,'','#editor');
  }
  function filterTopics(){return [...new Set([...M.topics,...state.records.map(r=>r.task.topic),...state.catalog.map(r=>r.published?.task.topic)].filter(Boolean))];}
  function shell(){
    const title=({editor:'Конструктор задач',tasks:DEMO?'Мои задачи':'Задачи пространства',catalog:'Каталог задач','team-proposals':'Мои отклики','business-proposals':'Отклики команд',teams:'Команды'})[state.page];
    const inert=state.busy?'inert':'';
    return `${state.busy?`<div class="busy-strip" role="status" aria-live="polite"><span class="spinner"></span>${e(state.busyText)}</div>`:''}
    <aside class="sidebar" ${inert}>
      <a class="brand" href="#editor" aria-label="AI Sana — конструктор"><span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m7 25 9-19h3l9 19h-6l-5-11-5 11Z" fill="currentColor"/><path d="M3 25h9" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></span><span class="brand-name">AI <span>Sana</span><span style="color:#a6c78b">.</span></span></a>
      <div class="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav class="nav" aria-label="Основная навигация">
        ${DEMO||role==='business'?`<a class="nav-link ${state.page==='editor'?'active':''}" href="#editor" ${state.page==='editor'?'aria-current="page"':''}>${i('edit')}Конструктор</a>
        <a class="nav-link ${state.page==='tasks'?'active':''}" href="#tasks" ${state.page==='tasks'?'aria-current="page"':''}>${i('folder')}${DEMO?'Мои задачи':'Задачи пространства'} <span class="nav-count">${state.records.length}</span></a>`:''}
        <a class="nav-link ${state.page==='catalog'?'active':''}" href="#catalog" ${state.page==='catalog'?'aria-current="page"':''}>${i('grid')}Каталог</a>
        ${!DEMO?`<a class="nav-link ${state.page.includes('proposals')?'active':''}" href="#${role==='team'?'team':'business'}-proposals" ${state.page.includes('proposals')?'aria-current="page"':''}>${i('send')}${role==='team'?'Мои отклики':'Отклики команд'}</a>
        <a class="nav-link ${state.page==='teams'?'active':''}" href="#teams" ${state.page==='teams'?'aria-current="page"':''}>${i('business')}Команды</a>`:''}
      </nav>
      <div class="sidebar-note"><div class="note-icon">${i('spark')}</div><h3>Сначала ясность.<br>Потом решение.</h3><p>Хорошее описание помогает студентам понять вашу задачу и предложить подходящую идею.</p><button class="text-link" data-action="help">Как это работает ${i('arrow','sm')}</button></div>
      <div class="sidebar-bottom"><span class="dot"></span>${DEMO?'ЛОКАЛЬНАЯ ВЕРСИЯ':'СЕРВИС ПОДКЛЮЧЁН'} <span style="margin-left:auto">01</span></div>
    </aside>
    <div class="main-shell"><header class="topbar" ${inert}><div class="breadcrumb">Рабочее пространство <span>/</span> <strong>${title}</strong></div><div class="topbar-right"><button class="pill ${DEMO||['mock','fallback'].includes(service.lastAi?.mode)?'orange':'outline'}" style="border:0;cursor:pointer" data-action="help"><span class="dot"></span>${e(serviceLabel())}</button>${DEMO?'<span class="mode-label">Бизнес</span>':`<label class="role-picker"><span>Режим демонстрации</span><select id="role-select" aria-label="Режим демонстрации"><option value="business" ${role==='business'?'selected':''}>Бизнес</option><option value="team" ${role==='team'?'selected':''}>Команда</option></select></label>`}</div></header>
    <main class="page" id="main" ${inert} aria-busy="${state.busy}">
      ${state.error?`<div class="error-banner" role="alert">${i('info')}<div><span>${e(state.error)}</span>${state.conflict?`<div class="row wrap recovery-actions">${btn('export-current','Скачать текущий JSON','secondary small','download')}${btn('reload-current','Загрузить сохранённую версию','secondary small','folder')}</div>`:''}${workspaceCorrupt&&!DEMO?`<div class="row wrap recovery-actions">${btn('reset-workspace','Сбросить локальный сеанс','secondary small')}</div>`:''}</div><button class="text-link" data-action="dismiss-error" aria-label="Закрыть ошибку">${i('close','sm')}</button></div>`:''}
      ${!S.storage.available?`<div class="error-banner" role="status">${i('info')}${DEMO?'Хранилище недоступно: данные живут только в этой вкладке. Экспортируйте JSON до закрытия.':'Автосохранение формы на устройстве недоступно. Сохраните черновик на сервере или скачайте JSON перед закрытием вкладки.'}</div>`:''}
      ${aiNotice()}
      ${!DEMO&&collaborationPages.includes(state.page)?collaboration.render(state.page):state.page==='editor'?editor():state.page==='tasks'?tasksPage():catalogPage()}
      <footer class="footer-note"><span>AI Sana · Бизнес и студенческие команды</span><span>ОТ ИДЕИ К РЕЗУЛЬТАТУ</span></footer>
    </main></div>`;
  }
  function render(){app.innerHTML=shell();}
  function heading(kicker,title,sub,actions){return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1 id="page-title" tabindex="-1">${title}</h1><p>${sub}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;}
  function demoStrip(){return DEMO?`<div class="demo-strip">${i('info','sm')}<span>Автономная версия: вопросы по шаблону, деморейтинг, данные только в этом браузере.</span><button class="text-link" data-action="help">Подробнее ${i('arrow','sm')}</button></div>`:'';}
  function editor(){
    if(state.success)return successPage();
    const title=state.step===1?'Дайте идее<br>понятную форму.':state.step===2?'Чуть больше деталей.<br>Гораздо точнее задача.':'Ваша задача.<br>Всё на своих местах.';
    const sub=state.step===1?'Опишите потребность — и подготовьте задачу к работе со студентами.':state.step===2?'Ответьте на вопросы, чтобы команда увидела главное.':'Проверьте формулировки, подтвердите сведения и опубликуйте карточку.';
    return heading(state.id?'РЕДАКТИРОВАНИЕ ЗАДАЧИ':'НОВАЯ ВОЗМОЖНОСТЬ ДЛЯ КОМАНД',title,sub,`${btn('save','Сохранить черновик','secondary','save')}<span class="save-note">${i('check','sm')}<span data-save-note>${e(state.autosave)}</span></span>`)+
      `<ol class="steps" aria-label="Этапы создания">${[['Описание','Что нужно решить'],['Уточнение','Раскройте детали'],['Карточка','Проверьте и опубликуйте']].map((s,n)=>`<li class="step ${state.step===n+1?'active':state.step>n+1?'done':''}" ${state.step===n+1?'aria-current="step"':''}><span class="step-number">${state.step>n+1?i('check','sm'):'0'+(n+1)}</span><div><div class="step-label">${s[0]}</div><div class="step-sub">${s[1]}</div></div></li>`).join('')}</ol>`+demoStrip()+
      `<div class="editor-layout"><div class="main-column">${state.step===1?descriptionPage():state.step===2?questionsPage():cardPage()}</div>${state.step===3?ratingAside():introAside()}</div>`;
  }
  function topicSelect(value,id,attr=''){
    return `<select id="${id}" ${attr}><option value="">Выберите тему</option>${[...M.topics,...(value&&!M.topics.includes(value)?[value]:[])].map(t=>`<option ${t===value?'selected':''} value="${e(t)}">${e(t)}</option>`).join('')}</select>`;
  }
  function descriptionPage(){
    return `<section class="card" aria-labelledby="description-heading"><div class="card-body"><div class="card-heading"><div><h2 id="description-heading">С чего начнём?</h2><p>Не нужно писать техническое задание. Расскажите своими словами.</p></div><span class="section-no">01</span></div>
      <div class="field-grid"><div class="field"><label for="draft-title">Название <span class="optional">можно позже</span></label><input id="draft-title" data-task="title" maxlength="6000" value="${e(state.task.title)}" placeholder="Например, учёт заявок на ремонт"></div><div class="field"><label for="draft-topic">Тема <span class="optional">можно позже</span></label>${topicSelect(state.task.topic,'draft-topic','data-task="topic"')}</div>
      <div class="field full"><label for="description">Что вы хотите улучшить?</label><textarea id="description" class="big-text" data-task="description" maxlength="12000" aria-describedby="description-help" placeholder="Что происходит сейчас? С какой проблемой вы сталкиваетесь?\n\nНапример: заявки приходят в разные мессенджеры, часть из них теряется. Хотим собрать всё в одном месте.">${e(state.task.description)}</textarea><div class="description-meta"><span id="description-help">Контекст, проблема и желаемое изменение${DEMO?'':' · от 10 символов'}</span><span id="description-count">${state.task.description.length} / 12 000</span></div></div></div>
      ${DEMO?`<div class="examples-area"><div class="examples-label">${i('spark','sm')}Попробуйте на вымышленном примере</div><div class="example-chips">${S.examples.map(ex=>`<button type="button" class="example-chip ${state.exampleId===ex.id?'selected':''}" data-action="example" data-id="${ex.id}">${i(ex.icon)}${ex.name}</button>`).join('')}</div></div>`:''}
      </div><div class="form-footer"><span class="foot-lock">${i('lock')}Ничего не публикуется без вас</span>${btn('questions','Уточнить задачу','primary','arrow')}</div></section>
      ${location.protocol==='file:'?`<div class="file-banner">Открыто как локальный файл. Для стабильного сохранения между сеансами используйте START_WINDOWS.cmd.</div>`:''}`;
  }
  function introAside(){return `<aside class="aside" aria-label="О создании задачи"><section class="card preview-card"><div class="mini-kicker">МЕНЬШЕ НЕОПРЕДЕЛЁННОСТИ</div><div class="orbit"><span class="orbit-dot"></span><span class="orbit-dot two"></span><div class="orbit-center">${i('doc')}</div></div><h3>Из идеи — в задачу,<br>с которой можно работать.</h3><p>Контекст, ожидаемый результат и критерии успеха соберутся в одной карточке.</p><div class="mini-check">${i('check')}Все формулировки можно изменить</div></section><section class="card aside-info"><div class="info-icon">${i('chart')}<h3>Полнее задача — выше рейтинг</h3></div><p>Баллы показывают готовность задачи к работе, а не известность компании.</p><div class="aside-list"><div class="item">${i('check')}Сведения подтверждаете вы</div><div class="item">${i('check')}Команды выбирают задачи сами</div><div class="item">${i('check')}Решение о сотрудничестве — за бизнесом</div></div></section><div class="safety-note">${i('shield')}${DEMO?'Для демо используйте вымышленные контакты и обезличенные данные.':'Укажите контакт, по которому команда сможет обсудить задачу.'}</div></aside>`;}
  function questionsPage(){
    const answered=state.questions.filter(q=>state.answers[q.id]?.trim()).length;
    const ex=S.examples.find(x=>x.id===state.exampleId);
    return `<section class="card"><div class="question-top"><div class="row between"><h2>Раскройте детали</h2><span class="pill gray" id="answered-count">${answered} из ${state.questions.length}</span></div><p>Не знаете ответ? Оставьте поле пустым и дополните карточку позже.</p></div>
      ${DEMO&&ex?`<div class="question-action"><p>Демонстрационный сценарий «${e(ex.name)}».<br>Ответы не придуманы ИИ — это готовый тестовый набор.</p>${btn('sample-answers','Подставить пример','secondary small','spark')}</div>`:''}
      <div>${state.questions.map((q,n)=>`<div class="question-card"><div class="question-title"><span class="question-index">${String(n+1).padStart(2,'0')}</span><div><label for="answer-${e(q.id)}">${e(q.text)}</label><div class="hint" id="hint-${e(q.id)}">${e(q.hint||'')}</div></div></div><div class="field"><textarea id="answer-${e(q.id)}" data-answer="${e(q.id)}" maxlength="${fieldByKey(q.field)?.max||3000}" aria-describedby="hint-${e(q.id)}" placeholder="Ваш ответ…">${e(state.answers[q.id]||'')}</textarea></div></div>`).join('')}</div>
      <div class="form-footer">${btn('back-description','Назад','ghost','back')}${btn('build','Сформировать карточку','primary','arrow')}</div></section>`;
  }
  function field(key){
    const f=fieldByKey(key),value=state.task[key];
    return `<div class="field ${!['title','topic','users','contact','interaction_format'].includes(key)?'full':''}" id="field-${key}"><label for="card-${key}">${e(f.label)}${key==='title'?'<span class="optional">нужно для публикации</span>':''}</label>${f.kind==='select'?topicSelect(value,'card-'+key,'data-task="'+key+'"'):f.kind==='input'?`<input id="card-${key}" data-task="${key}" maxlength="${f.max}" value="${e(value)}" placeholder="${e(f.hint||'')}">`:`<textarea id="card-${key}" data-task="${key}" maxlength="${f.max}" placeholder="${e(f.hint||'')}">${e(value)}</textarea>`}</div>`;
  }
  function cardPage(){return `
    ${state.record?.published?`<div class="inline-notice">${i('globe')}${DEMO?'В каталоге уже есть опубликованная версия. Правки появятся там только после повторного подтверждения и публикации.':'Задача опубликована. Сохранение изменений вернёт её в черновики и уберёт из каталога. Затем подтвердите сведения и опубликуйте задачу заново.'}</div>`:''}
    <div id="stale-note" class="stale-note" ${state.rating&&!current()?'':'hidden'}>${i('info')}${DEMO?'Есть неподтверждённые изменения. Оценка относится к предыдущей версии.':'Проверьте и подтвердите актуальную карточку. Показанная оценка учитывает только сведения, уже подтверждённые на сервере.'}</div>
    ${M.groups.map((g,n)=>`<section class="card"><div class="card-body"><div class="card-heading"><div><h2>${g.title}</h2><p>${g.subtitle}</p></div><span class="section-no">0${n+1}</span></div><div class="field-grid">${g.keys.map(field).join('')}</div></div></section>`).join('')}
    <div class="card confirmation"><label class="checkbox-line"><input id="confirm-checkbox" type="checkbox" ${state.ack?'checked':''}><span>Я проверил сведения в карточке и подтверждаю заполненные поля.</span></label><p>Пустые поля не добавляют баллов. Низкий рейтинг не запрещает публикацию.</p></div>
    <div class="action-bar">${btn('back-questions','Назад','ghost','back')}<div class="row">${btn('confirm','Подтвердить и оценить','secondary','check',`id="confirm-button" ${!state.ack?'disabled':''}`)}${btn('publish',alreadyPublished()&&current()?'Опубликовано':'Опубликовать','primary','send',`id="publish-button" ${!current()||alreadyPublished()?'disabled':''}`)}</div></div>`;}
  function ratingAside(){
    const r=state.rating,ok=current(),unconfirmed=(r?.unconfirmed_fields||[]).map(item=>typeof item==='string'?fieldByKey(item):{key:item.key,label:item.label}).filter(Boolean);
    return `<aside class="aside sticky" aria-label="Рейтинг готовности"><section class="card score-card"><div class="score-header"><h3>Готовность задачи</h3><button type="button" class="text-link" data-action="help" aria-label="Как считается рейтинг">${i('info','sm')}</button></div>
      <div class="score-ring ${r&&!ok?'stale':''}" style="--score:${r?.total_score||0}" role="img" aria-label="${r?'Последняя оценка: '+r.total_score+' из 100':'Оценка ещё не рассчитана'}"><div class="score-value"><b>${r?r.total_score:'—'}</b><small>из 100 баллов</small></div></div>
      <div class="score-level"><span id="score-level" class="pill ${!r||!ok?'gray':''}">${r?(ok?e(r.level.label):(DEMO?'Предыдущая оценка':'Требует подтверждения')):'Ожидает подтверждения'}</span></div>
      <p class="score-summary">${ok?'Оценка рассчитана по подтверждённым сведениям. Дополните карточку, чтобы повысить её готовность.':'Проверьте карточку и подтвердите заполненные поля для расчёта рейтинга.'}</p>
      ${r?`<div class="rubric">${r.breakdown.map(b=>`<div class="rubric-item" title="${e(b.reason||'')}"><div class="row"><span>${e(b.label)}</span><b>${b.earned} / ${b.max}</b></div><div class="rubric-track"><span style="width:${b.max?Math.max(0,Math.min(100,b.earned/b.max*100)):0}%"></span></div></div>`).join('')}</div>`:`<div class="pending-score">Система оценит контекст, данные, результат, критерии успеха, ограничения, пользователей и связь с бизнесом.</div>`}
      ${DEMO?'<p class="privacy-note" style="margin-top:17px">Демооценка: проверяется наличие текста, а не его смысл. После подключения используем рейтинг вашего сервера.</p>':''}
      </section>
      ${r?`<section class="card missing"><h3>${r.missing_fields.length?'Что можно дополнить':unconfirmed.length?'Нужно подтверждение':'Все сведения заполнены'}</h3><p class="tiny muted">${r.missing_fields.length?(DEMO?'По последней подтверждённой версии.':'По последней сохранённой карточке.'):'Проверьте, что формулировки понятны команде.'}</p>${r.missing_fields.map(m=>`<div class="missing-item"><span>${e(m.label)}</span><button type="button" class="text-link" data-action="focus-field" data-id="${e(m.key)}">Дополнить ${i('arrow','sm')}</button></div>`).join('')}${unconfirmed.length?`<p class="privacy-note">Подтвердите заполненные поля: ${unconfirmed.map(f=>e(f.label)).join(', ')}.</p>`:''}${Array.isArray(r.recommendations)&&r.recommendations.length?`<details class="rating-recommendations"><summary>Как повысить готовность</summary>${r.recommendations.map(text=>`<p>${e(text)}</p>`).join('')}</details>`:''}</section>`:''}
      <section class="card aside-info"><div class="info-icon">${i('eye')}<h3>Посмотрите глазами команды</h3></div><p>Перед публикацией проверьте, достаточно ли контекста, чтобы предложить решение.</p><div class="row wrap" style="margin-top:14px">${btn('preview-working','Предпросмотр','secondary small','eye')}${btn('export-current','JSON','ghost small','download')}</div></section></aside>`;
  }
  function successPage(){return heading('НОВЫЙ ШАГ К СОТРУДНИЧЕСТВУ','Задача готова<br>к знакомству с командами.',DEMO?'Публикация выполнена в локальном демонстрационном каталоге.':'Публикация подтверждена сервером.',btn('new','Новая задача','secondary','plus'))+demoStrip()+`<section class="card success-block"><div class="success-icon">${i('check')}</div><h2>${DEMO?'Опубликовано в демокаталоге':'Задача опубликована'}</h2><p>${DEMO?'Реальные студенты пока не увидят эту задачу. Сейчас она доступна только в вашем браузере.':'Команды могут просмотреть опубликованную задачу.'}</p><div class="success-card-name">${e(state.task.title)} <span class="pill" style="margin-left:8px">${state.rating.total_score} / 100</span></div><div class="row">${btn('goto-catalog','Открыть каталог','primary','arrow')}${btn('return-editor','Вернуться к карточке','secondary','edit')}${btn('export-current','Экспорт JSON','ghost','download')}</div></section>`;}
  function tasksPage(){
    const published=state.records.filter(r=>r.published).length;
    return heading('ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО','Идеи, которые<br>становятся задачами.',DEMO?'Черновики и опубликованные задачи на этом устройстве.':'Сохранённые задачи вашего рабочего пространства.',`${btn('new','Создать задачу','primary','plus')}${btn('export-all','Экспорт всех задач','ghost small','download')}`)+
      `<div class="list-stats">${[[state.records.length,'Всего задач','folder'],[state.records.length-published,'Черновики','edit'],[published,'Опубликовано','globe']].map(s=>`<div class="card stat-card"><div class="stat-icon">${i(s[2])}</div><div><b>${s[0]}</b><p>${s[1]}</p></div></div>`).join('')}</div>`+
      filters(false)+`<div id="results">${listing(false)}</div>`;
  }
  function catalogPage(){return heading('ОТКРЫТЫЕ ВОЗМОЖНОСТИ','Задачи, с которых<br>начинается практика.',DEMO?'Локальный предпросмотр каталога. Отклики и выбор команд — отдельный модуль.':'Предпросмотр опубликованных задач. Отклики подключаются отдельно.',`${btn('new','Создать задачу','primary','plus')}${DEMO?btn('seed','Добавить 5 демозадач','ghost small','spark'):''}`)+demoStrip()+filters(true)+`<div id="results">${listing(true)}</div>`;}
  function filters(catalog){return `<div class="filters"><div class="search-box">${i('search')}<input class="filter-input" type="search" data-filter="search" value="${e(state.filter.search)}" placeholder="Найти задачу по названию или описанию" aria-label="Поиск задач"></div><select data-filter="topic" aria-label="Фильтр по теме"><option value="">Все темы</option>${(DEMO?M.topics:filterTopics()).map(t=>`<option value="${e(t)}" ${state.filter.topic===t?'selected':''}>${e(t)}</option>`).join('')}</select><select data-filter="status" aria-label="${catalog?'Уровень готовности':'Статус публикации'}"><option value="">${catalog?'Любая готовность':'Любой статус'}</option>${(catalog?[['draft','0–39 · Уточнить'],['working','40–69 · Рабочая'],['ready','70–89 · Готовая'],['priority','90–100 · Приоритетная']]:[['draft','Черновики'],['published','Опубликованные']]).map(([v,l])=>`<option value="${v}" ${state.filter.status===v?'selected':''}>${l}</option>`).join('')}</select></div>`;}
  function listing(catalog){
    const source=catalog?state.catalog:state.records;
    const query=state.filter.search.trim().toLowerCase();
    const items=source.filter(r=>{
      const task=catalog?r.published?.task:r.task;if(!task)return false;
      const status=catalog?r.published.rating.level.key:r.published?'published':'draft';
      return (!query||[task.title,task.description,task.need,task.context].join(' ').toLowerCase().includes(query))&&(!state.filter.topic||task.topic===state.filter.topic)&&(!state.filter.status||status===state.filter.status);
    });
    if(!items.length)return `<section class="card empty-state"><div class="empty-icon">${i(catalog?'grid':'folder')}</div><h2>${source.length?'Ничего не нашлось':catalog?'Здесь появятся опубликованные задачи':'У каждой задачи есть начало'}</h2><p>${source.length?'Попробуйте другую формулировку или сбросьте фильтры.':catalog?'Подтвердите карточку и опубликуйте её. Даже низкий рейтинг не скроет задачу из каталога.':'Создайте описание и сохраните первый черновик. Его можно будет открыть и дополнить позже.'}</p><div class="row wrap">${source.length?btn('clear-filters','Сбросить фильтры','secondary'):btn('new','Создать задачу','primary','plus')}${!source.length&&catalog&&DEMO?btn('seed','5 демозадач','secondary','spark'):''}</div></section>`;
    return `<div class="${catalog?'catalog-grid':'list-grid'}">${items.map(r=>catalog?catalogCard(r):taskRow(r)).join('')}</div>`;
  }
  function taskRow(r){
    const fresh=recordFresh(r);
    return `<article class="card task-row"><div class="score-tile" title="Последняя оценка сохранённых сведений"><strong>${r.rating?r.rating.total_score:'—'}</strong><small>${r.rating?(fresh?'из 100':'не подтверждено'):'не оценена'}</small></div><div class="task-info"><h3>${e(r.task.title||'Задача без названия')}</h3><p>${e((r.task.context||r.task.description||'Описание ещё не добавлено').slice(0,135))}${(r.task.context||r.task.description||'').length>135?'…':''}</p><div class="row"><span class="pill ${r.published?'':'gray'}">${r.published?'Опубликована':'Черновик'}</span>${r.task.topic?`<span class="pill outline">${e(r.task.topic)}</span>`:''}${r.rating&&!fresh?'<span class="pill orange">Есть правки</span>':''}<small class="muted">${new Date(r.updated_at).toLocaleDateString('ru-RU')}</small></div></div><div class="task-actions">${btn('open-task','Редактировать','secondary small','edit',`data-id="${e(r.id)}"`)}${btn('export-task','JSON','ghost small','download',`data-id="${e(r.id)}"`)}</div></article>`;
  }
  function catalogCard(r){const t=r.published.task,score=r.published.rating;return `<article class="card catalog-card"><div class="row between"><span class="pill outline">${e(t.topic||'Без темы')}</span><span class="pill ${score.total_score<40?'orange':''}">${e(score.level.label)}</span></div><h3>${e(t.title)}</h3><p>${e(t.need||t.context||t.description||'Описание требует уточнения.')}</p><div class="bottom"><span class="rank">${i('chart','sm')}${score.total_score} <span class="muted" style="font-weight:400;font-size:10px">/ 100</span></span><button class="text-link" data-action="view-public" data-id="${e(r.id)}">Посмотреть задачу ${i('arrow','sm')}</button></div></article>`;}
  function preview(task,score,title='Предпросмотр карточки'){
    openModal(title,`<div class="row wrap" style="margin-bottom:15px"><span class="pill outline">${e(task.topic||'Без темы')}</span>${score?`<span class="pill">${score.total_score} / 100 · ${e(score.level.label)}</span>`:'<span class="pill gray">Ещё не подтверждена</span>'}</div><h2 style="font-size:23px;margin-bottom:24px;overflow-wrap:anywhere">${e(task.title||'Задача без названия')}</h2>${M.fields.filter(f=>!['title','topic'].includes(f.key)).map(f=>`<div class="detail-field"><h3>${e(f.label)}</h3><p>${e(task[f.key]||'Пока не указано')}</p></div>`).join('')}<div class="help-callout">${DEMO?'Локальная демонстрация. Отклики студентов и выбор команды здесь не реализованы.':'В каталоге команда может отправить предложение. В разделе «Отклики команд» бизнес принимает решение.'}</div>`,`<button class="btn secondary" data-modal="close">Закрыть</button>`);
  }
  function help(){
    openModal(DEMO?'О демоверсии':'Как работает конструктор',
      `<p>Это редактор задачи для представителя бизнеса: описание → уточнение → карточка → подтверждение → публикация.</p>
      <div class="help-callout">${DEMO?'<strong>ИИ и ваш backend не подключены.</strong> Вопросы берутся из фиксированного шаблона. Карточка переносит только введённый текст. Деморейтинг проверяет наличие сведений, а не их смысл.':`<strong>${e(serviceLabel())}.</strong> ${service.lastAi?.mode==='openai'?'ИИ помогает уточнить описание и подготовить карточку из предоставленных сведений.':service.lastAi?'Сейчас вопросы подготавливаются по локальным правилам; ваши ответы сохраняются.':'После уточнения задачи здесь будет показан режим подготовки вопросов.'} Проверьте текст и подтвердите заполненные поля перед публикацией.`}</div>
      <h3>Как устроен рейтинг готовности</h3><p>Контекст и потребность — 20; данные — 20; ожидаемый результат — 15; критерии успеха — 15; ограничения — 10; пользователи — 10; связь с бизнесом — 10. Начисление — только после подтверждения.</p>
      <p>0–39 — требует уточнения; 40–69 — рабочая; 70–89 — готовая; 90–100 — приоритетная. Низкий рейтинг не запрещает публикацию.</p>
      <h3>Где находятся данные</h3><p>${DEMO?'Данные сохраняются в этом браузере. Другой браузер, адрес или устройство получит отдельное хранилище.':'Кнопка «Сохранить черновик» отправляет задачу на сервер. Незавершённая форма дополнительно сохраняется на этом устройстве. Список задач общий для рабочего пространства.'} Экспорт JSON сохраняет копию текущих сведений в файл.</p>
      ${DEMO?'':`<h3>Изменение опубликованной задачи</h3><p>После сохранения правок задача становится черновиком и исчезает из каталога. Подтвердите сведения и опубликуйте её заново. В каталоге доступны все опубликованные задачи. В режиме «Команда» можно отправить отклик и посмотреть его статус; в режиме «Бизнес» — принять или отклонить предложения. Можно принять несколько команд.</p>`}
      <p style="margin-top:14px">Сохранить черновик: <span class="keyboard">Ctrl + S</span>. В диалоге можно нажать <span class="keyboard">Esc</span>.</p>`,
      `${DEMO?'<button class="btn secondary small" data-modal="fail">Проверить ошибку запроса</button><button class="btn danger small" data-modal="reset">Сбросить демоданные</button>':workspaceCorrupt?'<button class="btn secondary small" data-modal="workspace">Сбросить локальный сеанс</button>':''}<button class="btn primary small" data-modal="close">Понятно</button>`,
      {workspace:()=>{dialog.close();action('reset-workspace');},fail:()=>{service.failNext=true;dialog.close();toast('Следующая операция сервиса завершится тестовой ошибкой.');},reset:async()=>{
        dialog.close();if(await ask('Сбросить демоданные?','Удалятся только задачи и текущий черновик AI Sana в этом браузере. Перед сбросом экспортируйте важные данные.','Сбросить',true)){
          service.reset();workspaceCorrupt=false;startupError='';state=initial();persist();location.hash='editor';render();toast('Демоданные сброшены.');
        }
      }});
  }
  async function refresh(){state.records=await service.listTasks();state.catalog=await service.listPublished();}
  async function navigate(page){
    if(collaboration?.isBusy()){toast('Дождитесь завершения текущего действия.');return;}
    if(!pages.includes(page))return;
    if(!DEMO&&role==='team'&&['editor','tasks','business-proposals'].includes(page))page='catalog';
    if(!DEMO&&role==='business'&&page==='team-proposals')page='business-proposals';
    if(state.busy)return;persist();state.page=page;state.error='';state.filter={search:'',topic:'',status:''};
    if(location.hash!==('#'+page))history.replaceState(null,'','#'+page);
    if(page==='editor'){render();window.scrollTo({top:0,behavior:'instant'});return;}
    await run('Открываем раздел…',async()=>{await refresh();if(!DEMO&&collaborationPages.includes(page))await collaboration.load(page);});window.scrollTo({top:0,behavior:'instant'});
  }
  async function newTask(){
    if(hasUnsavedDraft()){
      if(!await ask('Начать новую задачу?','Текущий незавершённый сеанс будет заменён. Сохранённые задачи останутся в рабочем пространстве. Для сохранения этого сеанса сначала нажмите «Сохранить черновик».','Новая задача'))return;
    }
    const records=state.records,catalog=state.catalog;state={...initial(),records,catalog};persist();history.replaceState(null,'','#editor');render();window.scrollTo({top:0,behavior:'instant'});
  }
  async function action(name,element){
    if(state.busy)return;
    if(!DEMO&&name.startsWith('collab-')){await collaboration.handleAction(name,element);return;}
    switch(name){
      case 'help':help();break;
      case 'dismiss-error':state.error='';render();break;
      case 'reset-workspace':{
        if(DEMO||!workspaceCorrupt)return;
        if(!await ask('Сбросить локальный сеанс?','Удалится только незавершённая форма на этом устройстве. Сохранённые на сервере задачи останутся.','Сбросить сеанс',true))return;
        if(!S.storage.remove(WORKSPACE)){state.error='Не удалось сбросить локальный сеанс: хранилище браузера недоступно.';render();return;}
        workspaceCorrupt=false;startupError='';const records=state.records,catalog=state.catalog;state={...initial(),records,catalog};
        persist();history.replaceState(null,'','#editor');render();toast('Локальный сеанс сброшен. Сохранённую задачу можно открыть в рабочем пространстве.');break;}
      case 'reload-current':{
        if(!state.id)return;
        if(!await ask('Загрузить сохранённую версию?','Текущий ввод будет заменён сведениями с сервера. Если он нужен, сначала отмените действие и нажмите «Скачать текущий JSON».','Загрузить версию'))return;
        await run('Загружаем сохранённую версию…',async()=>{openRecord(await service.getTask({id:state.id}));});break;}
      case 'new':await newTask();break;
      case 'save':
        if(!DEMO&&!validateDescription())break;
        if(!Object.values(state.task).some(v=>v.trim())){state.error='Введите описание или заполните хотя бы одно поле карточки.';render();break;}
        await run('Сохраняем черновик…',async()=>{takeRecord(await service.saveDraft(payload()));toast(DEMO?(S.storage.available?'Черновик сохранён. Он доступен в разделе «Мои задачи».':'Черновик только в памяти вкладки. Экспортируйте JSON.'):'Задача сохранена на сервере и доступна в разделе «Задачи пространства».');});break;
      case 'example':{
        const ex=S.examples.find(x=>x.id===element.dataset.id);if(!ex)return;
        if((state.task.description||state.cardReady)&&!await ask('Подставить вымышленный пример?','Это заменит текущий незавершённый сеанс редактора. Ранее сохранённые задачи останутся.','Подставить'))return;
        const records=state.records,catalog=state.catalog;state={...initial(),records,catalog,exampleId:ex.id};
        state.task.title=ex.title;state.task.description=ex.description;state.task.topic=ex.tag;persist();render();toast('Добавлен вымышленный пример. Ничего не опубликовано.');break;}
      case 'questions':{
        if(!validateDescription())break;
        if(state.questions.length&&state.questionsSource===state.task.description){move(2);break;}
        if(state.cardReady&&!await ask('Обновить уточняющие вопросы?','Вопросы будут построены заново. Ответы и поля существующей карточки пока останутся; их замена произойдёт только при повторном формировании карточки.','Обновить вопросы'))return;
        await run('Готовим уточняющие вопросы…',async()=>{state.questions=M.validateQuestions(await service.generateQuestions({description:state.task.description}));state.questionsSource=state.task.description;state.step=2;});window.scrollTo({top:0,behavior:'instant'});break;}
      case 'back-description':move(1);break;
      case 'back-questions':move(state.questions.length?2:1);break;
      case 'sample-answers':{
        const ex=S.examples.find(x=>x.id===state.exampleId);if(!ex)return;
        if(Object.values(state.answers).some(v=>v.trim())&&!await ask('Заменить ответы примером?','Текущие ответы будут заменены вымышленными демонстрационными сведениями.','Заменить'))return;
        state.questions.forEach(q=>{state.answers[q.id]=ex[q.field]||'';});persist();render();toast('Подставлены тестовые ответы. Контакт и формат связи можно добавить в карточке.');break;}
      case 'build':
        if(!DEMO&&!validateDescription())break;
        if(state.cardReady&&!await ask('Сформировать карточку заново?','Поля, связанные с уточняющими вопросами, будут заменены текущими ответами. Прочие поля сохранятся.','Сформировать'))return;
        await run('Собираем карточку из ваших ответов…',async()=>{state.task=M.normalizeTask(await service.buildCard({task:state.task,questions:state.questions,answers:state.answers}));state.cardReady=true;state.step=3;state.ack=false;});window.scrollTo({top:0,behavior:'instant'});break;
      case 'confirm':
        if(!state.ack){toast('Сначала отметьте, что вы проверили сведения.');return;}
        if(!DEMO&&!validateDescription())break;
        await run('Подтверждаем сведения и получаем оценку…',async()=>{const record=await service.confirmAndEvaluate(payload());if(!record.rating)throw new Error('Сервис не вернул рейтинг подтверждённой карточки.');takeRecord(record);if(!current())throw new Error('Не удалось подтвердить актуальную карточку. Проверьте заполненные поля и повторите подтверждение.');state.ack=false;toast('Сведения подтверждены. Готовность: '+record.rating.total_score+' из 100.');});break;
      case 'publish':
        if(!current()){toast('Подтвердите текущую версию карточки.');return;}
        if(!M.meaningful(state.task.title)){state.error='Добавьте название задачи и заново подтвердите карточку.';render();document.getElementById('card-title')?.focus();return;}
        if(!await ask(state.record?.published?'Обновить публикацию?':'Опубликовать задачу?',DEMO?'Карточка появится только в локальном демокаталоге этого браузера. Настоящий сервер пока не подключён.':'Подтверждённая карточка будет размещена в общем каталоге. Решение о сотрудничестве останется за вами.','Опубликовать'))return;
        await run('Публикуем подтверждённую карточку…',async()=>{
          const record=await service.publish({id:state.id,revision:state.revision});
          if(!record.published)throw new Error('Сервис не подтвердил публикацию. Проверьте её статус перед повтором.');
          takeRecord(record);state.success=true;
          window.dispatchEvent(new CustomEvent('sana:task-published',{detail:{id:record.id,record:M.clone(record)}}));
        });window.scrollTo({top:0,behavior:'instant'});break;
      case 'return-editor':state.success=false;move(3);break;
      case 'goto-catalog':if(DEMO)await navigate('catalog');else await collaboration.handleAction('collab-back-catalog',element);break;
      case 'focus-field':{
        const el=document.getElementById('card-'+element.dataset.id);el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus({preventScroll:true});break;}
      case 'preview-working':preview(state.task,current()?state.rating:null);break;
      case 'export-current':exportJSON({schema_version:1,mode:service.kind,exported_at:new Date().toISOString(),...payload(),rating:state.rating,rating_is_current:current(),published:state.record?.published||null});break;
      case 'export-all':await run('Подготавливаем экспорт…',async()=>{const tasks=await service.listTasks();exportJSON({schema_version:1,mode:service.kind,exported_at:new Date().toISOString(),tasks},'ai-sana-tasks.json');});break;
      case 'export-task':{
        const record=state.records.find(r=>r.id===element.dataset.id);if(record)exportJSON(record,'ai-sana-'+record.id+'.json');break;}
      case 'open-task':
        if(hasUnsavedDraft()&&!await ask('Открыть сохранённую задачу?','Текущие несохранённые изменения сеанса будут заменены. Сначала сохраните черновик или экспортируйте JSON, если они нужны.','Открыть'))return;
        await run('Открываем сохранённую задачу…',async()=>{
          openRecord(await service.getTask({id:element.dataset.id}));
        });window.scrollTo({top:0,behavior:'instant'});break;
      case 'view-public':{
        const r=state.catalog.find(r=>r.id===element.dataset.id);if(r)preview(r.published.task,r.published.rating,'Опубликованная версия');break;}
      case 'seed':
        if(!DEMO)return;
        await run('Добавляем вымышленные задачи…',async()=>{await service.seedExamples();await refresh();toast('Добавлены 5 синтетических задач разной готовности.');});break;
      case 'clear-filters':state.filter={search:'',topic:'',status:''};render();break;
      default:break;
    }
  }
  app.addEventListener('click',event=>{
    const nav=event.target.closest('a[href^="#"]');
    if(nav&&pages.includes(nav.getAttribute('href').slice(1))){
      event.preventDefault();const page=nav.getAttribute('href').slice(1);
      if(page==='catalog'&&!DEMO&&!state.busy)collaboration.handleAction('collab-back-catalog',nav).catch(error=>{state.error=error.message;render();});
      else navigate(page);return;
    }
    const button=event.target.closest('[data-action]');if(button&&!button.disabled)action(button.dataset.action,button).catch(error=>{state.error=error.message;render();});
  });
  function editedInput(event){
    if(!DEMO)collaboration.handleInput(event);
    const target=event.target;
    if(target.dataset.task){
      state.task[target.dataset.task]=target.value;
      state.ack=false;state.success=false;
      if(target.dataset.task==='description'){
        if(state.exampleId&&S.examples.find(ex=>ex.id===state.exampleId)?.description!==target.value)state.exampleId=null;
        const count=document.getElementById('description-count');if(count)count.textContent=target.value.length+' / 12 000';
      }
      const checkbox=document.getElementById('confirm-checkbox');if(checkbox)checkbox.checked=false;
      const confirm=document.getElementById('confirm-button');if(confirm)confirm.disabled=true;
      const publish=document.getElementById('publish-button');if(publish){publish.disabled=!current()||alreadyPublished();publish.innerHTML=i('send')+(alreadyPublished()&&current()?'Опубликовано':'Опубликовать');}
      const stale=document.getElementById('stale-note');if(stale)stale.hidden=!(state.rating&&!current());
      document.querySelector('.score-ring')?.classList.toggle('stale',!!state.rating&&!current());
      const level=document.getElementById('score-level');if(level&&state.rating){level.textContent=current()?state.rating.level.label:(DEMO?'Предыдущая оценка':'Требует подтверждения');level.classList.toggle('gray',!current());}
      scheduleSave();
    }else if(target.dataset.answer){
      state.answers[target.dataset.answer]=target.value;
      const count=document.getElementById('answered-count');if(count)count.textContent=state.questions.filter(q=>state.answers[q.id]?.trim()).length+' из '+state.questions.length;
      scheduleSave();
    }else if(target.dataset.filter){
      state.filter[target.dataset.filter]=target.value;
      const results=document.getElementById('results');if(results)results.innerHTML=listing(state.page==='catalog');
    }
  }
  app.addEventListener('input',editedInput);
  app.addEventListener('change',event=>{
    if(!DEMO){
      collaboration.handleChange(event);
      if(event.target.id==='role-select'){
        if(state.busy||collaboration.isBusy()){event.target.value=role;toast('Дождитесь завершения текущего действия.');return;}
        role=event.target.value==='team'?'team':'business';S.storage.write('aisana.role.v1',role);
        navigate(role==='team'?'catalog':'business-proposals');return;
      }
    }
    if(event.target.id==='confirm-checkbox'){state.ack=event.target.checked;const b=document.getElementById('confirm-button');if(b)b.disabled=!state.ack;}
  });
  window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(pages.includes(page))navigate(page);});
  window.addEventListener('pagehide',persist);
  window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&!dialog.open){event.preventDefault();if(state.page==='editor')action('save');}});
  // Публичный интерфейс для общей оболочки. Не требует доступа к приватному state.
  S.editor={
    openTask:async id=>{await action('open-task',{dataset:{id}});},
    newTask,
    getDraft:()=>M.clone(state.task),
    navigate,
    exportCurrent:()=>action('export-current')
  };
  if(!DEMO)collaboration=S.createCollaboration({service,e,i,btn,heading,openModal,toast,render,navigate,getRole:()=>role,openEditor:async id=>{
    role='business';S.storage.write('aisana.role.v1',role);await action('open-task',{dataset:{id}});
  }});
  render();
  run('Открываем рабочее пространство…',async()=>{await refresh();if(!DEMO&&collaborationPages.includes(state.page))await collaboration.load(state.page);if(startupError)throw new Error(startupError);});
})(window.Sana);
