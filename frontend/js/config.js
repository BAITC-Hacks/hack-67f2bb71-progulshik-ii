/* Frontend and API are served together. Credentials stay on the server. */
window.Sana = window.Sana || {};
window.Sana.config = {
  mode: 'http',
  apiBaseUrl: '',
  timeoutMs: 35000,
  demoDelayMs: 320,
  credentials: 'same-origin',
};
