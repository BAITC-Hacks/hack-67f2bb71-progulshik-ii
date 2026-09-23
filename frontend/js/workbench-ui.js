/* Optional workbench. Uses the editor's existing public API, normal input events
 * and service methods; never changes the score formula or publishes silently. */
(function(S){
  'use strict';
  const W=S.workbench,M=S.model,clone=W.clone;
  if(!W||!S.editor||typeof document==='undefined')return;
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=k=>W.labels[W.keys.indexOf(k)]||k;
  const workspace=S.config.mode==='demo'?'aisana.workspace.v1':'aisana.workspace.http.v1';
  const prefix='aisana.workbench.v2:';
  let session=null,epoch=0,timer,storageWarning='',notice='';
  const memory=new Map();
  function currentContext(){
    let saved={};try{saved=JSON.parse(localStorage.getItem(workspace)||'{}');}catch{}
    return {key:saved.id?'task:'+saved.id:'unsaved',id:saved.id||null,revision:saved.revision||null};
  }
  function read(key){
    if(memory.has(key))return clone(memory.get(key));
    let raw;try{raw=localStorage.getItem(prefix+key);}catch{storageWarning='Хранилище устройства недоступно. Скачайте разбор до закрытия вкладки.';return {};}if(!raw)return {};
    if(raw.length>2000000)throw Error('Сохранённый разбор слишком большой. Экспортируйте или удалите его вручную.');
    const value=JSON.parse(raw);
    if(!value||value.version!==2)throw Error('Формат сохранённого разбора не поддерживается. Данные не удалены.');
    return value;
  }
  function write(key,value){
    memory.set(key,clone(value));
    try{localStorage.setItem(prefix+key,JSON.stringify(value));storageWarning='';return true;}
    catch{storageWarning='Хранилище устройства недоступно. Разбор живёт только в этой вкладке: скачайте JSON до закрытия.';return false;}
  }
  function persist(){
    clearTimeout(timer);if(!session||session.foreign)return false;
    let stored;try{stored=read(session.context);}catch(error){session.error=error.message;return false;}
    // localStorage events also guard against another tab overwriting this session.
    if(stored.session?.stamp&&session.stamp&&stored.session.stamp!==session.stamp){session.foreign=true;session.error='Разбор изменён в другой вкладке. Скачайте текущие ответы; старая версия не будет записана поверх новой.';return false;}
    session.stamp=Date.now()+'-'+Math.random().toString(36).slice(2);
    const copy=clone(session);copy.busy=false;copy.error='';delete copy.foreign;
    return write(session.context,{...stored,version:2,session:copy});
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(persist,180);}
  function download(value,name,type='application/json'){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  const button=(action,text,primary=false,disabled=false)=>`<button type="button" class="btn ${primary?'primary':'secondary'}" data-w="${action}" ${disabled?'disabled':''}>${e(text)}</button>`;
  const dialog=document.createElement('dialog');dialog.id='workbench-dialog';dialog.className='interview-dialog';dialog.setAttribute('aria-labelledby','workbench-title');document.body.append(dialog);
  function close(){
    if(!session){dialog.close();return;}
    if(session.busy&&!confirm('Запрос ИИ может продолжить выполняться на сервере и расходовать API-кредиты. Сохранить ответы и закрыть окно?'))return;
    const ok=persist();
    if(!ok&&!confirm('Не удалось сохранить разбор на устройстве. Ответы доступны только в этой вкладке. Закрыть окно?'))return;
    epoch++;session.busy=false;dialog.close();notice=ok?'Разбор сохранён на этом устройстве. Можно продолжить позже.':storageWarning;mount();
  }
  dialog.addEventListener('cancel',ev=>{ev.preventDefault();close();});
  document.addEventListener('keydown',ev=>{if(dialog.open&&(ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();ev.stopImmediatePropagation();persist();}},true);
  window.addEventListener('pagehide',persist);
  window.addEventListener('beforeunload',ev=>{if(session&&!persist()){ev.preventDefault();ev.returnValue='';}});
  window.addEventListener('storage',ev=>{
    if(ev.key?.startsWith(prefix)){const key=ev.key.slice(prefix.length);memory.delete(key);if(dialog.open&&session?.context===key){session.foreign=true;session.error='Разбор изменён в другой вкладке. Скачайте свои ответы и переоткройте актуальную версию.';render();}}
  });
  async function run(message,fn){
    if(!session||session.busy||session.foreign)return;
    const my=++epoch;session.busy=true;session.error='';session.busyText=message;persist();render();
    try{const result=await fn();if(my===epoch&&session)result?.();}
    catch(error){if(my===epoch&&session)session.error=error.message||'Запрос не выполнен. Ответы не потеряны.';}
    finally{if(my===epoch&&session){session.busy=false;persist();render();}}
  }
  async function open(kind='interview',fresh=false){
    const base=W.task(S.editor.getDraft()),ctx=currentContext();
    let saved={};try{saved=read(ctx.key);}catch(error){alert(error.message);return;}
    let replacementApproved=false;
    if(saved.session&&!fresh&&kind!=='interview'){
      if(!confirm('Есть незавершённый разбор. Для другого инструмента он будет заменён. Сначала скачайте ответы, если они нужны. Продолжить?'))return;
      fresh=true;replacementApproved=true;
    }
    if(saved.session&&!fresh){
      session=clone(saved.session);session.busy=false;session.foreign=false;session.error='';
      if(!W.canResume(session,base,ctx.key)){
        session.error='Карточка изменилась после сохранения разбора. Старые ответы можно скачать; перенос в новую версию заблокирован. Начните новый разбор после экспорта.';session.stale=true;
      }
      render();dialog.showModal();return;
    }
    if(fresh&&saved.session&&!replacementApproved&&!confirm('Удалить сохранённый разбор этой задачи? Сначала скачайте ответы, если они нужны.'))return;
    session={version:2,context:ctx.key,base,working:clone(base),proposal:clone(base),fingerprint:W.fingerprint(base),round:1,
      phase:kind==='acceptance'?'acceptance':'questions',questions:[],answers:{},modes:{},history:[],selected:{},evidence:{},conflicts:[],resolved:{},warnings:[],mode:'',ready:false,busy:false,
      rows:[{action:'',expected:'',check:'',owner:''}],scope:{must:'',nice:'',out:''},error:'',stamp:saved.session?.stamp};
    persist();render();if(!dialog.open)dialog.showModal();
    if(kind==='synthesize')await synthesize();else if(kind==='interview')await loadQuestions();
  }
  async function loadQuestions(){
    await run('Уточняем оставшиеся пробелы…',async()=>{
      const result=await S.service.reviewTask({task:session.working,history:session.history});
      return ()=>{session.questions=result.reviewQuestions;session.quality=result.quality;session.mode=result.mode;session.warnings=result.warnings||[];session.ready=true;};
    });
  }
  function propose(task,evidence={}){
    session.proposal=W.task(task);session.evidence=evidence;session.selected=Object.fromEntries(W.differences(session.base,session.proposal).map(c=>[c.key,true]));session.phase='review';
  }
  async function prepare(){
    const merged=W.mergeAnswers(session.working,session.questions,session.answers,session.modes);
    const history=[...session.history,...merged.history];
    await run('Проверяем карточку с учётом ваших ответов…',async()=>{
      const result=await S.service.reviewTask({task:merged.task,history});
      return ()=>{
        session.history=history;session.working=W.task(result.task);session.quality=result.quality;session.mode=result.mode;session.warnings=result.warnings||[];
        const evidence={};for(const q of session.questions)if(W.useful(session.answers[q.id])&&session.modes[q.id]!=='unknown')
          (evidence[q.field]??=[]).push({sourceId:'answer',quote:session.answers[q.id],question:q.text});
        propose(session.working,evidence);
      };
    });
  }
  async function synthesize(){
    if(session.phase==='review')session.working=W.select(session.base,session.proposal,session.selected);
    await run('Собираем связное описание с источниками…',async()=>{
      const current=W.task(session.working);
      const data=await S.service.request('POST','/api/workbench/synthesize',{rawDescription:current.description,card:Object.fromEntries(Object.entries(W.fieldMap).map(([u,a])=>[a,current[u]]))});
      if(!data||!Array.isArray(data.suggestions)||!Array.isArray(data.conflicts)||!Array.isArray(data.warnings))throw Error('Некорректный ответ сервиса.');
      const proposal=clone(current),evidence={};
      for(const item of data.suggestions){const key=W.inverse[item.field];if(!key||typeof item.value!=='string')throw Error('Некорректное предложение.');proposal[key]=item.value;evidence[key]=item.evidence;}
      return ()=>{session.mode=data.mode;session.warnings=data.warnings;session.conflicts=data.conflicts;session.resolved={};propose(proposal,evidence);};
    });
  }
  function acceptancePreview(){
    const result=W.acceptance(session.rows,session.scope),proposal=clone(session.base),evidence={};
    for(const key of ['success_criteria','constraints'])if(result[key]){
      proposal[key]=[proposal[key]?.trim(),result[key]].filter(Boolean).join('\n\n');evidence[key]=[{sourceId:'manual',quote:result[key]}];
    }
    session.mode='manual';propose(proposal,evidence);persist();render();
  }
  function markPending(context,before,after){
    const old=read(context);
    const history=[...(old.history||[]),{at:new Date().toISOString(),before,after}].slice(-3);
    write(context,{version:2,history,pending:true,session:null});
  }
  function changeForm(chosen){
    const changes=W.differences(S.editor.getDraft(),chosen);
    const targets=changes.map(c=>({c,node:document.querySelector('[data-task="'+c.key+'"]')}));
    if(targets.some(x=>!x.node))throw Error('Откройте этап «Карточка» перед переносом.');
    for(const {c,node} of targets){node.value=c.after;node.dispatchEvent(new Event('input',{bubbles:true}));}
  }
  function apply(){
    if(session.stale||session.foreign||W.fingerprint(S.editor.getDraft())!==session.fingerprint)throw Error('Карточка изменилась. Скачайте разбор и начните работу с актуальной версией.');
    if(session.conflicts.some((_,i)=>!session.resolved[i]))throw Error('Сначала уточните отмеченные противоречия или вернитесь к карточке.');
    const chosen=W.select(session.base,session.proposal,session.selected);
    if(!W.differences(session.base,chosen).length)throw Error('Нет выбранных изменений.');
    markPending(session.context,session.base,chosen);changeForm(chosen);epoch++;session=null;dialog.close();
    notice='Изменения перенесены в форму. Сохранение на сервере, подтверждение и публикация — отдельные действия.';mount();document.getElementById('confirm-checkbox')?.focus();
  }
  function undo(){
    const ctx=currentContext(),data=read(ctx.key),last=data.history?.at(-1);if(!last)return;
    if(W.fingerprint(S.editor.getDraft())!==W.fingerprint(last.after))throw Error('После улучшения появились другие правки. Автоматическая отмена заблокирована, чтобы не потерять их.');
    if(!confirm('Вернуть текст до последнего улучшения? Сохранённая публикация автоматически не изменится.'))return;
    changeForm(last.before);write(ctx.key,{...data,pending:true,history:data.history.slice(0,-1),session:null});notice='Предыдущий текст восстановлен. Подтвердите его перед публикацией.';mount();
  }
  function migrate(context,record){
    if(context!=='unsaved'||!record.id)return;
    const data=read(context),key='task:'+record.id;
    if(data.session)data.session.context=key;
    write(key,{...data,version:2});memory.delete(context);
    try{localStorage.removeItem(prefix+context);}catch{}
  }
  const originalSave=S.service.saveDraft?.bind(S.service);
  if(originalSave)S.service.saveDraft=async payload=>{const ctx=currentContext();const record=await originalSave(payload);try{migrate(ctx.key,record);}catch{storageWarning='Карточка сохранена на сервере, но локальный разбор не перенесён. Скачайте его отдельно.';}return record;};
  const originalConfirm=S.service.confirmAndEvaluate?.bind(S.service),originalPublish=S.service.publish?.bind(S.service);
  if(originalConfirm)S.service.confirmAndEvaluate=async payload=>{
    const ctx=currentContext();const record=await originalConfirm(payload);try{migrate(ctx.key,record);}catch{storageWarning='Локальный разбор не удалось перенести.';}
    for(const key of new Set([ctx.key==='unsaved'?'task:'+record.id:ctx.key,'task:'+record.id])){let data={};try{data=read(key);}catch{};write(key,{...data,version:2,pending:false});}
    return record;
  };
  if(originalPublish)S.service.publish=async payload=>{
    const data=read(currentContext().key);if(data.pending)throw Error('После переноса или отмены улучшений сначала подтвердите сведения.');return originalPublish(payload);
  };
  function questionsBody(){
    if(!session.ready)return '<p>Подготовим вопросы по текущей карточке.</p>';
    return session.questions.map((q,n)=>`<section class="interview-question"><span class="pill outline">${e(label(q.field))}</span><label for="wb-answer-${n}">${e(q.text)}</label><p>${e(q.reason||'')}</p>
      ${q.knownContext?`<details><summary>Что уже известно</summary><p class="wb-quote">${e(q.knownContext)}</p></details>`:''}
      <ul class="interview-guidance">${(q.guidance||[]).map(t=>`<li>${e(t)}</li>`).join('')}</ul>
      ${q.example?`<details><summary>Схема ответа, не готовые факты</summary><p>${e(q.example)}</p></details>`:''}
      <label class="wb-mode">Тип ответа<select data-mode="${e(q.id)}" aria-label="Тип ответа ${n+1}">${[['add','Дополнение'],['replace','Исправление: заменить текст этого поля'],['unknown','Пока неизвестно / пропустить']].map(([v,l])=>`<option value="${v}" ${(session.modes[q.id]||'add')===v?'selected':''}>${e(l)}</option>`).join('')}</select></label>
      <textarea id="wb-answer-${n}" data-answer-w="${e(q.id)}" maxlength="2000" rows="4">${e(session.answers[q.id]||'')}</textarea><p class="wb-answer-feedback" id="wb-feedback-${n}" role="status">${e(W.answerFeedback(session.answers[q.id],q.field))}</p><small>При исправлении напишите полную актуальную формулировку поля. Неизвестное не переносится как факт.</small></section>`).join('');
  }
  function reviewBody(){
    const changes=W.differences(session.base,session.proposal);
    return '<p>Проверьте смысл и полноту предложений. Наличие цитаты не доказывает правильность переформулировки. Галочки не подтверждают рейтинг.</p>'+
      session.conflicts.map((c,i)=>`<section class="interview-question"><h3>Нужно согласовать: ${e(label(W.inverse[c.field]))}</h3><p>${e(c.question)}</p><blockquote class="wb-quote">${e(c.left.quote)}</blockquote><blockquote class="wb-quote">${e(c.right.quote)}</blockquote><label for="wb-resolution-${i}">Полная согласованная формулировка</label><textarea id="wb-resolution-${i}" data-resolve="${i}" maxlength="6000">${e(session.resolved[i]||'')}</textarea><small>Непустой ответ заменяет это поле только в предлагаемой версии.</small></section>`).join('')+
      (changes.length?changes.map(c=>`<section class="interview-change"><label class="checkbox-line"><input type="checkbox" data-select-w="${c.key}" ${session.selected[c.key]?'checked':''}>${e(c.label)}</label>
      <div class="interview-diff"><div><span class="interview-caption">СЕЙЧАС</span><p>${e(c.before||'Не указано')}</p></div><div><label for="wb-edit-${c.key}" class="interview-caption">ПРЕДЛОЖЕНИЕ · МОЖНО ИСПРАВИТЬ</label><textarea id="wb-edit-${c.key}" data-edit-w="${c.key}" maxlength="6000">${e(c.after)}</textarea></div></div>
      <details><summary>На основании чего?</summary>${(session.evidence[c.key]||[]).map(ev=>`<p><strong>${e(ev.question||ev.sourceId)}</strong></p><blockquote class="wb-quote">${e(ev.quote)}</blockquote>`).join('')||'<p>Сверьте формулировку с исходным описанием и своими ответами. Автоматическое доказательство её правильности отсутствует.</p>'}</details></section>`).join(''):'<p class="interview-no-changes">Безопасных новых формулировок нет. Можно дополнить сведения или пройти следующий раунд.</p>');
  }
  function acceptanceBody(){
    return '<p>Опишите наблюдаемое поведение. Не придумывайте проценты и секунды ради баллов. Неизвестные проверяющий и способ проверки будут явно отмечены.</p>'+
      session.rows.map((r,n)=>`<section class="interview-question"><h3>Проверка ${n+1}</h3>${[['action','Что делает проверяющий?'],['expected','Что должно произойти?'],['check','Как проверяется?'],['owner','Кто принимает результат?']].map(([k,l])=>`<label for="wb-row-${n}-${k}">${l}</label><input id="wb-row-${n}-${k}" data-row="${n}" data-part="${k}" value="${e(r[k])}" maxlength="700">`).join('')}</section>`).join('')+button('add-row','Добавить проверку',false,session.rows.length>=8)+
      `<section class="interview-question"><h3>Границы первой версии</h3>${[['must','Обязательно'],['nice','Желательно'],['out','Не входит']].map(([k,l])=>`<label for="wb-scope-${k}">${l}</label><textarea id="wb-scope-${k}" data-scope="${k}" maxlength="1200">${e(session.scope[k])}</textarea>`).join('')}</section>`;
  }
  function render(){
    if(!session)return;
    const busy=session.busy||session.foreign||session.stale;
    const body=session.phase==='review'?reviewBody():session.phase==='acceptance'?acceptanceBody():questionsBody();
    const mode={openai:'Внешний ИИ: проверьте предложения',mock:'Локальные правила',fallback:'Резервный режим',manual:'Ручной конструктор'}[session.mode]||'Подготовка';
    dialog.innerHTML=`<header class="interview-header"><div><div class="eyebrow">РАБОЧИЙ РАЗБОР · V2</div><h2 id="workbench-title">${session.phase==='acceptance'?'Критерии приёмки и границы MVP':'От ответов к понятной задаче'}</h2><p>Раунд ${session.round} из 3 · ${e(mode)}</p></div>${button('close','Сохранить и закрыть')}</header>
      <div class="interview-body"><p class="wb-storage" role="status">${e(storageWarning||'Автосохранение на этом устройстве. Не на сервере. Используйте обезличенные сведения.')}</p>
      ${session.error?`<div class="error-banner" role="alert">${e(session.error)}</div>`:''}
      ${session.stale||session.foreign?button('fresh','Начать новый разбор'):''}
      ${session.warnings.map(w=>`<p class="interview-mode-note">${e(w)}</p>`).join('')}
      ${session.quality?`<section class="interview-diagnosis"><h3>На что обратить внимание</h3><p>${e(session.quality.summary)}</p></section>`:''}
      <fieldset ${busy?'disabled':''} class="wb-fields">${body}</fieldset></div>
      ${session.busy?`<div class="interview-busy" role="status">${e(session.busyText)} · ответы сохранены в этом окне</div>`:''}
      <footer class="interview-footer">${button('fresh','Новый разбор',false,busy)}${button('export','Скачать разбор JSON')}${session.phase==='review'?
        button('synthesize','Собрать понятное описание',false,busy)+button('next','Следующий раунд',false,busy||session.round>=3)+button('apply','Перенести выбранное',true,busy):
        session.phase==='acceptance'?button('acceptance-preview','Посмотреть результат',true,busy):button(session.ready?'prepare':'retry',session.ready?'Посмотреть улучшения':'Повторить анализ',true,busy)}</footer>`;
  }
  dialog.addEventListener('input',ev=>{
    if(!session||session.busy||session.foreign)return;const t=ev.target;
    if(t.dataset.answerW){session.answers[t.dataset.answerW]=t.value;const n=session.questions.findIndex(q=>q.id===t.dataset.answerW);const f=dialog.querySelector('#wb-feedback-'+n);if(f)f.textContent=W.answerFeedback(t.value,session.questions[n]?.field);}
    if(t.dataset.editW)session.proposal[t.dataset.editW]=t.value;
    if(t.dataset.row!==undefined)session.rows[Number(t.dataset.row)][t.dataset.part]=t.value;
    if(t.dataset.scope)session.scope[t.dataset.scope]=t.value;
    if(t.dataset.resolve!==undefined){const n=Number(t.dataset.resolve),key=W.inverse[session.conflicts[n].field];session.resolved[n]=W.useful(t.value)?t.value.trim():'';session.proposal[key]=t.value;session.selected[key]=true;}
    schedule();
  });
  dialog.addEventListener('change',ev=>{if(!session||session.busy)return;const t=ev.target;if(t.dataset.mode)session.modes[t.dataset.mode]=t.value;if(t.dataset.selectW)session.selected[t.dataset.selectW]=t.checked;schedule();});
  dialog.addEventListener('click',async ev=>{
    const a=ev.target.closest('[data-w]')?.dataset.w;if(!a||!session)return;
    try{
      if(a==='close'){close();return;}if(a==='export'){download(session,'ai-sana-interview.json');return;}if(a==='fresh'){await open('interview',true);return;}
      if(session.busy||session.stale||session.foreign)return;
      if(a==='prepare')await prepare();if(a==='retry')await loadQuestions();if(a==='synthesize')await synthesize();if(a==='apply')apply();
      if(a==='add-row'&&session.rows.length<8){session.rows.push({action:'',expected:'',check:'',owner:''});persist();render();}
      if(a==='acceptance-preview')acceptancePreview();
      if(a==='next'&&session.round<3){session.working=W.select(session.base,session.proposal,session.selected);session.answers={};session.modes={};session.round++;session.phase='questions';session.ready=false;session.conflicts=[];await loadQuestions();}
    }catch(error){if(session){session.error=error.message;persist();render();}}
  });
  async function outsideAction(a){
    try{
      if(a==='undo'){undo();return;}
      if(a==='markdown'||a==='copy'){
        const md=W.markdown(S.editor.getDraft(),currentContext());
        if(a==='copy'){try{await navigator.clipboard.writeText(md);notice='ТЗ скопировано.';}catch{download(md,'task.md','text/markdown');notice='Буфер обмена недоступен — скачан Markdown.';}}
        else download(md,'task.md','text/markdown');mount();return;
      }
      await open(a==='acceptance'?'acceptance':a==='synthesis'?'synthesize':'interview');
    }catch(error){notice=error.message;mount();}
  }
  document.addEventListener('click',ev=>{const a=ev.target.closest('[data-w-open]')?.dataset.wOpen;if(a){ev.preventDefault();outsideAction(a);}});
  function mount(){
    const app=document.getElementById('app');if(!app)return;
    for(const hint of app.querySelectorAll('.question-title .hint')){
      if(hint.parentElement?.classList.contains('interview-hint'))continue;
      const details=document.createElement('details'),summary=document.createElement('summary');details.className='interview-hint';summary.textContent='Зачем этот вопрос и как ответить';hint.replaceWith(details);details.append(summary,hint);
    }
    if(!app.querySelector('#card-title')||!app.querySelector('#confirm-checkbox'))return;
    let data={};try{data=read(currentContext().key);}catch(error){notice=error.message;}
    let panel=app.querySelector('#workbench-launch');
    if(!panel){panel=document.createElement('section');panel.id='workbench-launch';panel.className='card card-body wb-launch';app.querySelector('.main-column')?.prepend(panel);}
    const content=`<div class="eyebrow">ИНСТРУМЕНТЫ ЗАДАЧИ</div><h3>Сделаем описание пригодным для работы</h3><p>Следующий шаг: ${data.pending?'проверить и подтвердить перенесённые изменения.':data.session?'продолжить сохранённый разбор.':'уточнить критерии приёмки и оставшиеся пробелы.'}</p><div class="row wrap">${[['interview',data.session?'Продолжить разбор':'Улучшить карточку'],['acceptance','Критерии приёмки'],['synthesis','Собрать понятное описание'],['undo','Отменить улучшение'],['markdown','Скачать ТЗ'],['copy','Скопировать ТЗ']].map(([a,t])=>`<button type="button" class="btn secondary small" data-w-open="${a}" ${a==='undo'&&!data.history?.length?'disabled':''}>${e(t)}</button>`).join('')}</div><p role="status">${e(notice||storageWarning||'Сборка формулировок использует настроенную модель и API-кредиты. Без ИИ удаляются только повторы. Ничего не публикуется автоматически.')}</p>`;
    if(panel._workbenchContent!==content){panel._workbenchContent=content;panel.innerHTML=content;}
    if(data.pending){const p=app.querySelector('#publish-button');if(p)p.disabled=true;const score=app.querySelector('.score-value b');if(score&&score.textContent!=='—')score.textContent='—';}
  }
  let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;mount();});}});
  const app=document.getElementById('app');if(app)observer.observe(app,{childList:true,subtree:true});mount();
  S.workbenchUI={open,context:currentContext};
})(window.Sana);
