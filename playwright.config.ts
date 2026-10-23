// e2e у справжньому браузері. Локально в хмарній сесії — передвстановлений Chromium через
// PW_CHROMIUM_PATH (його збірка старша за ту, що чекає Playwright); у CI — `npx playwright install`.
import { defineConfig } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH;
// Окремий порт для паралельних прогонів (кілька копій репозиторію на одній машині).
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    deviceScaleFactor: 1,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  // --mode e2e: вмикає перемикачі негативних контролів (src/view/test-switches.ts); у звичайній збірці їх немає.
  webServer: {
    command: `npx vite build --mode e2e && npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
