import base from './playwright.config.js';

export default {
  ...base,
  outputDir: 'test-results-webkit',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5175', browserName: 'webkit', channel: undefined },
  webServer: { ...base.webServer, command: 'npm run dev -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175' },
  // These native touch tests use the Chromium debugging protocol.
  // They remain in npm test; all other browser flows also run under WebKit.
  grepInvert: /native multi-touch supports|phone layout stays within its viewport/,
};
