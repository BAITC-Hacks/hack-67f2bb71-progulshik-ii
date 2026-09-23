export class ApiRequestError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message); this.name = 'ApiRequestError'; this.status = status; this.code = code; this.details = details;
  }
}

export function createApiClient({ baseUrl = 'http://127.0.0.1:3001', fetchImpl = globalThis.fetch } = {}) {
  const base = baseUrl.replace(/\/$/, '');
  async function request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiRequestError('Не удалось связаться с сервером. Проверьте, что сервер запущен.');
    }
    let result;
    try { result = await response.json(); } catch {
      throw new ApiRequestError('Сервер вернул некорректный ответ.', { status: response.status, code: 'INVALID_RESPONSE' });
    }
    if (!response.ok) throw new ApiRequestError(result.error?.message || 'Не удалось выполнить запрос.', {
      status: response.status, code: result.error?.code || 'REQUEST_FAILED', details: result.error?.details,
    });
    return result;
  }
  const key = (id) => encodeURIComponent(id);
  return {
    health: () => request('/api/health'),
    rubric: () => request('/api/rubric'),
    listTasks: (filters = {}) => {
      const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
      return request(`/api/tasks${search.size ? `?${search}` : ''}`);
    },
    getTask: (id) => request(`/api/tasks/${key(id)}`),
    createTask: (input) => request('/api/tasks', 'POST', input),
    updateTask: (id, input) => request(`/api/tasks/${key(id)}`, 'PATCH', input),
    confirmTask: (id, input) => request(`/api/tasks/${key(id)}/confirm`, 'POST', input),
    publishTask: (id, input) => request(`/api/tasks/${key(id)}/publish`, 'POST', input),
    analyzeTask: (input) => request('/api/ai/analyze', 'POST', input),
    listTeams: () => request('/api/teams'),
    createTeam: (input) => request('/api/teams', 'POST', input),
    listProposals: (taskId) => request(`/api/tasks/${key(taskId)}/proposals`),
    listAllProposals: (filters = {}) => {
      const search = new URLSearchParams(Object.entries(filters).filter(([name, value]) => ['taskId', 'teamId'].includes(name) && value));
      return request(`/api/proposals${search.size ? `?${search}` : ''}`);
    },
    createProposal: (taskId, input) => request(`/api/tasks/${key(taskId)}/proposals`, 'POST', input),
    decideProposal: (id, status) => request(`/api/proposals/${key(id)}`, 'PATCH', { status }),
  };
}
