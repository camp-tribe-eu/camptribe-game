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
// GAME-330: білий список замість чорного — ядру з рядка потрібні лише ці поля (RawContent.flags у src/content/story.ts); initial/kind/aka/reserved/generatedFrom/valuesFrom читають лише валідатор і тести.
const RUNTIME_FLAG_FIELDS = new Set(['id', 'type', 'values', 'journal']);
const stripFlagDocs: Plugin = {
  name: 'strip-flag-docs',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/content/flags.json')) return null;
    const rows = JSON.parse(code) as Record<string, unknown>[];
    return { code: JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => RUNTIME_FLAG_FIELDS.has(k))))), map: null };
  },
};

// GAME-330: assets/credits.json (124 КБ) читають лише Shell (files + licences[].url) і сторож ліцензій; `authors` (групування за автором, 59 КБ),
// `generated_by`, `source` і `drm_ok` у збірці гри ніхто не читає — вони йдуть. У тестах, e2e і сторожі файл лишається повним.
const stripCreditsDocs: Plugin = {
  name: 'strip-credits-docs',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/assets/credits.json')) return null;
    const c = JSON.parse(code) as { licences: Record<string, { url: string }>; files: unknown[] };
    const licences = Object.fromEntries(Object.entries(c.licences).map(([name, l]) => [name, { url: l.url }]));
    return { code: JSON.stringify({ licences, files: c.files }), map: null };
  },
};

export default defineConfig({
  base: './',
  plugins: [gameName, stripFlagDocs, stripCreditsDocs],
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
