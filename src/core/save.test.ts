// GAME-33 · формат сейву: вічні фікстури, коди відмов, повний цикл.
import { describe, expect, it } from 'vitest';
import v1 from '../../tests/saves/v1.json';
import v2 from '../../tests/saves/v2.json';
import { V2_STORY } from './save-v2.fixture';
import { STORY_DEFS } from './story.fixture';
import { DEFS, LOG, SEED } from './determinism.fixture';
import { stateHash } from './hash';
import type { StoryDefs } from './defs';
import { LOAD_CODES, SAVE_VERSION, danglingRefs, fromSave, serialize, type LoadCode } from './save';
import { newSim, run, type Input } from './sim';

/** Кожна випущена версія сейву — фікстура назавжди (TD-007). Нову версію додати сюди. */
const FIXTURES: Record<number, unknown> = { 1: v1, 2: v2 };

describe('вічні фікстури сейвів (TD-007)', () => {
  it('є фікстура для кожної версії від 1 до поточної', () => {
    for (let v = 1; v <= SAVE_VERSION; v++) expect(FIXTURES[v], `tests/saves/v${v}.json`).toBeDefined();
  });

  for (const [v, fixture] of Object.entries(FIXTURES)) {
    it(`фікстура v${v} завантажується в поточну версію без втрат`, () => {
      const r = fromSave(JSON.stringify(fixture));
      expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
      if (r.ok) {
        expect(r.fromVersion).toBe(Number(v));
        expect(r.sim.game.seq).toBeGreaterThan(0);
      }
    });
  }

  it('фікстура v1 — той самий стан, що й детермінований прогін (сейв нічого не губить)', () => {
    const live = run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS });
    const r = fromSave(JSON.stringify(v1));
    expect(r.ok && stateHash(r.sim)).toBe(stateHash(live));
  });
});

describe('v2 (GAME-29): персонаж і квести', () => {
  it('фікстура v2 — той самий стан, що й живий прогін із сюжетом', () => {
    const live = run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: STORY_DEFS });
    const r = fromSave(JSON.stringify(v2));
    expect(r.ok && stateHash(r.sim)).toBe(stateHash(live));
    expect(r.ok && Object.keys(r.sim.game.quests).length).toBe(3);   // фікстура справді несе квести
  });
  it('v1 після міграції: персонажа ще нема, квестів нема, розділ не завершено', () => {
    const r = fromSave(JSON.stringify(v1));
    expect(r.ok && { p: r.sim.game.player, q: r.sim.game.quests, e: r.sim.game.campaignEnded, v: r.sim.game.schemaVersion }).toEqual({ p: null, q: {}, e: false, v: 2 });
  });
});

describe('повний цикл', () => {
  it('serialize → fromSave → той самий відбиток; продовження після завантаження = без перерви', () => {
    const mid = run(newSim(SEED, 10_000), LOG.slice(0, 1500), { defs: DEFS });
    const r = fromSave(serialize(mid));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(stateHash(r.sim)).toBe(stateHash(mid));
    const whole = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    expect(stateHash(run(r.sim, LOG.slice(1500), { defs: DEFS }))).toBe(stateHash(whole));
  });
});

