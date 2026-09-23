/* ЛОКАЛЬНАЯ ЗАГЛУШКА, НЕ ИИ И НЕ ВАШ BACKEND.
 * Все имитации бизнес-операций изолированы здесь, а не в коде экранов.
 * Деморейтинг проверяет присутствие подтверждённого текста, НЕ его качество.
 */
(function (S) {
  'use strict';
  const M=S.model, KEY='aisana.records.v1';
  const rubric=[
    {id:'context',label:'Контекст и потребность',parts:[['context',10],['need',10]]},
    {id:'data',label:'Данные и материалы',parts:[['data_materials',20]]},
    {id:'result',label:'Ожидаемый результат',parts:[['expected_result',15]]},
    {id:'success',label:'Критерии успеха',parts:[['success_criteria',15]]},
    {id:'limits',label:'Ограничения',parts:[['constraints',10]]},
    {id:'users',label:'Пользователи',parts:[['users',10]]},
    {id:'contact',label:'Связь с бизнесом',parts:[['contact',5],['interaction_format',5]]}
  ];
  const prompts=[
    ['need','Что именно нужно изменить в текущем процессе?','Опишите главную проблему и зачем её решать.'],
    ['users','Кто будет пользоваться решением?','Роли пользователей и их основные действия.'],
    ['data_materials','Какие данные и примеры уже доступны?','Достаточно описания. Не загружайте конфиденциальные данные.'],
    ['expected_result','Что команда должна передать в конце?','Например, прототип, отчёт или работающий инструмент.'],
    ['success_criteria','Как вы поймёте, что задача решена?','Укажите проверяемые признаки приёмки.'],
    ['constraints','Какие сроки и ограничения нужно учесть?','Технологии, доступы, сроки и другие рамки.']
  ];
  function evaluate(task) {
    const missing=[];
    const breakdown=rubric.map(item=>{
      let earned=0; const absent=[];
      for(const [key,points] of item.parts){
        if(M.meaningful(task[key])) earned+=points;
        else { const field=M.fields.find(f=>f.key===key); absent.push(field.label); missing.push({key,label:field.label,suggestion:field.hint}); }
      }
      return {id:item.id,label:item.label,earned,max:item.parts.reduce((a,p)=>a+p[1],0),reason:absent.length?'Добавьте: '+absent.join(', '):'Заполнено и подтверждено пользователем.'};
    });
    const total=breakdown.reduce((n,b)=>n+b.earned,0);
    const level=total>=90?{key:'priority',label:'Приоритетная'}:total>=70?{key:'ready',label:'Готовая'}:total>=40?{key:'working',label:'Рабочая'}:{key:'draft',label:'Требует уточнения'};
    return {total_score:total,level,breakdown,missing_fields:missing,confirmed_at:new Date().toISOString(),source:'demo-presence-only'};
  }
  class DemoService {
    constructor(){this.memory=[];this.memoryOnly=false;this.failNext=false;this.kind='demo';}
    async before(){
      await new Promise(resolve=>setTimeout(resolve,S.config.demoDelayMs));
      if(this.failNext){this.failNext=false;throw new Error('Тестовая ошибка сервиса. Данные формы сохранены; повторите действие.');}
    }
    records(){
      const records=this.memoryOnly?this.memory:S.storage.read(KEY,this.memory);
      if(!Array.isArray(records)) throw new Error('Некорректное локальное хранилище. Сбросьте демоданные в справке.');
      return M.clone(records.map(M.validateRecord));
    }
    write(records){this.memory=M.clone(records);this.memoryOnly=!S.storage.write(KEY,records);}
    makeRecord(payload, list){
      const old=payload.id?list.find(r=>r.id===payload.id):null;
      if(payload.id&&!old)throw new Error('Задача не найдена. Возможно, демоданные были сброшены.');
      if(old&&old.revision!==payload.revision)throw new Error('Задача изменена в другой вкладке. Экспортируйте текущий ввод и заново откройте сохранённую задачу.');
      const now=new Date().toISOString();
      const record={id:old?.id||M.uid(),revision:(old?.revision||0)+1,task:M.normalizeTask(payload.task),
        questions:M.clone(payload.questions||[]),answers:M.clone(payload.answers||{}),
        rating:old?.rating||null,confirmed_fingerprint:old?.confirmed_fingerprint||null,
        published:old?.published||null,created_at:old?.created_at||now,updated_at:now};
      return record;
    }
    put(record,list){const index=list.findIndex(r=>r.id===record.id);if(index<0)list.unshift(record);else list[index]=record;this.write(list);return M.clone(record);}
    async generateQuestions({description}){
      await this.before();if(!description?.trim())throw new Error('Сначала опишите задачу.');
      return prompts.map(([field,text,hint])=>({id:'q_'+field,field,text,hint}));
    }
    async buildCard({task,questions,answers}){
      await this.before();const card=M.normalizeTask(task);card.context=card.description;
      for(const q of M.validateQuestions(questions))if(typeof answers[q.id]==='string')card[q.field]=answers[q.id].trim();
      // Только перенос явного ввода. Нет генерации контактов, чисел или обещаний.
      return M.normalizeTask(card);
    }
    async saveDraft(payload){await this.before();const list=this.records();return this.put(this.makeRecord(payload,list),list);}
    async confirmAndEvaluate(payload){
      await this.before();const list=this.records(),r=this.makeRecord(payload,list);
      r.rating=evaluate(r.task);r.confirmed_fingerprint=M.fingerprint(r.task);
      return this.put(r,list);
    }
    async publish({id,revision}){
      await this.before();const list=this.records(),r=list.find(item=>item.id===id);
      if(!r)throw new Error('Сначала сохраните и подтвердите задачу.');
      if(r.revision!==revision)throw new Error('Версия задачи изменилась. Заново откройте сохранённую карточку.');
      if(!r.task.title.trim())throw new Error('Для публикации добавьте название задачи.');
      if(!r.rating||r.confirmed_fingerprint!==M.fingerprint(r.task))throw new Error('Подтвердите актуальные сведения перед публикацией.');
      // Низкий рейтинг НЕ является запретом на публикацию.
      if(r.published&&M.fingerprint(r.published.task)===M.fingerprint(r.task))return M.clone(r);
      r.published={task:M.clone(r.task),rating:M.clone(r.rating),published_at:new Date().toISOString()};
      r.revision+=1;r.updated_at=new Date().toISOString();return this.put(r,list);
    }
    async getTask({id}){await this.before();const r=this.records().find(r=>r.id===id);if(!r)throw new Error('Задача не найдена.');return r;}
    async listTasks(){await this.before();return this.records().sort((a,b)=>b.updated_at.localeCompare(a.updated_at));}
    async listPublished(){await this.before();return this.records().filter(r=>r.published).sort((a,b)=>b.published.rating.total_score-a.published.rating.total_score);}
    async seedExamples(){
      await this.before();const list=this.records();
      S.examples.forEach((ex,index)=>{
        const id='sample-'+ex.id;if(list.some(r=>r.id===id))return;
        const task=S.exampleTask(ex);
        const omit=[[],['constraints','interaction_format'],['data_materials','success_criteria'],['need','data_materials','expected_result','contact','interaction_format'],['need','users','data_materials','expected_result','success_criteria','constraints','interaction_format']][index];
        omit.forEach(k=>task[k]='');
        const r=this.makeRecord({task,questions:[],answers:{}},list);r.id=id;r.rating=evaluate(task);r.confirmed_fingerprint=M.fingerprint(task);
        r.published={task:M.clone(task),rating:M.clone(r.rating),published_at:r.created_at};list.push(r);
      });
      this.write(list);return M.clone(list);
    }
    reset(){S.storage.remove(KEY);S.storage.remove('aisana.workspace.v1');this.memory=[];this.memoryOnly=false;}
  }
  S.DemoService=DemoService;
})(window.Sana);
