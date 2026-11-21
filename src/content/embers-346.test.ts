// GAME-346 · вогонь «сяк-так» у звичайного гравця. Причина — не баланс, а незрозумілий вхід: «Підкинути дров» спершу ПРИБИРАЄ жар (дим),
// і розумний тап «бракує жару → дрова» кожні 0,3 с щоразу збивав його знову й тримав жар на нулі. Тепер дрова під час диму нічого не збивають,
// правило каже, що дрова спершу димлять, а на дошці під «сяк-так» стоїть «Чому:».
// Мутація (перевірено): прибрати рядок `if (i.act === 'wood' && s.smokeMs > 0) return …` в embers.ts → «нетерплячий тап дров» червоніє (бал 0).
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { FIRE_WHY_KEY, dishOf, emberOutcome, emberScore, fireWhy, startEmbers, stepEmbers, type EmberAct, type EmberState } from './embers';
import { makeRng } from './fishing';
import { NORMAL, type Outcome } from './minigame';

type Policy = (s: EmberState) => EmberAct | null;
const bandOf = (s: EmberState): { from: number; to: number } => dishOf(s)?.band ?? { from: 0, to: 1 };
const mid = (s: EmberState) => { const b = bandOf(s); return (b.from + b.to) / 2; };
const POLICIES: Record<string, Policy> = {
  'роздмухує, коли нижче середини смуги': (s) => (s.heat < mid(s) - 0.05 ? 'blow' : null),
  'роздмухує й розгрібає': (s) => (s.heat < mid(s) - 0.05 ? 'blow' : s.heat > bandOf(s).to ? 'rake' : null),
  'дрова, коли жару мало, а далі роздмух': (s) => (s.heat < bandOf(s).from - 0.1 && s.smokeMs === 0 ? 'wood' : s.heat < mid(s) - 0.05 ? 'blow' : null),
};
/** Лише «дрова, коли жару мало» — вхід, на якому гравці й застрягали (не вимога «Нормально», а межа: не нуль). */
const WOOD_ONLY: Policy = (s) => (s.heat < bandOf(s).from ? 'wood' : null);
const RANK: Record<Outcome, number> = { scrappy: 0, fine: 1, good: 2 };

/** Гравець реагує раз на `reactMs ± джитер` (зерно), крок кадру 100 мс; повертає фінал. */
function play(policy: Policy, reactMs: number, seed: number): EmberState {
  const rng = makeRng(seed);
  let s = startEmbers(true);
  let next = Math.round(rng() * reactMs);
  for (let t = 0; !s.done && t < 200000; t += 100) {
    if (t >= next) { const a = policy(s); if (a) s = stepEmbers(s, { kind: 'act', act: a }, NORMAL).state; next = t + Math.round(reactMs * (0.7 + 0.6 * rng())); }
    s = stepEmbers(s, { kind: 'tick', dtMs: 100 }, NORMAL).state;
  }
  return s;
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('GAME-346 · вогонь для розумного гравця', () => {
  for (const [name, pol] of Object.entries(POLICIES)) {
    it(`«${name}»: не гірше за «Нормально» на всіх зернах і реакціях 0,3–1 с`, () => {
      for (const seed of SEEDS) for (const react of [300, 600, 1000]) {
        const s = play(pol, react, seed);
        expect(s.done, `${name} ${seed}/${react}`).toBe(true);
        expect(RANK[emberOutcome(s)], `${name} зерно ${seed}, реакція ${react} мс: бал ${emberScore(s).toFixed(2)}`).toBeGreaterThanOrEqual(RANK.fine);
      }
    });
  }
  it('нетерплячий тап дров не тримає жар на нулі: перші дрова не збиваються повторними', () => {
    const s0 = startEmbers(true);
    const once = stepEmbers(s0, { kind: 'act', act: 'wood' }, NORMAL).state;
    const twice = stepEmbers(once, { kind: 'act', act: 'wood' }, NORMAL).state;
    expect(twice.heat).toBe(once.heat);
    expect(twice.smokeMs).toBe(once.smokeMs);
    for (const seed of SEEDS) expect(emberScore(play(WOOD_ONLY, 300, seed)), `зерно ${seed}`).toBeGreaterThan(0.3);
  });
});

describe('GAME-346 · «Чому:» під «сяк-так»', () => {
  it('кожен «сяк-так» вогонь має причину, і її ключ є в обох мовах', () => {
    // вогонь без догляду й вогонь із діями, але поза смугою — обидва «сяк-так»
    const idle = (() => { let s = startEmbers(true); for (let t = 0; !s.done; t += 100) s = stepEmbers(s, { kind: 'tick', dtMs: 100 }, NORMAL).state; return s; })();
    const wrong = (() => { let s = startEmbers(true); for (let t = 0; !s.done && t < 200000; t += 100) { if (t % 500 === 0) s = stepEmbers(s, { kind: 'act', act: 'rake' }, NORMAL).state; s = stepEmbers(s, { kind: 'tick', dtMs: 100 }, NORMAL).state; } return s; })();
    const seen = new Set<string>();
    for (const s of [idle, wrong]) {
      expect(emberOutcome(s)).toBe('scrappy');
      const why = fireWhy(s);
      expect(why).not.toBeNull();
      const key = FIRE_WHY_KEY[why ?? 'idle'];
      seen.add(key);
      expect((uk as Record<string, string>)[key], key).toMatch(/^Чому:/);
      expect((en as Record<string, string>)[key], key).toMatch(/^Why:/);
    }
    expect(seen.size).toBe(2);
  });
});
