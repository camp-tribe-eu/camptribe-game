// GAME-300 · персонажі вступу стоять НА підлозі: підошви нижче лінії підлоги, тіло Метью не наїжджає на полицю, ноги вище за рамку розмови.
import { describe, expect, it } from 'vitest';
import { BASE_DROP, FEET_MIN_DROP, roomGeometry, roomLayout, type Rect, type Who } from './intro-geometry';

const VIEWS: readonly (readonly [number, number])[] = [[390, 844], [932, 430], [844, 390], [667, 375], [568, 320], [800, 800], [1600, 900], [2000, 1086], [1280, 720], [375, 667]];
const WHO: readonly Who[] = ['victoria', 'matthew', 'george'];
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Логічні px сцени → CSS px екрана (так само, як r() у roomGeometry). */
const cssY = (w: number, h: number): ((y: number) => number) => { const { scale } = roomLayout(w, h); return (y) => y * (h / Math.ceil(h / scale)); };

describe('GAME-300 · геометрія кімнати вступу', () => {
  for (const [w, h] of VIEWS) {
    it(`${w}×${h}: підошви на смузі підлоги (нижче лінії підлоги) і в екрані`, () => {
      const g = roomGeometry(w, h);
      const y = cssY(w, h);
      for (const who of WHO) for (const family of [false, true]) {
        const f = g.feet(who, family);
        expect(f.y + f.h, `${who}: низ підошов — не вище за лінію підлоги + ${FEET_MIN_DROP}`).toBeGreaterThanOrEqual(y(g.floorY + FEET_MIN_DROP) - 1e-6);
        expect(f.y, `${who}: підошви не вище за лінію підлоги`).toBeGreaterThanOrEqual(y(g.floorY) - 1e-6);
        expect(f.y + f.h, `${who}: підошви в екрані`).toBeLessThanOrEqual(h);
      }
    });
    it(`${w}×${h}: Метью (герой) не перекриває полицю й торшер; ноги вище за рамку розмови`, () => {
      const g = roomGeometry(w, h);
      for (const family of [false, true]) {
        expect(meets(g.body('matthew', family), g.shelf), 'тіло Метью ∩ полиця = ∅').toBe(false);
        expect(meets(g.body('matthew', family), g.lamp), 'тіло Метью ∩ торшер = ∅').toBe(false);
      }
      const f = g.feet('matthew', false);
      const frac = (f.y + f.h) / h;
      expect(frac, `ноги Метью на ${(frac * 100).toFixed(0)} % висоти`).toBeLessThanOrEqual(h >= w * 0.9 ? 0.74 : 0.7);
    });
  }
  it('меблі стоять основою на BASE_DROP нижче лінії підлоги, ноги — глибше за основу (перед меблями, не на полиці)', () => {
    expect(FEET_MIN_DROP).toBeGreaterThan(BASE_DROP);
    for (const [w, h] of VIEWS) {
      const g = roomGeometry(w, h);
      const y = cssY(w, h);
      const f = g.feet('george', true);
      expect(f.y + f.h, `${w}×${h}: підошви Джорджа глибше за основу полиці`).toBeGreaterThan(g.shelf.y + g.shelf.h);
      expect(g.shelf.y + g.shelf.h, `${w}×${h}: основа полиці = лінія підлоги + ${BASE_DROP}`).toBeCloseTo(y(g.floorY + BASE_DROP), 3);
    }
  });
});
