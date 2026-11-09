// GAME-285 · каркас квестів розділу 2: ланцюг від прибуття до дому при будь-якій погоді (в дощ — без водоспаду, рішення власника 08.11),
// chapter2_complete — ПОХІДНЕ від квесту CH2-D3-HOME-001, усі локації розділу 2 — не інертні для бота (inertLocations, GAME-283).
// Закон 1: кожен сторож нижче показано червоним на мутованій копії (дані тут же) і ще раз — мутацією файлу в описі PR.
import { describe, expect, it } from 'vitest';
import flags from '../../content/flags.json';
import locations from '../../content/locations.json';
import quests from '../../content/quests.json';
import { initialState } from '../core/state';
import { CHAPTER2_END, chapter2Complete, chapterComplete } from '../core/story';
import { WEATHERS } from '../core/weather';
import type { StoryDefs } from '../core/defs';
import { GAME_DEFS } from './slice-defs';
import { inertLocations, moves } from './moves';
import { STORY } from './story';

interface Q { id: string; end?: boolean; objectives: { target: string; required: boolean }[]; transitions: { on: string; to: string }[] }
const START = 'CH2-ARRIVAL-001';
const CH2 = (quests as Q[]).filter((q) => q.id.startsWith('CH2-'));
/** Незакриті дощем місця (рішення власника 08.11: водоспад і галявина в дощ необов'язкові). */
const RAIN_OPTIONAL = new Set(['loc.waterfall', 'loc.meadow.orchid']);

/** Чи є шлях START → квест-кінець, де кожен крок прохідний за погоди (обов'язкові цілі не в RAIN_OPTIONAL під дощем). */
function chainExists(qs: readonly Q[], weather: string): boolean {
  const by = new Map(qs.map((q) => [q.id, q]));
  const passable = (q: Q) => weather !== 'rain' || q.objectives.every((o) => !o.required || !RAIN_OPTIONAL.has(o.target));
  const seen = new Set<string>();
  const stack = [START];
  while (stack.length) {
    const q = by.get(stack.pop() as string);
    if (!q || seen.has(q.id) || !passable(q)) continue;
    seen.add(q.id);
    if (q.end) return true;
    for (const t of q.transitions) stack.push(t.to);
  }
  return false;
}

describe('ланцюг квестів розділу 2 (GAME-285)', () => {
  it('є квести, початок і кінець (інакше решта нічого не доводить)', () => {
    expect(CH2.length).toBeGreaterThanOrEqual(10);
    expect(CH2.map((q) => q.id)).toContain(START);
    expect(CH2.filter((q) => q.end).map((q) => q.id)).toEqual([CHAPTER2_END]);
  });

  it.each(WEATHERS)('шлях від прибуття до CH2-D3-HOME-001 існує за погоди %s', (w) => {
    expect(chainExists(CH2, w)).toBe(true);
  });

  it('МУТАЦІЯ «прибрано дощову гілку»: без майстер-класу в дощ шляху немає → сторож червоніє', () => {
    const noRainBranch = CH2.map((q) => (q.id === 'CH2-D2-ACTIVITY-001' ? { ...q, transitions: q.transitions.filter((t) => t.to !== 'CH2-D2-WORKSHOP-001') } : q));
    expect(chainExists(noRainBranch, 'rain')).toBe(false);
    expect(chainExists(noRainBranch, 'sun')).toBe(true);   // у суху погоду водоспад лишається — отже, сторож не червоніє «завжди»
    const workshopNeedsFall = CH2.map((q) => (q.id === 'CH2-D2-WORKSHOP-001' ? { ...q, objectives: [{ target: 'loc.waterfall', required: true }] } : q));
    expect(chainExists(workshopNeedsFall, 'rain')).toBe(false);
  });

  it('МУТАЦІЯ «квест без досяжного кінця»: кінець втратив end → шляху немає', () => {
    expect(chainExists(CH2.map((q) => (q.id === CHAPTER2_END ? { ...q, end: false } : q)), 'sun')).toBe(false);
  });

  it('вибір стежки на дні 2: обидві гілки ведуть далі', () => {
    const plan = CH2.find((q) => q.id === 'CH2-D2-PLAN-001') as Q;
    expect(plan.transitions.map((t) => t.to).sort()).toEqual(['CH2-D2-TRAIL-FORGOTTEN-001', 'CH2-D2-TRAIL-OTHER-001']);
    for (const t of plan.transitions) expect(chainExists(CH2.map((q) => (q.id === plan.id ? { ...q, transitions: [t] } : q)), 'rain'), t.to).toBe(true);
  });
});

