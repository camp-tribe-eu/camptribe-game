// Збірка гри. base './' — щоб статика працювала й під підшляхом GitHub Pages (/camptribe-game/).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { GAME_NAME } from './src/config/brand.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Повний SHA коміту: у CI — з GITHUB_SHA, локально — з git. Немає ні того, ні іншого — чесне 'unknown'.
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

// GAME-119: назва гри в <title> index.html і spike.html — з однієї константи (src/config/brand.ts), і в dev, і в збірці.
// order 'pre' — раніше за власну підстановку Vite %ENV%, яка цього імені не знає.
const gameName: Plugin = {
  name: 'game-name',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%GAME_NAME%', GAME_NAME) },
};

// Бюджет стартового JS: реєстр прапорців content/flags.json несе довгі `owner`/`note` — документація для людей і валідатора (вони читають файл
// напряму). У збірці гри їх ніхто не читає (compileStory бере id/type/journal/values), тож зі збірки вони йдуть; у тестах і dev файл лишається повним.
const stripFlagDocs: Plugin = {
  name: 'strip-flag-docs',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/content/flags.json')) return null;
    const rows = JSON.parse(code) as Record<string, unknown>[];
    return { code: JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'owner' && k !== 'note')))), map: null };
  },
};

export default defineConfig({
  base: './',
  plugins: [gameName, stripFlagDocs],
  // Друга сторінка — спайк Phaser 4 (GAME-14); у грі не з'являється.
  build: { rollupOptions: { input: { main: 'index.html', spike: 'spike.html' } } },
  define: {
    __GAME_VERSION__: JSON.stringify(pkg.version),
    __GAME_COMMIT__: JSON.stringify(commitSha()),
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Кожен файл тестів — окремий процес: детермінізм GAME-13 звіряється між процесами.
    pool: 'forks',
    // Боти й переборі симулюють роки гри; під навантаженням CI (4 ядра, паралельні файли) стандартні 5 с давали
    // хибне червоне (рецензія GAME-71: 5,4–7 с). Межа — щоб тест не висів, а не щоб міряти швидкість.
    testTimeout: 30_000,
  },
});
