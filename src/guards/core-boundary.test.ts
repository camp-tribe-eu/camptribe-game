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

// Обходи, які знайшла рецензія PR #13: кожна заборона мусить триматися в усіх формах запису.
const BYPASSES: [form: string, code: string, filePath?: string][] = [
  ['globalThis.document', 'export const a = globalThis.document;\n'],
  ['self.localStorage', 'export const a = self.localStorage;\n'],
  ['globalThis.Date.now()', 'export const a = globalThis.Date.now();\n'],
  ["globalThis['Date']", "export const D = globalThis['Date'];\n"],
  ['globalThis.Math.random()', 'export const a = globalThis.Math.random();\n'],
  ['псевдонім Math', 'const M = Math;\nexport const a = M.random();\n'],
  ["Reflect.get(Math, 'random')", "export const a = (Reflect.get(Math, 'random') as () => number)();\n"],
  ["Math['random']", "export const a = Math['random']();\n"],
  ['const { random } = Math', 'const { random } = Math;\nexport const a = random();\n'],
  ["import('phaser')", "export const a = import('phaser');\n"],
  ["import('../view/x')", "export const a = import('../view/x');\n"],
  ['../View (регістр)', "import { a } from '../View/x';\nexport const b = a;\n"],
  ['..//ui (подвійний слеш)', "import { a } from '..//ui/x';\nexport const b = a;\n"],
  ['src/ui alias', "import { a } from 'src/ui/x';\nexport const b = a;\n"],
  ['@/platform alias', "import { a } from '@/platform/x';\nexport const b = a;\n"],
  ['вкладена тека ядра', "import { a } from '../../view/x';\nexport const b = a;\n", 'src/core/a/b/c.ts'],
  ['export * from ../ui', "export * from '../ui/x';\n"],
  ['performance.now()', 'export const a = performance.now();\n'],
  ['setTimeout', 'export const a = setTimeout;\n'],
  ['crypto.getRandomValues', 'export const a = crypto.getRandomValues(new Uint8Array(1));\n'],
  ['Intl (формат «зараз»)', 'export const a = new Intl.DateTimeFormat().format();\n'],
  ['файл .tsx', 'export const a = Date.now();\n', 'src/core/x.tsx'],
  ['файл .mjs', 'export const a = Date.now();\n', 'src/core/x.mjs'],
  ['файл .js', 'export const a = Math.random();\n', 'src/core/x.js'],
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

  for (const [form, code, filePath] of BYPASSES) {
    it(`обхід не проходить: ${form}`, async () => {
      expect((await ruleIds(code, filePath)).filter((r) => !r.startsWith('fatal')).length).toBeGreaterThan(0);
    });
  }

  it('позитивний контроль: власна підтека ядра ./ui — не межа шару (без хибного спрацювання)', async () => {
    expect(await ruleIds("import { a } from './ui/x';\nexport const b = a;\n")).toEqual([]);
  });

  it('позитивний контроль: Date як тип і Math.floor — дозволені', async () => {
    expect(await ruleIds('export const f = (d: Date): number => Math.floor(d.getTime());\n')).toEqual([]);
  });

  it('позитивний контроль: дозволений імпорт і чистий код у core/ — без знахідок', async () => {
    const ok = "import { buildLabel } from './build-info';\nexport const label = (seed: number): string => buildLabel(String(seed), '');\n";
    expect(await ruleIds(ok)).toEqual([]);
  });

  it('межа діє лише на core/: той самий Date.now() у src/view не червоніє', async () => {
    expect(await ruleIds('export const now = Date.now();\n', 'src/view/__probe__.ts')).toEqual([]);
  });
});
