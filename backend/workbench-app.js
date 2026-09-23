/* Optional endpoints compose in front of the unchanged core app.
 * No task persistence, score changes, publication or team decisions here. */
import express from 'express';
import cors from 'cors';
import { createApp } from './app.js';
import { validateInput, SynthesisInputError } from './synthesis.js';
export function createWorkbenchApp(options){
  const app=express(),router=express.Router();app.disable('x-powered-by');
  router.use(cors({origin:options.allowedOrigins||['http://localhost:5173','http://127.0.0.1:5173'],methods:['POST','OPTIONS']}));
  router.use(express.json({limit:'256kb'}));
  router.post('/synthesize',async(req,res)=>{
    const input=validateInput(req.body);res.set('Cache-Control','no-store');
    if(typeof options.ai.synthesize!=='function')return res.status(503).json({error:{code:'SYNTHESIS_UNAVAILABLE',message:'Перезапустите обновлённый сервер.'}});
    res.json(await options.ai.synthesize(input));
  });
  router.use((error,_req,res,_next)=>{
    const input=error instanceof SynthesisInputError||error.type==='entity.parse.failed';
    const large=error.type==='entity.too.large';
    res.status(large?413:input?400:500).json({error:{code:large?'BODY_TOO_LARGE':input?'VALIDATION_ERROR':'SYNTHESIS_ERROR',message:large?'Слишком большой запрос.':input?'Проверьте описание и поля карточки.':'Не удалось подготовить формулировки. Ввод остался в редакторе.'}});
  });
  app.use('/api/workbench',router);app.use(createApp(options));return app;
}
