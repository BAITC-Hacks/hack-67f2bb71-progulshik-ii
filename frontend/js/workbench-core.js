/* Pure workbench operations; no network, DOM, secrets or implicit publication. */
(function(root){
  'use strict';
  const keys=['title','context','need','users','data_materials','constraints','expected_result','success_criteria','contact','interaction_format'];
  const labels=['Название','Контекст','Потребность','Пользователи','Данные и материалы','Ограничения','Ожидаемый результат','Критерии успеха','Контакт','Формат взаимодействия'];
  const fieldMap={title:'title',context:'context',need:'need',users:'users',data_materials:'data',constraints:'constraints',expected_result:'expectedResult',success_criteria:'successCriteria',contact:'contact',interaction_format:'interactionFormat'};
  const inverse=Object.fromEntries(Object.entries(fieldMap).map(([a,b])=>[b,a]));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const useful=v=>typeof v==='string'&&/[\p{L}\p{N}]/u.test(v)&&!['не знаю','пока не знаю','неизвестно','не указано','tbd','todo','да','нет','ok','ок'].includes(v.trim().toLowerCase().replace(/[\s.!?…]+$/u,''));
  function answerFeedback(value,field){
    if(!value?.trim())return '';
    if(!useful(value))return 'Неизвестное можно пропустить. Для переноса нужен содержательный ответ, а не «да» или «не знаю».';
    if(['удобно','быстро','для всех','сайт','бот','хорошо'].includes(value.trim().toLowerCase().replace(/[.!?]+$/,'')))
      return field==='success_criteria'?'Какое действие выполнит проверяющий и какой результат должен увидеть?':'Приведите конкретный сценарий: кто что делает и что должно измениться.';
    return '';
  }
  function task(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректная карточка.');
    const out={};
    for(const key of ['description','topic',...keys]){
      if(value[key]!=null&&typeof value[key]!=='string')throw Error('Поле должно быть текстом: '+key);
      out[key]=value[key]||'';
      if(out[key].length>(key==='description'?12000:key==='topic'?100:6000))throw Error('Слишком длинное поле: '+(labels[keys.indexOf(key)]||key)+'. Текст не обрезан.');
    }
    return out;
  }
  const fingerprint=value=>JSON.stringify(task(value));
  const differences=(a,b)=>keys.filter(k=>a[k]!==b[k]).map(key=>({key,label:labels[keys.indexOf(key)],before:a[key]||'',after:b[key]||''}));
  function select(base,proposal,selected){const result=task(base);for(const k of keys)if(selected[k])result[k]=proposal[k]||'';return task(result);}
  function mergeAnswers(base,questions,answers,modes={}){
    const out=task(base),groups={},history=[];
    for(const q of questions){
      if(!keys.includes(q.field)||typeof q.id!=='string')throw Error('Некорректный вопрос.');
      const answer=typeof answers[q.id]==='string'?answers[q.id].trim():'';
      const mode=modes[q.id]||'add';
      if(!['add','replace','unknown'].includes(mode))throw Error('Некорректный режим ответа.');
      const accepted=mode!=='unknown'&&useful(answer);
      history.push({field:q.field,question:q.text,status:accepted?'answered':'skipped'});
      if(accepted)(groups[q.field]??=[]).push({answer,mode});
    }
    for(const [key,entries] of Object.entries(groups)){
      const replace=entries.filter(x=>x.mode==='replace').map(x=>x.answer);
      const old=replace.length?replace:useful(out[key])?out[key].trim().split(/\n{2,}/):[];
      out[key]=[...new Set([...old,...entries.filter(x=>x.mode==='add').map(x=>x.answer)])].join('\n\n');
    }
    return {task:task(out),history};
  }
  function acceptance(rows,scope={}){
    const criteria=[];
    for(const row of rows){
      const values=['action','expected','check','owner'].map(k=>(row[k]||'').trim());
      if(!values.some(Boolean))continue;
      if(!values[0]||!values[1])throw Error('Для каждого критерия укажите действие и ожидаемый результат.');
      criteria.push('Действие: '+values[0]+'.\nОжидается: '+values[1]+'.\nПроверка: '+(values[2]||'нужно согласовать')+'.\nПринимает: '+(values[3]||'нужно согласовать')+'.');
    }
    const limits=[['must','Обязательно в первой версии'],['nice','Желательно'],['out','Не входит в первую версию']].filter(([k])=>scope[k]?.trim()).map(([k,l])=>l+':\n'+scope[k].trim());
    return {success_criteria:criteria.join('\n\n'),constraints:limits.join('\n\n')};
  }
  function canResume(session,current,context){
    return !!session&&session.version===2&&session.context===context&&session.fingerprint===fingerprint(current);
  }
  function markdown(value,context={}){
    const t=task(value),line=v=>String(v).replace(/[<>]/g,c=>c==='<'?'&lt;':'&gt;');
    return ['# '+line(t.title||'Бизнес-задача'),'','Статус: рабочий экспорт. Экспорт не подтверждает сведения и не публикует задачу.',
      'Задача: '+line(context.id||'новый черновик')+' · версия: '+line(context.revision??'не сохранена'),'',
      '## Исходное описание',line(t.description||'Не указано'),'',
      ...keys.filter(k=>k!=='title').flatMap(k=>['## '+labels[keys.indexOf(k)],line(t[k]||'Не указано — требуется уточнение'),''])].join('\n');
  }
  function comparison(items,ids){
    if(!Array.isArray(ids)||ids.length<2||ids.length>3||new Set(ids).size!==ids.length)throw Error('Выберите 2–3 разных отклика.');
    const chosen=ids.map(id=>items.find(p=>p.id===id));
    if(chosen.some(x=>!x)||new Set(chosen.map(x=>x.taskId)).size!==1)throw Error('Сравнивайте отклики на одну задачу.');
    return chosen.map(p=>({...p,missing:['idea','plan','timeline','prototypeUrl'].filter(k=>!p[k]?.trim())}));
  }
  root.Sana=root.Sana||{};
  root.Sana.workbench={keys,labels,fieldMap,inverse,clone,useful,answerFeedback,task,fingerprint,differences,select,mergeAnswers,acceptance,canResume,markdown,comparison};
})(typeof window==='undefined'?globalThis:window);
