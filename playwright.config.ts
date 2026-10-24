// e2e у справжньому браузері. Локально в хмарній сесії — передвстановлений Chromium через
// PW_CHROMIUM_PATH (його збірка старша за ту, що чекає Playwright); у CI — офіційний образ Playwright (check.yml, GAME-85).
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
  // GAME-97: проба fps міряє абсолютне число, тож ділити процесор з іншими тестами їй не можна — інакше результат залежить від
  // того, який важкий тест випав поруч (CI #45: 4,97 fps при 60 наодинці, полотно те саме). Тести продуктивності — окремий
  // проєкт ПІСЛЯ всіх інших (dependencies), а всередині — послідовно (game-97.spec: mode serial). Лише ці тести, без решти:
  // `npx playwright test game-97 --no-deps` (інакше залежність проганяє весь проєкт e2e перед ними).
  projects: [
    { name: 'e2e', testIgnore: /game-(97|38)\.spec\.ts/ },
    { name: 'perf', testMatch: /game-97\.spec\.ts/, dependencies: ['e2e'] },
    // GAME-38: перший кадр — теж абсолютний вимір; окремий проєкт ПІСЛЯ perf, щоб два файли perf не йшли паралельно різними воркерами.
    { name: 'perf-boot', testMatch: /game-38\.spec\.ts/, dependencies: ['perf'] },
  ],
  webServer: {
    command: `npx vite build --mode e2e && npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
