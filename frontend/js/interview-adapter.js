/* Extend only interview operations. Current server-side quality checks,
 * rating, persistence, AI settings and collaboration remain in HttpService. */
(function(S){
  'use strict';
  const M=S.model, Base=S.HttpService;
  const map={title:'title',context:'context',need:'need',users:'users',data_materials:'data',constraints:'constraints',expected_result:'expectedResult',success_criteria:'successCriteria',contact:'contact',interaction_format:'interactionFormat'};
  const inverse=Object.fromEntries(Object.entries(map).map(([ui,api])=>[api,ui]));
  const toCard=task=>Object.fromEntries(Object.entries(map).map(([ui,api])=>[api,task[ui]||'']));
  const fromCard=(card,description='',topic='')=>M.normalizeTask({description,topic,...Object.fromEntries(Object.entries(map).map(([ui,api])=>[ui,card?.[api]||'']))});
  const error=(message,code)=>Object.assign(new Error(message),{code});
  function questionId(field,text,source){let h=2166136261;for(const ch of source+'|'+field+'|'+text){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return 'q_'+field+'_'+(h>>>0).toString(36);}
  const guidance=q=>Array.isArray(q.guidance)?q.guidance.filter(x=>typeof x==='string').slice(0,4):[];
  function hint(q){return [q.reason||'',guidance(q).length?'Что указать:\n'+guidance(q).map(x=>'• '+x).join('\n'):'',typeof q.example==='string'&&q.example?'Шаблон, не готовые данные: '+q.example:''].filter(Boolean).join('\n\n').slice(0,2000);}
  class InterviewService extends Base {
    constructor(...args){super(...args);this.initialAnalysis=null;}
    async analyze(payload){
      const data=await this.request('POST','/api/ai/analyze',payload);
      if(!data||!['mock','openai','fallback'].includes(data.mode)||!data.suggestedCard||!Array.isArray(data.questions)||!Array.isArray(data.warnings)||data.warnings.some(x=>typeof x!=='string'))throw error('Сервис вернул некорректный результат интервью. Ответы остались в форме.','INVALID_RESPONSE');
      const questions=M.validateQuestions(data.questions.map(q=>({id:questionId(q.field,q.question,payload.rawDescription),field:inverse[q.field],text:q.question,hint:hint(q)})));
      const suggestedCard=toCard(fromCard(data.suggestedCard));
      const reviewQuestions=questions.map((q,n)=>({...q,guidance:guidance(data.questions[n]),example:typeof data.questions[n].example==='string'?data.questions[n].example:'',knownContext:typeof data.questions[n].knownContext==='string'?data.questions[n].knownContext:'',reason:typeof data.questions[n].reason==='string'?data.questions[n].reason:''}));
      const quality=data.quality&&typeof data.quality.summary==='string'?{summary:data.quality.summary,note:typeof data.quality.note==='string'?data.quality.note:'',issues:Array.isArray(data.quality.issues)?data.quality.issues.filter(x=>x&&inverse[x.field]&&typeof x.note==='string').map(x=>({...x,field:inverse[x.field]})):[]}:null;
      this.lastAi={mode:data.mode,warnings:M.clone(data.warnings)};
      this.lastAnalysis={rawDescription:payload.rawDescription,suggestedCard};
      return {questions,suggestedCard,reviewQuestions,quality};
    }
    async generateQuestions({description,task}){
      // The existing editor supplies only description. Include its current fields
      // when the source matches; unrelated programmatic calls remain independent.
      const draft=task||(S.editor?.getDraft?.());
      const card=draft&&draft.description===description?toCard(M.normalizeTask(draft)):undefined;
      const result=await this.analyze({rawDescription:description,...(card?{card}:{})});
      this.initialAnalysis={rawDescription:description,suggestedCard:M.clone(result.suggestedCard)};
      return result.questions;
    }
    async buildCard({task,questions,answers={}}){
      const current=M.normalizeTask(task),card=toCard(current),grouped={};
      if(this.initialAnalysis?.rawDescription===current.description)for(const field of Object.values(map))if(!card[field].trim())card[field]=this.initialAnalysis.suggestedCard[field];
      for(const q of M.validateQuestions(questions)){
        const answer=answers[q.id],field=map[q.field];
        if(field&&typeof answer==='string'&&answer.trim())(grouped[field]??=[]).push(answer.trim());
      }
      const explicit=Object.fromEntries(Object.entries(grouped).map(([field,values])=>[field,[...new Set(values)].join('\n\n')]));
      for(const [field,value] of Object.entries(explicit))if(value.length>6000)throw error('Ответы для поля «'+field+'» превышают 6000 символов. Сократите их; текст не обрезан.','ANSWER_TOO_LONG');
      const result=await this.analyze({rawDescription:current.description,card,answers:explicit});
      return fromCard(result.suggestedCard,current.description,current.topic);
    }
    async reviewTask({task,history=[]}){
      const current=M.normalizeTask(task);
      if(history.length>30)throw error('Завершите текущий разбор перед новым циклом.','INTERVIEW_LIMIT');
      const interviewHistory=history.map(h=>({field:map[h.field],question:h.question,status:h.status}));
      if(interviewHistory.some(h=>!h.field||typeof h.question!=='string'||!['answered','skipped'].includes(h.status)))throw error('Некорректная история интервью.','INVALID_INTERVIEW');
      const result=await this.analyze({rawDescription:current.description,card:toCard(current),intent:'improve',questionCount:6,interviewHistory});
      return {...result,task:fromCard(result.suggestedCard,current.description,current.topic),mode:this.lastAi.mode,warnings:M.clone(this.lastAi.warnings)};
    }
  }
  S.HttpService=InterviewService;
})(window.Sana);