describe('chapter2_complete виведено з квесту (GAME-285)', () => {
  const st = STORY as unknown as Pick<StoryDefs, 'quests'>;
  const at = (status?: string) => ({ ...initialState(0), quests: status ? { [CHAPTER2_END]: { status, done: [] } } : {} }) as never;

  it('у flags.json немає прапорця chapterN_complete: його не поставити без квесту', () => {
    expect((flags as { id: string }[]).filter((f) => /chapter\d+_complete/.test(f.id))).toEqual([]);
  });
  it('true лише за завершеного CH2-D3-HOME-001; campaignEnded без квесту — не вірить', () => {
    expect(chapter2Complete(at(), st)).toBe(false);
    expect(chapter2Complete(at('active'), st)).toBe(false);
    expect(chapter2Complete({ ...(at() as object), campaignEnded: true } as never, st)).toBe(false);   // МУТАЦІЯ «прапорець без квесту»
    expect(chapter2Complete(at('completed'), st)).toBe(true);
    expect(chapterComplete(at(), st)).toBe(false);
  });
});

describe('локації розділу 2 не інертні (GAME-283 ↔ GAME-285)', () => {
  const CH2_LOCS = (locations as { id: string }[]).map((l) => l.id).filter((id) => /mullerthal|trail|waterfall|meadow|schengen/.test(id));
  it('усі 7 локацій розділу 2 згадані квестами: бот ходить туди', () => {
    expect(CH2_LOCS.length).toBe(7);
    const inert = inertLocations(GAME_DEFS.story as StoryDefs);
    for (const id of CH2_LOCS) expect(inert.has(id), id).toBe(false);
  });
  it('МУТАЦІЯ «квести розділу 2 і замки прибрано»: ті самі локації знову інертні (сторож inertLocations живий)', () => {
    const src = GAME_DEFS.story as StoryDefs;
    const st = {
      ...src,
      quests: Object.fromEntries(Object.entries(src.quests).filter(([id]) => !id.startsWith('CH2-'))),
      npcs: Object.fromEntries(Object.entries(src.npcs).filter(([, n]) => !CH2_LOCS.includes(n.locationId))),   // GAME-286: господиня живе в Мюллерталі — без неї локація інертна
      locations: Object.fromEntries(Object.entries(src.locations).map(([id, l]) => [id, CH2_LOCS.includes(id) ? { items: l.items } : l])),
    } as unknown as StoryDefs;
    const inert = inertLocations(st);
    for (const id of CH2_LOCS) expect(inert.has(id), id).toBe(true);
  });
  it('до завершення розділу 1 жодна з них не відкрита (бот розділу 1 не розгалужується)', () => {
    for (const id of CH2_LOCS) expect((locations as { id: string; unlockedBy?: string }[]).find((l) => l.id === id)?.unlockedBy, id).toBeTruthy();
  });
});

describe('замкнені локації — не ходи (GAME-285)', () => {
  it('на старті гри Visit до локацій розділу 2 не пропонується; після завершення CH1-D3-HOME-001 мапа Мюллерталя відкрита', () => {
    const visits = (s: ReturnType<typeof initialState>) => moves(s, GAME_DEFS).filter((m) => m.type === 'Visit').map((m) => (m as { locationId: string }).locationId);
    expect(visits(initialState(0))).not.toContain('loc.camp.mullerthal');
    const done = { ...initialState(0), quests: { 'CH1-D3-HOME-001': { status: 'completed', done: [] } } } as never;
    expect(visits(done)).toContain('loc.camp.mullerthal');
  });
});