describe('коди відмов завантаження: кожен має зламаний приклад', () => {
  const good = JSON.parse(serialize(newSim(SEED, 10_000))) as Record<string, unknown> & { sim: { game: Record<string, unknown> } };
  const withSim = (patch: (s: typeof good) => void): string => { const c = structuredClone(good); patch(c); return JSON.stringify(c); };
  const resum = (c: typeof good): void => { c.checksum = stateHash(c.sim); };
  const cases: [LoadCode, string][] = [
    ['SAVE_PARSE', '{"format":"camplife-save", обрізано'],
    ['SAVE_FORMAT', JSON.stringify({ ...good, format: 'other-game' })],
    ['SAVE_VERSION_UNSUPPORTED', JSON.stringify({ ...good, schemaVersion: SAVE_VERSION + 1 })],
    ['SAVE_CHECKSUM', withSim((c) => { c.sim.game.moneyCents = 999_999_999; })],
    ['SAVE_SHAPE', withSim((c) => { c.sim.game.moneyCents = -5; resum(c); })],
    ['SAVE_CONTENT_MISMATCH', JSON.stringify(v2)],          // v2-фікстура записана на STORY_DEFS; проти «сюжету без q.side» — зникле посилання
  ];
  const story = STORY_DEFS.story as StoryDefs;
  const withoutQuest = (id: string): StoryDefs => ({ ...story, quests: Object.fromEntries(Object.entries(story.quests).filter(([k]) => k !== id)) });
  const OPTS: Partial<Record<LoadCode, { story: StoryDefs }>> = { SAVE_CONTENT_MISMATCH: { story: withoutQuest('q.side') } };

  it('кожен код реєстру покрито прикладом', () => {
    expect(cases.map(([c]) => c).sort()).toEqual([...LOAD_CODES].sort());
  });
  for (const [code, text] of cases) {
    it(`повертає ${code}`, () => {
      const r = fromSave(text, OPTS[code] ?? {});
      expect(r.ok ? 'ok' : r.code).toBe(code);
    });
  }
  it('позитивний контроль: щойно записаний сейв завантажується', () => {
    expect(fromSave(JSON.stringify(good)).ok).toBe(true);
  });
  // Рецензія GAME-33: форма елементів, не лише контейнерів (контрольну суму підробник перерахує сам).
  for (const [what, patch] of [
    ['grant не рядок', (c: typeof good) => { c.sim.game.grants = [42]; }],
    ['запис processed без fp', (c: typeof good) => { c.sim.game.processed = { c0: { ok: true } }; }],
    ['відмова в processed із кодом не з реєстру', (c: typeof good) => { c.sim.game.processed = { c0: { ok: false, fp: 'x', code: 42 } }; }],
    ['квест з невідомим статусом', (c: typeof good) => { c.sim.game.quests = { 'ST-001': { status: 'won', done: [] } }; }],
    ['персонаж без транспорту', (c: typeof good) => { c.sim.game.player = { profileId: 'profile.a', animalId: 'animal.none', locationId: null }; }],
    ['запис processed — null (без перевірки об\'єкта — виняток, а не код)', (c: typeof good) => { c.sim.game.processed = { c0: null }; }],
  ] as const) {
    it(`SAVE_SHAPE: ${what}`, () => {
      const r = fromSave(withSim((c) => { patch(c); resum(c); }));
      expect(r.ok ? 'ok' : r.code).toBe('SAVE_SHAPE');
    });
  }
  it('accountId у v1 завжди null (OD-008: без мережі)', () => {
    expect(good.accountId).toBeNull();
  });
});

describe('сейв проти нинішнього контенту (рецензія TL: сейв зі зниклим квестом застрягав назавжди)', () => {
  const story = STORY_DEFS.story as StoryDefs;
  const live = run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: STORY_DEFS });
  const json = serialize(live, 'rev-old');

  it('кожен вид зниклого посилання — названо', () => {
    const drop = <K extends keyof StoryDefs>(k: K, id: string): StoryDefs => ({ ...story, [k]: Object.fromEntries(Object.entries(story[k] as object).filter(([x]) => x !== id)) });
    expect(danglingRefs(live.game, drop('quests', 'q.mid'))).toEqual(['quest q.mid']);
    expect(danglingRefs(live.game, drop('profiles', 'profile.a'))).toEqual(['profile profile.a']);
    expect(danglingRefs(live.game, { ...story, transports: ['transport.car'] })).toEqual(['transport transport.bike']);
    expect(danglingRefs(live.game, drop('locations', 'loc.shop'))).toEqual(['location loc.shop']);
    expect(danglingRefs(live.game, story)).toEqual([]);
  });

  it('позитивний контроль: сумісне оновлення (новий квест, інший відбиток) сейв НЕ відкидає', () => {
    const grown: StoryDefs = { ...story, quests: { ...story.quests, 'q.new': { optional: true, end: false, objectives: [], transitions: [] } } };
    const r = fromSave(json, { story: grown });
    expect(r.ok && r.contentRev).toBe('rev-old');
  });

  it('без сюжету (як у вічних фікстурах) — перевірка посилань не виконується', () => {
    expect(fromSave(JSON.stringify(v2)).ok).toBe(true);
  });
});
