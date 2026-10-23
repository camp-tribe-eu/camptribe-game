// Збірка гри. base './' — щоб статика працювала й під підшляхом GitHub Pages (/camptribe-game/).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Повний SHA коміту: у CI — з GITHUB_SHA, локально — з git. Немає ні того, ні іншого — чесне 'unknown'.
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

export default defineConfig({
  base: './',
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
  },
});
