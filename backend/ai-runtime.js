import { createAiService } from './ai.js';

export class AiSettingsError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AiSettingsError';
    this.status = status;
    this.code = code;
  }
}

const VERIFICATION_INPUT = Object.freeze({
  rawDescription: 'Вымышленный учебный центр хочет подготовить ответы на частые вопросы о курсах.',
});

function invalidKey() {
  return new AiSettingsError(400, 'INVALID_AI_SETTINGS', 'Введите корректный API-ключ без пробелов и переносов строк.');
}

function validateKey(value) {
  // Credentials remain in this module's closure and are never returned to the caller.
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || /[^\x21-\x7e]/.test(value)) {
    throw invalidKey();
  }
  return value;
}

function validateModel(value) {
  if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z0-9]/.test(value) || /[^A-Za-z0-9._:/-]/.test(value)) {
    throw new AiSettingsError(400, 'INVALID_AI_SETTINGS', 'Укажите название модели длиной до 100 символов без пробелов.');
  }
  return value;
}

export function createAiRuntime({
  mode = 'mock', apiKey = '', model = 'gpt-4o-mini', timeoutMs, fetchImpl,
} = {}) {
  if (!['mock', 'openai'].includes(mode)) {
    throw new AiSettingsError(400, 'INVALID_AI_SETTINGS', 'Режим ИИ должен быть mock или openai.');
  }
  let activeKey = apiKey === '' ? '' : validateKey(apiKey);
  let activeModel = validateModel(model);
  let source = activeKey ? 'environment' : 'none';
  let verified = false;
  let checking = false;
  let service = createAiService({ mode, apiKey: activeKey, model: activeModel, timeoutMs, fetchImpl });

  const getSettings = () => ({
    mode: service.mode,
    model: activeModel,
    keyConfigured: Boolean(activeKey),
    source,
    verified,
    checking,
  });

  const assertIdle = () => {
    if (checking) {
      throw new AiSettingsError(409, 'AI_SETTINGS_BUSY', 'Проверка подключения уже выполняется. Дождитесь её завершения.');
    }
  };

  return {
    get mode() {
      return service.mode;
    },
    getSettings,
    async analyze(input) {
      // An in-flight request keeps the configuration it started with.
      const capturedService = service;
      const result = await capturedService.analyze(input);
      if (service === capturedService) verified = result.mode === 'openai';
      return result;
    },
    async connect(settings = {}) {
      assertIdle();
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new AiSettingsError(400, 'INVALID_AI_SETTINGS', 'Передайте настройки подключения ИИ.');
      }
      const reuseKey = settings.apiKey === undefined || settings.apiKey === '';
      const candidateKey = reuseKey ? activeKey : validateKey(settings.apiKey);
      if (!candidateKey) {
        throw new AiSettingsError(400, 'AI_KEY_REQUIRED', 'Введите API-ключ для подключения ИИ.');
      }
      const candidateModel = validateModel(settings.model === undefined ? activeModel : settings.model);
      const candidateSource = reuseKey ? source : 'session';
      checking = true;
      try {
        const candidate = createAiService({
          mode: 'openai', apiKey: candidateKey, model: candidateModel, timeoutMs, fetchImpl,
        });
        const result = await candidate.analyze(VERIFICATION_INPUT);
        if (result.mode !== 'openai') throw new Error('VERIFICATION_FAILED');

        // Commit only after a normal structured analysis succeeds.
        service = candidate;
        activeKey = candidateKey;
        activeModel = candidateModel;
        source = candidateSource;
        verified = true;
      } catch {
        // Do not expose provider errors, exception text, or any submitted value.
        throw new AiSettingsError(
          422,
          'AI_CONNECTION_FAILED',
          'Не удалось подключить ИИ. Проверьте API-ключ, доступ к модели, баланс API и соединение с интернетом. Предыдущие настройки сохранены.',
        );
      } finally {
        checking = false;
      }
      return getSettings();
    },
    disable() {
      assertIdle();
      service = createAiService({ mode: 'mock', model: activeModel, timeoutMs, fetchImpl });
      activeKey = '';
      source = 'none';
      verified = false;
      return getSettings();
    },
  };
}
