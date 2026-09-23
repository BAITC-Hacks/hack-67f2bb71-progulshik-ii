/* Настройки ИИ существуют отдельно от редактора: значение ключа живёт только
 * в поле формы и в запросе подключения. Оно не входит в состояние приложения. */
(function(S){
  'use strict';

  S.createAiSettings=function({service,e,i,onChanged}){
    const dialog=document.createElement('dialog');
    dialog.id='ai-settings-dialog';
    dialog.className='ai-settings-dialog';
    dialog.setAttribute('aria-labelledby','ai-settings-title');
    document.body.append(dialog);
    let settings=null,busy=false,returnFocus=null;

    function safeSettings(value){
      if(!value||!['openai','mock'].includes(value.mode)||typeof value.model!=='string'||
        value.model.length>100||typeof value.keyConfigured!=='boolean'||
        !['environment','session','none'].includes(value.source)||
        typeof value.verified!=='boolean'||typeof value.checking!=='boolean'){
        throw Object.assign(new Error('Invalid settings'),{code:'INVALID_RESPONSE'});
      }
      return {mode:value.mode,model:value.model,keyConfigured:value.keyConfigured,
        source:value.source,verified:value.verified,checking:value.checking};
    }

    function errorText(error){
      // Не показываем произвольный текст ошибки: он может содержать данные запроса.
      const messages={
        LOCAL_SETTINGS_ONLY:'Настройки ИИ доступны только на компьютере, где запущено приложение.',
        AI_SETTINGS_BUSY:'Подключение уже проверяется в другой вкладке. Повторите действие чуть позже.',
        AI_KEY_REQUIRED:'Введите API-ключ OpenAI для подключения.',
        INVALID_AI_SETTINGS:'Проверьте формат ключа и название модели.',
        AI_CONNECTION_FAILED:'Проверка не удалась. Проверьте ключ, доступ к модели, баланс API и интернет. Прежние настройки сохранены.',
        AI_SETTINGS_UNAVAILABLE:'Настройки ИИ недоступны на этом сервере.',
        TIMEOUT:'Сервер не ответил вовремя. Откройте настройки ещё раз, чтобы узнать состояние подключения.',
        NETWORK_ERROR:'Не удалось связаться с сервером приложения. Проверьте, что он запущен.',
        INVALID_RESPONSE:'Не удалось прочитать настройки сервера. Откройте окно ещё раз.'
      };
      return messages[error?.code]||'Не удалось изменить настройки. Откройте окно ещё раз, чтобы обновить состояние подключения.';
    }

    function field(name){return dialog.querySelector('[data-ai-field="'+name+'"]');}
    function clearKey(){const input=field('key');if(input)input.value='';}
    function message(text,kind='info'){
      const node=dialog.querySelector('[data-ai-message]');
      if(!node)return;
      node.textContent=text;node.hidden=!text;
      node.className='ai-settings-message '+kind;
      node.setAttribute('role',kind==='error'?'alert':'status');
    }
    function statusMarkup(){
      if(!settings)return '<span class="pill gray"><span class="dot"></span>Настройки недоступны</span>';
      const verified=settings.mode==='openai'&&settings.keyConfigured&&settings.verified;
      const label=settings.checking?'Проверяется подключение':settings.mode==='mock'?'Деморежим':!settings.keyConfigured?'Ключ не задан':verified?'ИИ подключён · проверено':'Ключ настроен';
      const text=settings.mode==='mock'?'Уточняющие вопросы формируются по локальным правилам. Карточки, рейтинг и отклики работают как обычно.':
        !settings.keyConfigured?'Вставьте API-ключ, чтобы подключить OpenAI. Пока ключ не задан, вопросы формируются по локальным правилам.':
        verified?'Последняя проверка подключения прошла успешно. При недоступности OpenAI приложение использует локальные вопросы.':'ИИ настроен, но текущее подключение ещё не подтверждено. Нажмите «Подключить и проверить», чтобы проверить ключ и выбранную модель.';
      return '<span class="pill '+(verified?'':'orange')+'"><span class="dot"></span>'+e(label)+'</span><p>'+e(text)+'</p>';
    }
    function updateControls(){
      const unavailable=!settings||settings.checking;
      dialog.setAttribute('aria-busy',String(busy));
      dialog.querySelectorAll('button,input').forEach(node=>{
        const action=node.dataset.aiAction;
        node.disabled=busy||(unavailable&&action!=='close'&&action!=='retry');
      });
      const connect=dialog.querySelector('[data-ai-action="connect"]');
      if(connect)connect.innerHTML=busy?'<span class="spinner" aria-hidden="true"></span>Подождите…':i('spark','sm')+'Подключить и проверить';
    }
    function updateStatus(){
      const status=dialog.querySelector('[data-ai-status]');
      if(status)status.innerHTML=statusMarkup();
      const input=field('key');
      if(input)input.placeholder=settings?.keyConfigured?'Оставьте пустым, чтобы использовать настроенный ключ':'Вставьте API-ключ';
      const hint=dialog.querySelector('[data-ai-key-hint]');
      if(hint)hint.textContent=settings?.keyConfigured?'Ключ уже настроен. Можно проверить его или вставить новый.':'Ключ отправится локальному серверу и сервису OpenAI только после нажатия кнопки подключения.';
      if(field('model'))field('model').value=settings?.model||'';
      updateControls();
    }
    function build(){
      dialog.innerHTML=`<div class="modal-head"><div class="dialog-title-wrap"><h2 id="ai-settings-title">Настройки ИИ</h2><p class="ai-settings-subtitle">Подключите свой ключ без изменения файлов.</p></div><button class="icon-button" type="button" data-ai-action="close" aria-label="Закрыть настройки ИИ">${i('close')}</button></div>
        <form autocomplete="off" novalidate>
          <div class="modal-content ai-settings-content">
            <div class="ai-settings-status" data-ai-status>${statusMarkup()}</div>
            <div class="ai-settings-message" data-ai-message role="status" aria-live="polite" hidden></div>
            <div class="field"><label for="ai-settings-key">API-ключ OpenAI</label><input id="ai-settings-key" data-ai-field="key" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" maxlength="1024" aria-describedby="ai-settings-key-hint"><span class="hint" id="ai-settings-key-hint" data-ai-key-hint></span></div>
            <div class="field"><label for="ai-settings-model">Модель</label><input id="ai-settings-model" data-ai-field="model" type="text" maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="ai-settings-model-hint"><span class="hint" id="ai-settings-model-hint">Используйте модель, доступную вашему API-ключу.</span></div>
            <div class="ai-settings-note">${i('info','sm')}<p>Кнопка подключения отправит один короткий проверочный запрос в OpenAI. Он расходует средства API. Ваши задачи в проверку не включаются.</p></div>
            <p class="ai-settings-retention">Введённый ключ действует до перезапуска сервера и используется всеми вкладками этого приложения. После перезапуска действуют настройки запуска. Ключ не сохраняется в файлах проекта или браузере.</p>
          </div>
          <div class="modal-actions ai-settings-actions"><button class="btn secondary ai-settings-demo" type="button" data-ai-action="demo">Деморежим</button><button class="btn secondary" type="button" data-ai-action="retry" hidden>Обновить</button><button class="btn ghost" type="button" data-ai-action="close">Закрыть</button><button class="btn primary" type="submit" data-ai-action="connect">${i('spark','sm')}Подключить и проверить</button></div>
        </form>`;
      updateStatus();
    }

    async function load(){
      busy=true;settings=null;
      if(dialog.open){clearKey();updateControls();message('Загружаем настройки…');}
      let failure=null;
      try{settings=safeSettings(await service.getAiSettings());}
      catch(error){failure=errorText(error);}
      finally{busy=false;}
      build();
      if(!dialog.open)dialog.showModal();
      if(failure){message(failure,'error');dialog.querySelector('[data-ai-action="retry"]').hidden=false;}
      else if(settings.checking){message('В другой вкладке идёт проверка подключения. Откройте настройки чуть позже.');}
      (settings&&!settings.checking?field('key'):dialog.querySelector('[data-ai-action="close"]'))?.focus();
    }

    async function recoverUncertain(error){
      if(!['TIMEOUT','NETWORK_ERROR','INVALID_RESPONSE'].includes(error?.code))return;
      // После разрыва связи результат операции мог сохраниться на сервере.
      // Читаем только публичное состояние, без повторного платного запроса.
      try{
        const previous=JSON.stringify(settings);
        settings=safeSettings(await service.getAiSettings());updateStatus();
        if(JSON.stringify(settings)!==previous&&typeof onChanged==='function')onChanged(settings);
      }catch(_){/* Следующее открытие снова запросит актуальное состояние. */}
    }

    async function connect(){
      if(busy||!settings||settings.checking)return;
      const model=field('model').value.trim();
      let apiKey=field('key').value.trim(),payload;
      clearKey();
      if(!model){apiKey='';message('Укажите название модели.','error');field('model').focus();return;}
      if(!apiKey&&!settings.keyConfigured){message('Вставьте API-ключ OpenAI.','error');field('key').focus();return;}
      busy=true;updateControls();message('Проверяем ключ и модель коротким запросом в OpenAI…');
      try{
        payload={model,...(apiKey?{apiKey}:{})};
        settings=safeSettings(await service.connectAiSettings(payload));
        updateStatus();
        message(settings.verified?'ИИ подключён. Проверочный запрос выполнен успешно. Новое подключение применяется к следующим запросам; уже созданные карточки не меняются.':'Настройки обновлены.','success');
        if(typeof onChanged==='function')onChanged(settings);
      }catch(error){
        await recoverUncertain(error);
        message(errorText(error)+' Введённый ключ очищен. Если вы вводили новый ключ, вставьте его заново перед повтором.','error');
      }finally{
        apiKey='';
        if(payload)delete payload.apiKey;
        payload=undefined;clearKey();busy=false;updateControls();
      }
    }

    async function disable(){
      if(busy||!settings||settings.checking)return;
      clearKey();busy=true;updateControls();message('Включаем деморежим…');
      try{
        settings=safeSettings(await service.disableAiSettings());updateStatus();
        message('Деморежим включён. Следующие вопросы будут формироваться локально; существующие карточки не меняются. После перезапуска сервера действуют настройки запуска.','success');
        if(typeof onChanged==='function')onChanged(settings);
      }catch(error){await recoverUncertain(error);message(errorText(error),'error');}
      finally{clearKey();busy=false;updateControls();}
    }

    dialog.addEventListener('submit',event=>{event.preventDefault();void connect();});
    dialog.addEventListener('click',event=>{
      const action=event.target.closest('[data-ai-action]')?.dataset.aiAction;
      if(busy||!action)return;
      if(action==='close'){clearKey();dialog.close();}
      else if(action==='demo')void disable();
      else if(action==='retry')void load();
    });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else clearKey();});
    dialog.addEventListener('close',()=>{
      clearKey();dialog.querySelector('form')?.reset();dialog.replaceChildren();
      (returnFocus?.isConnected?returnFocus:document.querySelector('[data-action="ai-settings"]'))?.focus();
      returnFocus=null;
    });
    window.addEventListener('pagehide',clearKey);

    return {
      async open(){
        if(busy||dialog.open){if(dialog.open)dialog.focus();return;}
        returnFocus=document.activeElement;
        await load();
      },
      isBusy(){return busy;}
    };
  };
})(window.Sana);
