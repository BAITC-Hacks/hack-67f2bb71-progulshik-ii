/* Read-only comparison: same task, 2–3 proposals, no automated winner. */
(function(S){
  'use strict';
  const W=S.workbench;if(!W||!S.service?.listProposals)return;
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dialog=document.createElement('dialog');dialog.id='proposal-comparison';dialog.className='interview-dialog';dialog.setAttribute('aria-labelledby','compare-title');document.body.append(dialog);
  let tasks=[],teams=[],proposals=[],taskId='',ids=[],error='',busy=false,comparison=false,request=0;
  const name=id=>teams.find(t=>t.id===id)?.name||'Команда недоступна';
  function safeLink(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
  async function open(){
    const own=++request;busy=true;error='';ids=[];comparison=false;render();dialog.showModal();
    try{const result=await Promise.all([S.service.listTasks(),S.service.listTeams(),S.service.listProposals()]);if(own!==request)return;[tasks,teams,proposals]=result;taskId=tasks.some(t=>t.id===taskId)?taskId:tasks[0]?.id||'';}
    catch(ex){if(own===request)error=ex.message||'Не удалось загрузить отклики.';}
    finally{if(own===request){busy=false;render();}}
  }
  function render(){
    const relevant=proposals.filter(p=>p.taskId===taskId),chosen=proposals.filter(p=>ids.includes(p.id));
    dialog.innerHTML=`<header class="interview-header"><div><div class="eyebrow">РЕШЕНИЕ ОСТАЁТСЯ ЗА БИЗНЕСОМ</div><h2 id="compare-title">Сравнить предложения</h2><p>Точные тексты откликов. Без рейтинга команд и автоматического выбора.</p></div><button class="btn secondary" data-c="close">Закрыть</button></header><div class="interview-body">
      ${busy?'<p role="status">Загружаем актуальные предложения…</p>':''}${error?`<div class="error-banner" role="alert">${e(error)}</div>`:''}
      <label for="compare-task">Задача</label><select id="compare-task" ${busy?'disabled':''}>${tasks.map(t=>`<option value="${e(t.id)}" ${t.id===taskId?'selected':''}>${e(t.task.title||'Без названия')}</option>`).join('')}</select>
      ${!busy&&!relevant.length?'<p>На эту задачу пока нет откликов.</p>':''}
      ${!comparison?relevant.map(p=>`<label class="wb-proposal-pick"><input type="checkbox" data-compare-id="${e(p.id)}" ${ids.includes(p.id)?'checked':''}> <span><strong>${e(name(p.teamId))}</strong> · ${e(p.timeline)}<br>${e(p.idea)}</span></label>`).join(''):
        `<div class="wb-compare-scroll"><table class="wb-compare-table"><thead><tr><th scope="col">Параметр</th>${chosen.map(p=>`<th scope="col">${e(name(p.teamId))}</th>`).join('')}</tr></thead><tbody>${[['idea','Идея'],['plan','План'],['timeline','Срок'],['prototypeUrl','Прототип'],['status','Решение бизнеса']].map(([k,l])=>`<tr><th scope="row">${l}</th>${chosen.map(p=>`<td>${k==='prototypeUrl'?(safeLink(p[k])?`<a href="${e(safeLink(p[k]))}" target="_blank" rel="noopener noreferrer">Открыть прототип</a>`:'Не указана корректная ссылка'):e(k==='status'?({accepted:'Выбрана бизнесом',rejected:'Отклонена',pending:'Ожидает решения'}[p[k]]||'Неизвестно'):p[k]||'Не указано — уточните у команды')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>Это снимок на момент открытия. Принимать и отклонять предложения нужно отдельно в разделе «Отклики команд».</p>`}
      </div><footer class="interview-footer"><button class="btn secondary" data-c="refresh" ${busy?'disabled':''}>Обновить</button><button class="btn primary" data-c="compare" ${busy||ids.length<2||ids.length>3?'disabled':''}>${comparison?'Изменить выбор':'Сравнить выбранные ('+ids.length+')'}</button></footer>`;
  }
  dialog.addEventListener('change',ev=>{
    if(ev.target.id==='compare-task'){taskId=ev.target.value;ids=[];comparison=false;error='';render();return;}
    const id=ev.target.dataset.compareId;if(!id)return;
    if(ev.target.checked&&ids.length>=3){ev.target.checked=false;error='Можно сравнить не более трёх откликов.';render();return;}
    ids=ev.target.checked?[...ids,id]:ids.filter(x=>x!==id);error='';render();
  });
  dialog.addEventListener('click',ev=>{
    const a=ev.target.closest('[data-c]')?.dataset.c;
    if(a==='close'){request++;dialog.close();return;}
    if(a==='refresh'){dialog.close();open();return;}
    if(a==='compare'){try{W.comparison(proposals,ids);comparison=!comparison;error='';}catch(ex){error=ex.message;}render();}
  });
  dialog.addEventListener('cancel',()=>{request++;});
  function mount(){
    if(location.hash!=='#business-proposals'||document.querySelector('#role-select')?.value!=='business')return;
    const root=document.querySelector('.collab-root');if(!root||root.querySelector('[data-compare-open]'))return;
    const button=document.createElement('button');button.className='btn secondary wb-compare-open';button.textContent='Сравнить отклики';button.dataset.compareOpen='';button.addEventListener('click',open);root.prepend(button);
  }
  const app=document.getElementById('app');if(app)new MutationObserver(mount).observe(app,{childList:true,subtree:true});mount();
})(window.Sana);
