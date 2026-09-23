/* HTTP-адаптер реального API. Рейтинг, подтверждение и публикация принадлежат
 * серверу. Вопросы и ответы сохраняются вместе с задачей в interview.
 */
(function(S){
  'use strict';
  const M=S.model;
  const fieldMap={title:'title',context:'context',need:'need',users:'users',data_materials:'data',
    constraints:'constraints',expected_result:'expectedResult',success_criteria:'successCriteria',
    contact:'contact',interaction_format:'interactionFormat'};
  const uiField=Object.fromEntries(Object.entries(fieldMap).map(([key,value])=>[value,key]));
  const toCard=task=>Object.fromEntries(Object.entries(fieldMap).map(([key,value])=>[value,task[key]||'']));
  const fromCard=(card,description='',topic='')=>M.normalizeTask({description,topic,
    ...Object.fromEntries(Object.entries(fieldMap).map(([key,value])=>[key,card?.[value]||'']))});
  const apiError=(message,code,details,status)=>Object.assign(new Error(message),{code,details,status});

  class HttpService {
    constructor(){this.kind='http';this.lastAi=null;this.metadata=new Map();this.lastAnalysis=null;}

    async request(method,path,payload,extraHeaders={}){
      if(typeof location!=='undefined'&&location.protocol==='file:')throw apiError('Откройте интерфейс через адрес работающего сервера.','FILE_PROTOCOL');
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),S.config.timeoutMs||35000);
      try{
        const response=await fetch((S.config.apiBaseUrl||'').replace(/\/$/,'')+path,{
          method,credentials:S.config.credentials||'same-origin',signal:controller.signal,
          headers:{Accept:'application/json',...(payload===undefined?{}:{'Content-Type':'application/json'}),...extraHeaders},
          ...(payload===undefined?{}:{body:JSON.stringify(payload)})
        });
        const text=await response.text();let data;
        try{data=text?JSON.parse(text):null;}
        catch(_){throw apiError('Сервер вернул некорректный ответ. Ваш ввод остался в редакторе.','INVALID_RESPONSE',undefined,response.status);}
        if(!response.ok){
          const error=data?.error;
          throw apiError(typeof error?.message==='string'?error.message:'Не удалось выполнить запрос. Ваш ввод остался в редакторе.',
            typeof error?.code==='string'?error.code:'HTTP_ERROR',error?.details,response.status);
        }
        return data;
      }catch(error){
        if(error.name==='AbortError')throw apiError('Сервер не ответил вовремя. Ваш ввод остался в редакторе. Проверьте сохранённую задачу перед повторной отправкой.','TIMEOUT');
        if(error.name==='TypeError')throw apiError('Не удалось подключиться к серверу. Проверьте подключение и повторите попытку. Ваш ввод остался в редакторе.','NETWORK_ERROR');
        throw error;
      }finally{clearTimeout(timeout);}
    }

    rating(value){
      if(!value||!Array.isArray(value.breakdown)||!Array.isArray(value.missingFields)||!Array.isArray(value.unconfirmedFields))throw apiError('Сервер вернул некорректную оценку.','INVALID_RESPONSE');
      return M.validateRating({total_score:value.score,level:{key:value.level,label:value.label},
        breakdown:value.breakdown.map(item=>({id:item.id,label:item.label,earned:item.points,max:item.maxPoints,reason:item.explanation})),
        missing_fields:value.missingFields.map(field=>{
          const key=uiField[field],definition=M.fields.find(item=>item.key===key);
          return {key,label:definition?.label||field,suggestion:definition?.hint||'Добавьте сведения в карточку.'};
        }),
        unconfirmed_fields:value.unconfirmedFields.map(field=>uiField[field]),
        recommendations:Array.isArray(value.recommendations)?M.clone(value.recommendations):[],source:'server'});
    }

    record(value){
      if(!value||!value.card||!Array.isArray(value.confirmedFields)||!value.rating||!Array.isArray(value.rating.unconfirmedFields))throw apiError('Сервер вернул некорректную сохранённую задачу.','INVALID_RESPONSE');
      const task=fromCard(value.card,value.rawDescription,value.topic);
      const confirmed=value.confirmedFields.length>0;
      const rating=confirmed?this.rating(value.rating):null;
      const metadata=value.interview?{
        questions:value.interview.questions.map(question=>({...question,field:uiField[question.field]})),
        answers:value.interview.answers,source:value.interview.source
      }:this.metadata.get(value.id)||{questions:[],answers:{}};
      return M.validateRecord({id:value.id,revision:value.revision,task,rating,
        questions:M.clone(metadata.questions),answers:M.clone(metadata.answers),questions_source:metadata.source??value.rawDescription,
        confirmed_fingerprint:confirmed&&value.rating.unconfirmedFields.length===0?M.fingerprint(task):null,
        published:value.status==='published'?{task:M.clone(task),rating:this.rating(value.rating),published_at:value.publishedAt}:null,
        created_at:value.createdAt,updated_at:value.updatedAt});
    }

    async analyze(payload){
      const analysis=await this.request('POST','/api/ai/analyze',payload);
      if(!analysis||!['mock','openai','fallback'].includes(analysis.mode)||!analysis.suggestedCard||!Array.isArray(analysis.warnings)||analysis.warnings.some(item=>typeof item!=='string'))throw apiError('Сервер вернул некорректный результат анализа.','INVALID_RESPONSE');
      const questions=M.validateQuestions((analysis.questions||[]).map((question,index)=>({
        id:'q_'+question.field+'_'+index,field:uiField[question.field],text:question.question,hint:question.reason||''
      })));
      // Проверка формата не меняет текст и не применяет предложения к редактору.
      const suggestedCard=toCard(fromCard(analysis.suggestedCard));
      this.lastAi={mode:analysis.mode,warnings:M.clone(analysis.warnings)};
      this.lastAnalysis={rawDescription:payload.rawDescription,suggestedCard};
      return {questions,suggestedCard};
    }

    async generateQuestions({description}){
      return (await this.analyze({rawDescription:description})).questions;
    }

    async buildCard({task,questions,answers={}}){
      const current=M.normalizeTask(task),card=toCard(current);
      if(this.lastAnalysis?.rawDescription===current.description){
        for(const field of Object.values(fieldMap))if(!card[field].trim())card[field]=this.lastAnalysis.suggestedCard[field];
      }
      const explicitAnswers={};
      for(const question of M.validateQuestions(questions)){
        const answer=answers[question.id],field=fieldMap[question.field];
        // Пропущенный вопрос не очищает сведения из исходного описания.
        if(field&&typeof answer==='string'&&answer.trim())explicitAnswers[field]=answer;
      }
      const analysis=await this.analyze({rawDescription:current.description,card,answers:explicitAnswers});
      return fromCard(analysis.suggestedCard,current.description,current.topic);
    }

    async save(payload){
      const task=M.normalizeTask(payload.task),body={rawDescription:task.description,card:toCard(task)};
      if(payload.questions!==undefined||payload.answers!==undefined){
        const questions=payload.questions||[];
        body.interview={source:payload.questionsSource??task.description,
          questions:questions.map(question=>({...question,field:fieldMap[question.field]})),
          answers:Object.fromEntries(questions.filter(question=>typeof payload.answers?.[question.id]==='string').map(question=>[question.id,payload.answers[question.id]]))};
      }
      // Пустая тема при создании получает стандартное значение самого API.
      if(task.topic.trim())body.topic=task.topic;
      if(payload.id)body.revision=payload.revision;
      const value=await this.request(payload.id?'PATCH':'POST',payload.id?'/api/tasks/'+encodeURIComponent(payload.id):'/api/tasks',body);
      const previous=this.metadata.get(value.id)||{questions:[],answers:{}};
      this.metadata.set(value.id,{
        questions:M.clone(payload.questions===undefined?previous.questions:payload.questions),
        answers:M.clone(payload.answers===undefined?previous.answers:payload.answers)
      });
      return {value,record:this.record(value)};
    }

    async saveDraft(payload){return (await this.save(payload)).record;}

    async confirmAndEvaluate(payload){
      const saved=await this.save(payload);
      try{
        const fields=saved.value.rating.unconfirmedFields;
        if(!fields.length){
          if(!saved.value.confirmedFields.length)throw apiError('Заполните хотя бы одно поле карточки перед подтверждением.','NOTHING_TO_CONFIRM');
          return saved.record;
        }
        return this.record(await this.request('POST','/api/tasks/'+encodeURIComponent(saved.record.id)+'/confirm',{
          revision:saved.record.revision,fields
        }));
      }catch(error){error.savedRecord=saved.record;throw error;}
    }

    async publish({id,revision}){return this.record(await this.request('POST','/api/tasks/'+encodeURIComponent(id)+'/publish',{revision}));}
    async getTask({id}){return this.record(await this.request('GET','/api/tasks/'+encodeURIComponent(id)));}
    async list(path){
      const data=await this.request('GET',path);
      if(!Array.isArray(data?.items))throw apiError('Сервер вернул некорректный список задач.','INVALID_RESPONSE');
      return data.items.map(item=>this.record(item));
    }
    async listTasks(){return this.list('/api/tasks?status=all');}
    async listPublished(){return this.list('/api/tasks?status=published');}
    async collection(path){
      const data=await this.request('GET',path);
      if(!Array.isArray(data?.items))throw apiError('Сервер вернул некорректный список.','INVALID_RESPONSE');
      return data.items;
    }
    async listTeams(){return this.collection('/api/teams');}
    async createTeam(payload){return this.request('POST','/api/teams',payload);}
    async listProposals(filters={}){
      const query=new URLSearchParams(Object.entries(filters).filter(([key,value])=>['taskId','teamId'].includes(key)&&value));
      return this.collection('/api/proposals'+(query.size?'?'+query:''));
    }
    async createProposal({taskId,...payload}){
      return this.request('POST','/api/tasks/'+encodeURIComponent(taskId)+'/proposals',payload);
    }
    async decideProposal({id,status}){return this.request('PATCH','/api/proposals/'+encodeURIComponent(id),{status});}
    async getAiSettings(){return this.request('GET','/api/ai/settings');}
    async connectAiSettings(input){return this.request('POST','/api/ai/settings',input,{'X-AI-Settings':'local'});}
    async disableAiSettings(){return this.request('POST','/api/ai/settings/demo',{}, {'X-AI-Settings':'local'});}
  }
  S.HttpService=HttpService;
})(window.Sana);
