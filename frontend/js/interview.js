/* Optional interview workbench. Uses the public getDraft interface and normal
 * input events. Applying suggestions NEVER confirms, scores or publishes them. */
(function(S){
  'use strict';
  const M=S.model;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=key=>M.fields.find(f=>f.key===key)?.label||key;
  function differences(before,after){return M.fields.filter(f=>f.key!=='topic'&&before[f.key]!==after[f.key]).map(f=>({key:f.key,label:f.label,before:before[f.key],after:after[f.key]}));}
  function mergeAnswers(task,questions,answers){
    const result=M.normalizeTask(task),groups={},history=[];
    for(const q of questions){
      if(!M.fields.some(f=>f.key===q.field&&f.key!=='topic'))throw new Error('Вопрос связан с неизвестным полем.');
      const value=typeof answers[q.id]==='string'?answers[q.id].trim():'';
      const useful=M.meaningful(value)&&!['да','нет','ок','ok','yes','no'].includes(value.toLowerCase().replace(/[.!?]+$/,''));
      history.push({field:q.field,question:q.text,status:useful?'answered':'skipped'});
      if(useful)(groups[q.field]??=[]).push(value);
    }
    for(const [key,values] of Object.entries(groups)){
      const old=M.meaningful(result[key])?result[key].trim():'';
      // Compare complete paragraphs, not substrings: an answer such as "10"
      // must not disappear merely because an existing sentence contains "100".
      const paragraphs=new Set(old.split(/\n{2,}/));
      const additions=[...new Set(values)].filter(value=>!paragraphs.has(value));
      result[key]=[old,...additions].filter(Boolean).join('\n\n');
    }
    return {task:M.normalizeTask(result),history};
  }
  function selectedTask(base,proposal,selected){
    const task=M.normalizeTask(base);
    for(const change of differences(base,proposal))if(selected[change.key])task[change.key]=proposal[change.key];
    return M.normalizeTask(task);
  }
  S.interview={mergeAnswers,differences,selectedTask};
  if(typeof document==='undefined')return;
  let session=null,requestId=0;
  const dialog=document.createElement('dialog');dialog.id='interview-dialog';dialog.className='interview-dialog';
  dialog.setAttribute('aria-labelledby','interview-title');document.body.append(dialog);
  const button=(action,text,primary=false,disabled=false)=>`<button type="button" class="btn ${primary?'primary':'secondary'}" data-interview="${action}" ${disabled?'disabled':''}>${e(text)}</button>`;
  function hasWork(){return session&&(Object.values(session.answers).some(x=>x.trim())||differences(session.base,session.proposal).length>0);}
  function close(){
    if((hasWork()||session?.busy)&&!window.confirm('Закрыть разбор без переноса изменений? Исходная карточка останется прежней.'))return;
    requestId++;session=null;dialog.close();
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.addEventListener('beforeunload',event=>{if(dialog.open&&hasWork()){event.preventDefault();event.returnValue='';}});
  async function run(text,fn){
    if(!session||session.busy)return;
    const id=++requestId;session.busy=true;session.busyText=text;session.error='';render();
    try{const result=await fn();if(id!==requestId||!session)return;result?.();}
    catch(error){if(id===requestId&&session)session.error=error?.message||'Не удалось выполнить анализ. Ответы сохранены в этом окне.';}
    finally{if(id===requestId&&session){session.busy=false;render();dialog.querySelector('[role="alert"]')?.focus();}}
  }
  async function open(){
    if(!S.editor?.getDraft||typeof S.service?.reviewTask!=='function')return;
    const base=M.normalizeTask(S.editor.getDraft());
    session={base,working:M.clone(base),proposal:M.clone(base),fingerprint:M.fingerprint(base),phase:'questions',round:1,
      questions:[],answers:{},history:[],selected:{},quality:null,mode:'',warnings:[],error:'',busy:false,ready:false};
    render();dialog.showModal();await loadQuestions();
  }
  function takeAnalysis(analysis){
    session.questions=analysis.reviewQuestions;session.quality=analysis.quality;session.mode=analysis.mode;session.warnings=analysis.warnings;
    session.ready=true;
  }
  async function loadQuestions(){
    await run('Анализируем текущую карточку и готовим вопросы…',async()=>{
      const result=await S.service.reviewTask({task:session.working,history:session.history});return ()=>takeAnalysis(result);
    });
  }
  async function prepare(){
    let merged;
    try{merged=mergeAnswers(session.working,session.questions,session.answers);}
    catch(error){session.error=error.message;render();return;}
    const history=[...session.history,...merged.history];
    await run('Учитываем ответы и проверяем, что ещё стоит уточнить…',async()=>{
      const result=await S.service.reviewTask({task:merged.task,history});
      return ()=>{
        session.proposal=M.normalizeTask(result.task);session.history=history;
        session.quality=result.quality;session.mode=result.mode;session.warnings=result.warnings;
        session.selected=Object.fromEntries(differences(session.base,session.proposal).map(x=>[x.key,true]));session.phase='review';
      };
    });
  }
  async function nextRound(){
    if(session.round>=3)return;
    const working=selectedTask(session.base,session.proposal,session.selected);
    await run('Готовим следующий раунд с учётом выбранных изменений…',async()=>{
      const result=await S.service.reviewTask({task:working,history:session.history});
      return ()=>{session.working=working;session.proposal=M.clone(working);session.round++;session.answers={};session.phase='questions';takeAnalysis(result);};
    });
  }
  function apply(){
    const current=M.normalizeTask(S.editor.getDraft());
    if(M.fingerprint(current)!==session.fingerprint)throw new Error('Карточка изменилась во время разбора. Закройте окно и начните разбор актуальной версии; старую версию мы не перезаписываем.');
    const chosen=selectedTask(session.base,session.proposal,session.selected),changes=differences(current,chosen);
    if(!changes.length)throw new Error('Выберите хотя бы одно изменение или закройте разбор.');
    const targets=changes.map(change=>({change,node:document.querySelector('[data-task="'+change.key+'"]')}));
    if(targets.some(x=>!x.node))throw new Error('Откройте этап «Карточка» перед переносом изменений.');
    for(const {change,node} of targets){node.value=change.after;node.dispatchEvent(new Event('input',{bubbles:true}));}
    const notice=document.createElement('p');notice.className='interview-applied';notice.setAttribute('role','status');
    notice.textContent='Уточнения перенесены в форму. Проверьте карточку и отдельно подтвердите сведения. Ничего не опубликовано.';
    document.querySelector('.interview-launch')?.append(notice);
    session=null;requestId++;dialog.close();document.getElementById('confirm-checkbox')?.focus();
  }
  function render(){
    if(!session)return;
    const mode=session.mode==='openai'?'Внешний ИИ':session.mode==='fallback'?'Резервный режим':session.mode==='mock'?'Локальные правила':'Подготовка';
    const body=session.phase==='review'?reviewBody():questionsBody();
    dialog.innerHTML=`<header class="interview-header"><div><span class="eyebrow">ОТ ЗАПОЛНЕННОСТИ К ЯСНОСТИ</span><h2 id="interview-title">Доработаем задачу по существу</h2><p>Раунд ${session.round} из 3 · ${e(mode)}</p></div>${button('close','Закрыть')}</header>
      <div class="interview-body" ${session.busy?'inert':''}>
      <p class="interview-boundary">Это рабочий разбор, а не автоматическое повышение рейтинга. Отвечайте только известными фактами. Неизвестное можно пропустить.</p>
      ${session.error?`<div class="error-banner" role="alert" tabindex="-1">${e(session.error)}</div>`:''}
      ${session.mode&&session.mode!=='openai'?'<div class="interview-mode-note">Сейчас работают локальные правила, не внешняя модель. Ключ и модель настраиваются в «Настройки ИИ».</div>':''}
      ${session.quality?`<section class="interview-diagnosis"><h3>На что обратить внимание</h3><p>${e(session.quality.summary)}</p><small>${e(session.quality.note)}</small></section>`:''}
      ${body}</div>
      ${session.busy?`<div class="interview-busy" role="status" aria-live="polite"><span class="spinner"></span>${e(session.busyText)}<small>Ответы сохранены в этом окне. Не закрывайте вкладку.</small></div>`:''}
      <footer class="interview-footer">${session.phase==='review'?
        button('next','Ещё один раунд',false,session.busy||session.round>=3)+button('apply','Перенести выбранное в карточку',true,session.busy):
        button('close','Вернуться без изменений',false,session.busy)+button(session.ready?'prepare':'retry',session.ready?'Посмотреть улучшения':'Повторить анализ',true,session.busy)}
      </footer>`;
  }
  function questionsBody(){
    if(!session.ready)return '<p class="muted">Подготовим вопросы по вашей текущей карточке — не универсальную анкету.</p>';
    return `<div class="interview-answer-tip"><strong>Полезный ответ:</strong> реальный пример → детали или ограничения → как проверить результат. Не нужно заполнять шаблон вымышленными числами.</div>`+
      session.questions.map((q,n)=>`<section class="interview-question"><div class="row between wrap"><span class="pill outline">${e(label(q.field))}</span><span class="tiny muted">${n+1} / ${session.questions.length}</span></div>
      <label for="interview-answer-${n}">${e(q.text)}</label><p class="interview-why">${e(q.reason)}</p>
      ${q.knownContext?`<details class="interview-context"><summary>Что уже указано в этом поле</summary><blockquote>${e(q.knownContext)}</blockquote></details>`:''}
      <ul class="interview-guidance">${q.guidance.map(x=>`<li>${e(x)}</li>`).join('')}</ul>
      ${q.example?`<details class="interview-example"><summary>Схема ответа — не готовые данные</summary><p>${e(q.example)}</p></details>`:''}
      <textarea id="interview-answer-${n}" data-interview-answer="${e(q.id)}" maxlength="2000" rows="4" placeholder="Напишите своими словами. Не знаете — оставьте пустым." aria-describedby="interview-answer-help-${n}">${e(session.answers[q.id]||'')}</textarea>
      <small id="interview-answer-help-${n}">До 2000 символов. В каждом поле карточки сохраняется до 6000 символов. Существующие сведения не удаляются.</small></section>`).join('');
  }
  function reviewBody(){
    const changes=differences(session.base,session.proposal);
    return `<div class="interview-review-heading"><h3>Проверьте, что изменится</h3><p>Можно исправить формулировку справа или исключить изменение. Галочки здесь не подтверждают рейтинг и не публикуют задачу.</p></div>`+
      (changes.length?changes.map(change=>`<section class="interview-change"><label class="checkbox-line"><input type="checkbox" data-interview-select="${change.key}" ${session.selected[change.key]?'checked':''}><strong>${e(change.label)}</strong></label>
      <div class="interview-diff"><div><span class="interview-caption">СЕЙЧАС</span><p>${e(change.before||'Не заполнено')}</p></div><div><label class="interview-caption" for="interview-edit-${change.key}">ПОСЛЕ ПЕРЕНОСА · МОЖНО ИСПРАВИТЬ</label><textarea id="interview-edit-${change.key}" data-interview-edit="${change.key}" rows="5" maxlength="6000">${e(change.after)}</textarea></div></div></section>`).join(''):
      '<p class="interview-no-changes">Новых сведений пока нет. Можно пройти другой раунд, уточнить ответ или вернуться к карточке.</p>')+
      (session.quality?.issues?.length?`<details class="interview-outstanding"><summary>Какие вопросы ещё остаются</summary><ul>${session.quality.issues.map(issue=>`<li><strong>${e(label(issue.field))}:</strong> ${e(issue.note)}</li>`).join('')}</ul></details>`:'');
  }
  dialog.addEventListener('input',event=>{
    if(!session||session.busy)return;
    const target=event.target;
    if(target.dataset.interviewAnswer)session.answers[target.dataset.interviewAnswer]=target.value;
    if(target.dataset.interviewEdit)session.proposal[target.dataset.interviewEdit]=target.value;
  });
  dialog.addEventListener('change',event=>{if(session&&!session.busy&&event.target.dataset.interviewSelect)session.selected[event.target.dataset.interviewSelect]=event.target.checked;});
  dialog.addEventListener('click',async event=>{
    const action=event.target.closest('[data-interview]')?.dataset.interview;
    if(!action||!session)return;
    if(action==='close'){close();return;}if(session.busy)return;
    try{if(action==='prepare')await prepare();else if(action==='next')await nextRound();else if(action==='retry')await loadQuestions();else if(action==='apply')apply();}
    catch(error){if(session){session.error=error.message;render();}}
  });
  function mount(){
    const app=document.getElementById('app');if(!app)return;
    for(const hint of app.querySelectorAll('.question-title .hint')){
      if(hint.parentElement?.classList.contains('interview-hint'))continue;
      const details=document.createElement('details'),summary=document.createElement('summary');details.className='interview-hint';
      summary.textContent='Зачем этот вопрос и как ответить';hint.replaceWith(details);details.append(summary,hint);
    }
    if(!app.querySelector('#card-title')||!app.querySelector('#confirm-checkbox')||app.querySelector('.interview-launch')||typeof S.service?.reviewTask!=='function')return;
    const launch=document.createElement('section');launch.className='card interview-launch';
    launch.innerHTML='<div><span class="eyebrow">ЕЩЁ ОДИН ШАГ К ХОРОШЕМУ ТЗ</span><h3>Заполнено — ещё не значит понятно</h3><p>Уточним границы MVP, доступ к данным и критерии приёмки. Сначала покажем изменения; решение останется за вами.</p></div><button class="btn primary" type="button" id="interview-open">Улучшить карточку</button>';
    launch.querySelector('button').addEventListener('click',()=>open().catch(error=>{if(session){session.error=error.message;render();}}));
    app.querySelector('.main-column .confirmation')?.before(launch);
  }
  const app=document.getElementById('app');
  if(app){new MutationObserver(mount).observe(app,{childList:true});mount();}
  S.interview.mount=mount;
})(window.Sana);
