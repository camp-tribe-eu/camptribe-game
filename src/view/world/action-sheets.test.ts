// GAME-191 (OD-022) · сторож: для КОЖНОГО шару героя й родини є листи slash / thrust / spellcast правильного розміру з рядком титрів,
// а PLAYER_ACTION_LOOK — це рівно ті самі шари й забарвлення, що PLAYER_LOOK. Мутації (вставлені в звіт картки): прибрати один файл
// або один рядок титрів → червоне з іменем шару; підмінити шар у PLAYER_ACTION_LOOK → червоне «шар не збігається».
import { describe, expect, it } from 'vitest';
import creditsCsv from '../../../assets/CREDITS.csv?raw';
import { FAMILY_LOOKS, PLAYER_ACTION_LOOK, PLAYER_LOOK } from './art';
import { ACTIONS, ACTION_FILE, type LayerSpec } from './character';

// Розмір листа (64 × стовпців дії) перевіряє composeSheet при складанні (кидає на іншому); тут — наявність файлу й рядок титрів.
const files = new Set(Object.keys(import.meta.glob('../../../assets/characters/**/*.png', { query: '?url' })).map((k) => k.replace('../../../assets/', '')));
const creditsFiles = new Set(creditsCsv.split('\n').map((l) => l.split(',')[0] ?? ''));
const layerOf = (url: string): string => {
  const m = /characters\/(.+)\/walk\.png/.exec(url);
  if (!m?.[1]) throw new Error(`не шар ходьби: ${url}`);
  return m[1];
};
const looks: ReadonlyArray<readonly [string, readonly LayerSpec[]]> = Object.entries(FAMILY_LOOKS).map(([k, v]) => [k, v]);
const layers = [...new Set(looks.flatMap(([, v]) => v.map((l) => layerOf(l.url))))].sort();

describe('листи дій героя й родини', () => {
  it('шарів родини не менше 17 (інакше обхід зламався й нічого не перевірено)', () => {
    expect(layers.length).toBeGreaterThanOrEqual(17);
  });

  for (const action of ACTIONS) {
    it(`${action}: кожен шар має файл ${ACTION_FILE[action]}.png і рядок титрів`, () => {
      for (const layer of layers) {
        const rel = `characters/${layer}/${ACTION_FILE[action]}.png`;
        expect(files.has(rel), `немає файлу ${rel}`).toBe(true);
        expect(creditsFiles.has(rel), `немає рядка титрів для ${rel}`).toBe(true);
      }
    });
  }

  it('PLAYER_ACTION_LOOK = ті самі шари й забарвлення, що PLAYER_LOOK, у тому ж порядку', () => {
    for (const action of ACTIONS) {
      const act = PLAYER_ACTION_LOOK[action];
      expect(act.length, `${action}: кількість шарів`).toBe(PLAYER_LOOK.length);
      PLAYER_LOOK.forEach((walk, i) => {
        const want = `characters/${layerOf(walk.url)}/${ACTION_FILE[action]}.png`;
        expect(act[i]?.url.includes(want), `${action}: шар ${i} не збігається з ${want}`).toBe(true);
        expect(act[i]?.tint ?? null, `${action}: tint шару ${i}`).toEqual(walk.tint ?? null);
      });
    }
  });
});
