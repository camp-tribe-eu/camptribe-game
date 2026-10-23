// GAME-25 · самотест сторожа меж UI: UI не імпортує значень з ядра чи сцени; типи — можна.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function ruleIds(code: string, filePath = 'src/ui/__probe__.tsx'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const BANNED: [what: string, code: string][] = [
  ['значення з ядра (dispatch)', "import { dispatch } from '../core/commands';\nexport const d = dispatch;\n"],
  ['значення з ядра (sim)', "import { step } from '../core/sim';\nexport const s = step;\n"],
  ['місток сцени', "import { createBridge } from '../view/world/bridge';\nexport const b = createBridge;\n"],
  ['сцена', "import { WorldScene } from '../view/world/scene';\nexport const w = WorldScene;\n"],
  ['Phaser', "import Phaser from 'phaser';\nexport const p = Phaser;\n"],
  ['src/core alias', "import { dispatch } from 'src/core/commands';\nexport const d = dispatch;\n"],
  ['вкладена тека UI', "import { dispatch } from '../../core/commands';\nexport const d = dispatch;\n"],
  ['динамічний import()', "export const m = import('../core/commands');\n"],
  ['export * з ядра', "export * from '../core/commands';\n"],
];

describe('сторож меж UI (GAME-25)', () => {
  for (const [what, code] of BANNED) {
    it(`червоніє: ${what}`, async () => {
      const ids = (await ruleIds(code)).filter((r) => !r.startsWith('fatal'));
      expect(ids.length).toBeGreaterThan(0);
    });
  }

  it('позитивний контроль: import type з ядра — дозволено', async () => {
    expect(await ruleIds("import type { GameState } from '../core/state';\nexport type S = GameState;\n")).toEqual([]);
  });

  it('позитивний контроль: платформа й власні модулі UI — дозволено', async () => {
    expect(await ruleIds("import { loadSettings } from '../platform/settings';\nimport { STRINGS } from './strings';\nexport const a = [loadSettings, STRINGS];\n")).toEqual([]);
  });

  it('межа діє лише на src/ui: той самий імпорт у src/view не червоніє', async () => {
    expect(await ruleIds("import { dispatch } from '../core/commands';\nexport const d = dispatch;\n", 'src/view/__probe__.ts')).toEqual([]);
  });
});
