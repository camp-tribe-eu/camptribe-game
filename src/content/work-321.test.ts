// GAME-321 · жодної рутини не закрити без справжньої роботи (DAY-DESIGN §9, EPISODE-DESIGN §11). Один табличний сторож на ВСІ ручні рутини.
// Мутації (перевірено): МІН «tidy» → [0, 0] / «berries» → [1, 0] → таблиця червоніє; у CampRoutines прибрати `disabled={!ok('…')}` з будь-якої кнопки
// виходу → тест розмітки червоніє; у stepEmbers прибрати гілку `s.acts === 0` (вогонь сам після дій-нуль) → «вогонь без рук» червоніє.
import src from '../ui/CampRoutines.tsx?raw';
import { describe, expect, it } from 'vitest';
import { MIN_WORK, ROUTINE_IDS, canFinish } from './camp-day';
import { DISHES, IDLE_MS, emberOutcome, startEmbers, stepEmbers, type EmberState } from './embers';
import { STEPS, startWater, stepWater } from './water-carry';

const EXIT: Readonly<Record<keyof typeof MIN_WORK, string | null>> = { firewood: 'wood-done', lanterns: 'lantern-done', fish: 'fish-done', berries: 'berry-enough', tidy: 'tidy-sleep', fire: null };

describe('мінімум роботи: вихід закритий на старті, після одного дотику, після дій без часу й часу без дій', () => {
  it.each(Object.keys(MIN_WORK) as (keyof typeof MIN_WORK)[])('%s', (id) => {
    const [acts, ms] = MIN_WORK[id];
    expect(canFinish(id, 0, 0)).toBe(false);
    expect(canFinish(id, 1, 0)).toBe(false);
    expect(canFinish(id, acts - 1, 10 ** 9)).toBe(false);
    if (ms > 0) expect(canFinish(id, 10 ** 6, ms - 1)).toBe(false);
    expect(canFinish(id, acts, ms)).toBe(true);
    expect(acts).toBeGreaterThan(1);
  });
  it('усі рутини, крім води (що закінчується лише повним шляхом), мають мінімум', () => {
    expect(Object.keys(MIN_WORK).sort()).toEqual(ROUTINE_IDS.filter((id) => id !== 'water').sort());
  });
  it('кожна кнопка виходу в панелі стоїть за canFinish (disabled), а не вільна', () => {
    for (const [id, ui] of Object.entries(EXIT)) {
      if (ui === null) continue;
      const m = new RegExp(`data-ui="${ui}" disabled=\\{!ok\\('${id}'\\)\\}`);
      expect(src, `кнопка ${ui}`).toMatch(m);
    }
  });
  it('вода: крани й тики без кроків не закривають рутину', () => {
    let s = startWater(1);
    for (let k = 0; k < 4000; k++) s = stepWater(s, { kind: 'tick', dtMs: 16, down: k < 100 }).state;
    expect(s.phase).not.toBe('done');
    expect(STEPS).toBeGreaterThan(1);
  });
});

const FRAME = 1000 / 60;
describe('вогонь без рук', () => {
  const idle = (acts: number): { s: EmberState; at: number } => {
    let s = startEmbers(true);
    for (let k = 0; k < acts; k++) s = stepEmbers(s, { kind: 'act', act: 'blow' }).state;
    let at = 0;
    while (!s.done && at < 10 ** 6) { s = stepEmbers(s, { kind: 'tick', dtMs: FRAME }).state; at++; }
    return { s, at };
  };
  it('без жодної дії вечеря не готується й закінчується лише після довгого ліміту кадрів — як «сяк-так»', () => {
    const { s, at } = idle(0);
    expect(s.done).toBe(true);
    expect(s.quality).toHaveLength(0);
    expect(at * FRAME).toBeGreaterThanOrEqual(IDLE_MS);
    expect(at * FRAME).toBeGreaterThan(DISHES.reduce((a, d) => a + d.ms, 0) + 20000);
    expect(emberOutcome(s)).toBe('scrappy');
  });
  it('одна-дві дії й тиша — теж ніколи не «добре» й не «нормально»', () => {
    for (const n of [1, 2, 5]) expect(emberOutcome(idle(n).s), `${n} дій`).toBe('scrappy');
  });
  it('ідеальна вечеря з кількох дій (менше мінімуму) — теж лише «сяк-так»; з мінімумом дій — «добре»', () => {
    const cooked: EmberState = { ...startEmbers(true), done: true, quality: DISHES.map(() => 1) };
    expect(emberOutcome({ ...cooked, acts: MIN_WORK.fire[0] - 1 })).toBe('scrappy');
    expect(emberOutcome({ ...cooked, acts: MIN_WORK.fire[0] })).toBe('good');
  });
});
