// GAME-200 · найближча нагорода й цілі журналу: чиста функція над станом. Закон 1: мутації — вибір НАЙДАЛЬШОЇ замість найближчої й «нагорода без кроків» — червоніють.
import { describe, expect, it } from 'vitest';
import type { GameState } from '../core/state';
import { newSim, step } from '../core/sim';
import { GAME_DEFS } from './slice-defs';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';
import { rewardCandidates, nearestReward, type NearestReward } from './nearest-reward';
import { REQUESTS, requestFlag } from './requests';
import { TRACES, traceFlags } from './traces';
import { ATLAS_PAGES } from './stickers';
import { openGoals, tomorrowKeyOf } from '../view/story-offer';
import { STORY } from './story';
import { daysEnded } from '../core/day-summary';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { isCh1Quest } from './ch2-scope.test.helpers';

const created = (): GameState => {
  const n = PROLOGUE_BIKE.findIndex((i) => i.kind === 'command') + 1;
  return PROLOGUE_BIKE.slice(0, n).reduce((s, i) => step(s, i, { defs: GAME_DEFS }), newSim(SEED, START_MONEY)).game;
};
const withFlags = (g: GameState, fl: string[]): GameState => ({ ...g, flags: [...g.flags, ...fl] });
const nora = ((): (typeof REQUESTS)[number] & { t0: string; t1: string } => {
  const r = REQUESTS.find((x) => x.id === 'req.nora-shore');
  if (!r || r.targets.length < 3) throw new Error('req.nora-shore: очікується ≥ 3 цілі');
  return { ...r, t0: (r.targets[0] as { flag: string }).flag, t1: (r.targets[1] as { flag: string }).flag };
})();

describe('найближча нагорода', () => {
  it('немає персонажа — немає нагороди', () => { expect(nearestReward({ ...created(), player: null })).toBeNull(); });
  it('на старті: є завжди (сліди Генрі чи Атлас) — «ще N» ≥ 1', () => {
    const n = nearestReward(created());
    expect(n).not.toBeNull();
    expect(n?.left).toBeGreaterThanOrEqual(1);
  });
  it('прохання в роботі, лишилась одна ціль, — воно найближче: «ще 1»', () => {
    const g = withFlags(created(), [nora.takenFlag, nora.t0, nora.t1]);
    expect(nearestReward(g)).toEqual({ kind: 'request', left: 1, labelKey: nora.trackKey, ui: false });
  });
  it('усі цілі зроблено — ще 1 крок: повернутись до просильника', () => {
    const g = withFlags(created(), [nora.takenFlag, ...nora.targets.map((t) => t.flag)]);
    expect(nearestReward(g)).toMatchObject({ kind: 'request', left: 1 });
  });
  it('сліди: лишився один — «листівка Генрі, ще 1» (найближче, прохань немає)', () => {
    const fl = traceFlags(TRACES).slice(1);
    const g = withFlags(created(), fl);
    expect(nearestReward(g)).toEqual({ kind: 'henry', left: 1, labelKey: 'rw.henry', ui: true });
  });
  it('усі сліди знайдено — листівки в кандидатах немає', () => {
    const g = withFlags(created(), traceFlags(TRACES));
    expect(rewardCandidates(g).some((c) => c.kind === 'henry')).toBe(false);
  });
  it('вибирається найменше «ще N»; при рівності — прохання, потім сліди, потім Атлас', () => {
    const g = created();
    const c = rewardCandidates(g);
    const min = Math.min(...c.map((x) => x.left));
    expect(nearestReward(g)?.left).toBe(min);
    const tie = withFlags(created(), [...traceFlags(TRACES).slice(1), nora.takenFlag, nora.t0, nora.t1]);   // henry 1, request 1
    expect(nearestReward(tie)?.kind).toBe('request');
  });
  it('усе зібрано (усі сліди, усі наклейки сторінки) — null, а не вигадана нагорода', () => {
    const g = { ...withFlags(created(), traceFlags(TRACES)), stickers: [...ATLAS_PAGES.flatMap((p) => p.stickers)].sort() };
    expect(nearestReward(g)).toBeNull();
  });
  it('МУТАЦІЯ: сторож «ніколи не найдальша й завжди ≥ 1» червоніє на мутанті', () => {
    const g = withFlags(created(), [nora.takenFlag, nora.t0, nora.t1]);
    const guard = (pick: (c: NearestReward[]) => NearestReward | undefined): boolean => {
      const c = rewardCandidates(g);
      const p = pick(c);
      return p !== undefined && p.left === Math.min(...c.map((x) => x.left)) && p.left >= 1;
    };
    expect(guard((c) => [...c].sort((a, b) => a.left - b.left)[0])).toBe(true);     // справжній вибір — зелений
    expect(guard((c) => [...c].sort((a, b) => b.left - a.left)[0])).toBe(false);    // мутант «найдальша» — червоний
    expect(guard((c) => c.map((x) => ({ ...x, left: 0 }))[0])).toBe(false);          // мутант «нагорода без кроків» — червоний
  });
  it('отримане прохання (done) нагородою не пропонується', () => {
    const g = withFlags(created(), [requestFlag(nora.id, 'taken'), ...nora.targets.map((t) => t.flag), nora.doneFlag]);
    expect(rewardCandidates(g).some((c) => c.kind === 'request' && c.labelKey === nora.trackKey)).toBe(false);
  });
});

describe('цілі журналу та тизер «Завтра…»', () => {
  it('на старті: головна + нагорода близько → щонайменше 2, не більше 4; кожен ключ має текст', () => {
    const goals = openGoals(created(), STORY);
    expect(goals.length).toBeGreaterThanOrEqual(2);
    expect(goals.length).toBeLessThanOrEqual(4);
    expect(goals.map((g) => g.kind)).toEqual(expect.arrayContaining(['main', 'reward']));
  });
  it('прохання в роботі — побічна ціль між головною й нагородою', () => {
    const g = withFlags(created(), [nora.takenFlag]);
    expect(openGoals(g, STORY).map((x) => x.kind)).toEqual(['main', 'side', 'reward']);
  });
  it('тизер: кожен день розділу, після якого є продовження, має рядок uk+en; кінець розділу — без тизера', () => {
    const ends = [...new Set(Object.entries(STORY.quests).filter(([id, q]) => isCh1Quest(id) && (q.dayEnd === true || q.end)).map(([id]) => id))];
    expect(ends.length).toBeGreaterThanOrEqual(3);
    // дні 1…(N-1) мають тизер; останній день — кінець розділу (end) — ні.
    for (let d = 1; d < ends.length; d++) {
      const k = tomorrowKeyOf(d);
      expect(k, `день ${d}`).not.toBeNull();
      expect((uk as Record<string, string>)[k as string]?.length).toBeGreaterThan(5);
      expect((en as Record<string, string>)[k as string]?.length).toBeGreaterThan(5);
      expect(((uk as Record<string, string>)[k as string] ?? '').length, 'коротко').toBeLessThanOrEqual(90);
    }
    expect(tomorrowKeyOf(ends.length)).toBeNull();
    expect(daysEnded({ journal: [] }, GAME_DEFS)).toBe(0);
  });
});
