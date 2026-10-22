// GAME-11 · самотест сторожа меж ядра. Лінтує справжнім eslint.config.js код-приклади так,
// ніби вони лежать у src/core/. Кожна заборона мусить почервоніти на своєму прикладі;
// дозволене — ні. Прибрати блок із конфігу — цей тест червоний (мутація в CI).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const CORE = 'src/core/__probe__.ts';

async function ruleIds(code: string, filePath = CORE): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

// Одна заборона — один зламаний приклад (умова картки: число прикладів = число заборон).
const BANNED: [ban: string, code: string, rule: string][] = [
  ['window', 'export const w = window.innerWidth;\n', 'no-restricted-globals'],
  ['document', 'export const t = document.title;\n', 'no-restricted-globals'],
  ['localStorage', "export const v = localStorage.getItem('k');\n", 'no-restricted-globals'],
  ['Date', 'export const now = Date.now();\n', 'no-restricted-globals'],
  ['Math.random', 'export const r = Math.random();\n', 'no-restricted-properties'],
  ['phaser', "import Phaser from 'phaser';\nexport const p = Phaser;\n", 'no-restricted-imports'],
  ['preact', "import { h } from 'preact';\nexport const x = h;\n", 'no-restricted-imports'],
  ['src/view', "import { scene } from '../view/scene';\nexport const s = scene;\n", 'no-restricted-imports'],
  ['src/ui', "import { menu } from '../ui/menu';\nexport const m = menu;\n", 'no-restricted-imports'],
  ['src/platform', "import { store } from '../platform/storage';\nexport const st = store;\n", 'no-restricted-imports'],
];

describe('сторож меж ядра (GAME-11)', () => {
  it('число прикладів = число заборон (10)', () => {
    expect(new Set(BANNED.map(([ban]) => ban)).size).toBe(10);
  });

  for (const [ban, code, rule] of BANNED) {
    it(`червоніє на ${ban}`, async () => {
      expect(await ruleIds(code)).toContain(rule);
    });
  }

  it('позитивний контроль: дозволений імпорт і чистий код у core/ — без знахідок', async () => {
    const ok = "import { buildLabel } from './build-info';\nexport const label = (seed: number): string => buildLabel(String(seed), '');\n";
    expect(await ruleIds(ok)).toEqual([]);
  });

  it('межа діє лише на core/: той самий Date.now() у src/view не червоніє', async () => {
    expect(await ruleIds('export const now = Date.now();\n', 'src/view/__probe__.ts')).toEqual([]);
  });
});
