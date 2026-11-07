// GAME-208 · погода дає ІНШІ побічні справи, а не провал (OD-022): content/requests.json, рядки з `weather` (без просильника й «Беруся»).
// Цілі видно в «Цілях» ☰ лише за погоди дня; дотик до позначки ставить ціль і done, нагорода — раз (GAME-181). Негативні контролі в кінці.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { WEATHERS, dayOf, forecastOf, weatherOf, type Weather } from '../core/weather';
import { WEATHER_KINDS } from '../../scripts/validator/codes.mjs';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import mapRaw from '../../public/maps/camp-lake.tmj?raw';
import { liveSpot } from './director';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import { openGoals } from '../view/story-offer';
import { REQUESTS, requestInteractions, requestStatus, requestFlags, type RequestDef } from './requests';
import { newSim } from '../core/sim';

let n = 0;
const send = (s: GameState, m: Move) => dispatch(s, { ...m, commandId: `wx${n++}` } as Command, GAME_DEFS);
function play(moves: readonly Move[], from: GameState): GameState {
  let s = from;
  for (const m of moves) { const r = send(s, m); if (!r.ok) throw new Error(`${m.type} → ${r.code}`); s = r.state; }
  return s;
}
const TO_CAMP: readonly Move[] = [
  { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move,
  { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, { type: 'Checkout' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
  { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' },
];
const camp = (): GameState => play(TO_CAMP, initialState(5_000));
const WX = REQUESTS.filter((r): r is RequestDef & { weather: Weather } => r.weather !== undefined);
const sideKeys = (g: GameState, w?: Weather): string[] => openGoals(g, STORY, w).filter((x) => x.kind === 'side').map((x) => x.key);
const wxKeys = (w: Weather): string[] => WX.filter((r) => r.weather === w).map((r) => r.titleKey);
const MAP = JSON.parse(mapRaw) as { layers: { name: string; objects?: { name: string }[] }[] };
const MAP_NAMES = new Set((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).map((o) => o.name));

describe('GAME-208 · дані справ за погодою', () => {
  it('перелік видів погоди валідатора = WEATHERS ядра (інакше сторож покриття стереже не те)', () => {
    expect([...WEATHER_KINDS].sort()).toEqual([...WEATHERS].sort());
  });
  it('кожен вид погоди має 2–3 справи; кожна — без просильника, з ціллю на мапі, текстами uk+en й записом журналу', () => {
    for (const w of WEATHERS) { const k = WX.filter((r) => r.weather === w).length; expect(k, w).toBeGreaterThanOrEqual(2); expect(k, w).toBeLessThanOrEqual(3); }
    for (const r of WX) {
      expect(r.giver, r.id).toBeUndefined();
      expect(r.after, r.id).toBeUndefined();
      for (const t of r.targets) expect(MAP_NAMES.has(t.spot), `${r.id}: ${t.spot} на мапі`).toBe(true);
      for (const k of [r.titleKey, r.goalKey, r.trackKey, ...r.targets.map((t) => t.labelKey), `journal.${r.doneFlag}`]) {
        for (const [lang, loc] of [['uk', uk], ['en', en]] as const) expect((loc as Record<string, string>)[k], `${lang} ${k}`).toBeTruthy();
      }
    }
  });
  it('тон: жодного покарання, жодної згадки Мії (вона не біля води й риби), жодного політичного чи релігійного слова', () => {
    const BAD = /штраф|програ|провал|покара|не встиг|Мі[яїює]\b|Mia|fail|punish|penalt|церкв|політ|church|politic/iu;
    for (const r of WX) for (const k of [r.titleKey, r.goalKey, r.trackKey, ...r.targets.map((t) => t.labelKey)]) for (const loc of [uk, en] as Record<string, string>[]) expect(loc[k], k).not.toMatch(BAD);
  });
  it('прапорці справ за погодою (ціль + done) є серед прапорців прохань, а «taken» у них немає', () => {
    const all = requestFlags();
    for (const r of WX) { expect(all).toEqual(expect.arrayContaining([r.doneFlag, ...r.targets.map((t) => t.flag)])); expect(all).not.toContain(r.takenFlag); }
  });
});

describe('GAME-208 · погода міняє справи в «Цілях» (Спосіб перевірки: дощовий і сонячний день дають різні побічні цілі)', () => {
  it('дощ, сонце й хмарно — три РІЗНІ непорожні набори побічних цілей, без перетину', () => {
    const g = camp();
    const sets = WEATHERS.map((w) => sideKeys(g, w).filter((k) => wxKeys(w).includes(k) || WX.some((r) => r.titleKey === k)));
    for (const [i, w] of WEATHERS.entries()) {
      expect(sets[i]?.length, w).toBeGreaterThanOrEqual(1);
      expect(sets[i]?.every((k) => wxKeys(w).includes(k)), `${w}: лише свої справи`).toBe(true);
    }
    expect(sideKeys(g, 'rain')).not.toEqual(sideKeys(g, 'sunny'));
    expect(sideKeys(g, 'sunny')).not.toEqual(sideKeys(g, 'cloudy'));
  });
  it('без погоди (старі виклики) і поза табором справ за погодою немає — старі шляхи й ботів не чіпає', () => {
    const g = camp();
    expect(sideKeys(g)).toEqual([]);
    const home = play([{ type: 'Visit', locationId: 'loc.road' }], g);
    for (const w of WEATHERS) expect(sideKeys(home, w).some((k) => WX.some((r) => r.titleKey === k)), w).toBe(false);
  });
  it('позначка живе лише за своєї погоди; дотик ставить ціль і done, нагорода видається раз; справа зникає з цілей', () => {
    const r = WX.find((x) => x.weather === 'rain') as RequestDef;
    const spot = (r.targets[0] as { spot: string }).spot;
    const sim = (w: Weather) => ({ ...newSim(5_000, 0), game: camp(), clock: { minutes: 0 } as never, worldSeed: seedWith(w) });
    expect(liveSpot(sim('rain') as never, spot)).toBe(true);
    expect(liveSpot(sim('sunny') as never, spot)).toBe(false);
    let s = camp();
    expect(requestStatus(s.flags, r, REQUESTS, 'rain')).toBe('active');
    s = play([{ type: 'Interact', targetId: spot }], s);
    expect(s.flags).toEqual(expect.arrayContaining([r.doneFlag, ...r.targets.map((t) => t.flag)]));
    expect(s.progress?.xp ?? 0).toBe((camp().progress?.xp ?? 0) + r.reward.xp);
    expect(sideKeys(s, 'rain')).not.toContain(r.titleKey);
    const again = send(s, { type: 'Interact', targetId: spot });
    expect(again.ok ? again.state.progress?.xp : s.progress?.xp, 'нагорода раз').toBe(s.progress?.xp);
  });
  it('без покарання: справа, яку не зробили, лишається відкритою до тієї ж погоди й нічого не забирає в іншу', () => {
    const g = camp();
    const r = WX.find((x) => x.weather === 'rain') as RequestDef;
    expect(requestStatus(g.flags, r, REQUESTS, 'rain')).toBe('active');
    expect(requestStatus(g.flags, r, REQUESTS, 'sunny')).toBe('locked');   // «locked» = просто не сьогодні; жодного failed-стану немає
    expect(requestStatus(g.flags, r, REQUESTS, 'rain')).toBe('active');
  });
  it('інтеракції справ за погодою: остання ціль ставить і done (розмови-здачі немає)', () => {
    const ints = requestInteractions();
    for (const r of WX) expect(ints[(r.targets[r.targets.length - 1] as { spot: string }).spot]?.flags, r.id).toContain(r.doneFlag);
  });
});

/** Зерно, за якого День 0 має задану погоду (перебір; закріплює, що погода — функція зерна й дня, GAME-46). */
function seedWith(w: Weather): number { for (let s = 0; s < 500; s++) if (weatherOf(s, 0) === w) return s; throw new Error(w); }

describe('GAME-208 · погода детермінована від зерна й дня (SIM-WX-005), справи за нею — теж', () => {
  it('той самий seed+день → та сама погода й та сама прогноз-підказка; різні зерна дають різні дні', () => {
    for (const seed of [1, 7, 20261022]) for (let d = 0; d < 60; d++) { expect(weatherOf(seed, d)).toBe(weatherOf(seed, d)); expect(forecastOf(seed, d)).toBe(forecastOf(seed, d)); }
    expect(dayOf({ minutes: 1440 * 3 + 5 })).toBe(3);
    expect(Array.from({ length: 30 }, (_, d) => weatherOf(1, d)).join()).not.toBe(Array.from({ length: 30 }, (_, d) => weatherOf(2, d)).join());
  });
  it('цілі дня — функція (стан, погода): однакові при повторі, і дощовий день ≠ сонячний для одного й того ж стану', () => {
    const g = camp();
    const seed = 20261022;
    const w = weatherOf(seed, 0);
    expect(sideKeys(g, w)).toEqual(sideKeys(g, w));
    const other = WEATHERS.find((x) => x !== w) as Weather;
    expect(sideKeys(g, other)).not.toEqual(sideKeys(g, w));
  });
});
