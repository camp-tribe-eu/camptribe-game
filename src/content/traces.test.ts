// GAME-215 · сліди дідуся Генрі: дані content/traces.json ↔ ядро й Атлас. Валідатор доводить «кожен слід досяжний, з нагородою, 3–5 на регіон,
// листівка за всі»; тут друга половина — що ядро справді ставить прапорець на дотик, видає XP раз, видає листівку лише за всі, а сторінка
// «Шлях Генрі» читає саме ці прапорці. Закон 1: у кінці — контролі, на яких перевірка червоніє (слід без нагороди, листівка за частину).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { grantStickers, stickerHolds } from '../core/stickers';
import { GAME_DEFS } from './slice-defs';
import { STICKER_DEFS } from './stickers';
import { STORY } from './story';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';
import { compileTraces, henryPage, liveTraceSpot, TRACE_KINDS, TRACE_MAX, TRACE_MIN, traceFlag, traceInteractions, traceRewards, TRACES } from './traces';
import { liveSpot } from './director';
import { isAutoSpot } from '../view/world/proximity';
import flags from '../../content/flags.json';
import tracesJson from '../../content/traces.json';
import { TRACE_MAX as V_MAX, TRACE_MIN as V_MIN } from '../../scripts/validator/codes.mjs';

const RAW = import.meta.glob<string>('../../public/maps/*.tmj', { query: '?raw', import: 'default', eager: true });
const mapSpots = (): Set<string> => {
  const out = new Set<string>();
  for (const raw of Object.values(RAW)) for (const l of (JSON.parse(raw) as { layers: { objects?: { name: string }[] }[] }).layers) for (const o of l.objects ?? []) out.add(o.name);
  return out;
};
const created = (): SimState => PROLOGUE_BIKE.slice(0, PROLOGUE_BIKE.findIndex((i) => i.kind === 'command') + 1).reduce((s, i) => step(s, i, { defs: GAME_DEFS }), newSim(SEED, START_MONEY));
const POSTCARD = 'sticker.henry-postcard';

describe('GAME-215 · сліди дідуся: дані', () => {
  it('слідів є що перевіряти; межі 3–5 на регіон — ті самі, що у валідатора', () => {
    expect(TRACES.length).toBeGreaterThanOrEqual(TRACE_MIN * 3);
    expect([TRACE_MIN, TRACE_MAX]).toEqual([V_MIN, V_MAX]);
    const perRegion = new Map<string, number>();
    for (const t of TRACES) perRegion.set(t.location, (perRegion.get(t.location) ?? 0) + 1);
    for (const [loc, n] of perRegion) { expect(n, loc).toBeGreaterThanOrEqual(TRACE_MIN); expect(n, loc).toBeLessThanOrEqual(TRACE_MAX); }
    expect(new Set(TRACES.map((t) => t.kind))).toEqual(new Set(TRACE_KINDS));   // усі п'ять видів із картки присутні
  });
  it('кожна позначка — об’єкт мапи, автоспрацьовує від наближення й має рядок реєстру kind: interaction; людина — звичайний bool', () => {
    const spots = mapSpots();
    for (const t of TRACES) {
      const row = flags.find((f) => f.id === t.flag) as { kind?: string } | undefined;
      expect(row, t.flag).toBeDefined();
      if (t.kind === 'person') { expect(t.spot).toBeUndefined(); expect(row?.kind).toBeUndefined(); continue; }
      expect(t.spot, t.id).toBe(t.id);
      expect(spots.has(t.spot as string), `${t.spot} на мапі`).toBe(true);
      // GAME-209: старий ящик — єдиний слід, що відкривається явно (E/●), а не наближенням; решта — автоспрацьовує.
      expect(isAutoSpot(t.spot as string), `${t.spot}: автоспрацьовує лише не-ящик`).toBe(t.spot !== 'trace.camp-crate');
      expect(row?.kind).toBe('interaction');
      expect(GAME_DEFS.interactions[t.spot as string]?.flags).toEqual([t.flag]);
    }
  });
  it('більшість слідів — 1978, головна нитка — свіжа (без року): дата на листівці каже, що є що', () => {
    const old = TRACES.filter((t) => t.year === 1978).length;
    const fresh = TRACES.filter((t) => t.year === undefined).length;
    expect(fresh).toBeGreaterThanOrEqual(1);
    expect(old).toBeGreaterThan(fresh);
  });
  it('листівка: наклейка з умовою all на КОЖЕН слід; сюжет: нагороди слідів у гачку ядра', () => {
    const cond = STICKER_DEFS[POSTCARD]?.cond as { all?: { flag?: string }[] } | undefined;
    expect(cond?.all?.map((x) => x.flag).sort()).toEqual(TRACES.map((t) => t.flag).sort());
    for (const r of traceRewards()) expect(STORY.requestRewards).toContainEqual(r);
    for (const t of TRACES) expect(STORY.requestFlags).toContain(t.flag);   // косметичні для перебору
  });
});

describe('GAME-215 · сліди дідуся: ядро', () => {
  const spotTrace = TRACES.find((t) => t.location === 'loc.home' && t.spot !== undefined);
  if (!spotTrace?.spot) throw new Error('у дому немає позначки сліду — тест нічого не доводить');
  const SPOT = spotTrace.spot;
  it('дотик до позначки: прапорець, +XP раз; повторний дотик — відмова ядра й без XP', () => {
    const g = created().game;
    expect(liveSpot(created(), SPOT, GAME_DEFS)).toBe(true);
    const r1 = dispatch(g, { type: 'Interact', commandId: 'tr1', targetId: SPOT }, GAME_DEFS);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.flags).toContain(spotTrace.flag);
    expect((r1.state.progress?.xp ?? 0) - (g.progress?.xp ?? 0)).toBe(spotTrace.reward.xp);
    expect(liveTraceSpot(r1.state, SPOT)).toBe(false);   // позначка зникла
    const r2 = dispatch(r1.state, { type: 'Interact', commandId: 'tr2', targetId: SPOT }, GAME_DEFS);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('GRANT_ALREADY_GIVEN');
  });
  it('позначка жива лише у своєму регіоні, без розмови й поки не знайдено', () => {
    const g = created().game;
    expect(liveTraceSpot(g, SPOT)).toBe(true);
    expect(liveTraceSpot({ ...g, dialogue: { dialogueId: 'dlg.x', nodeId: 'a' } as never }, SPOT)).toBe(false);
    expect(liveTraceSpot({ ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: 'loc.road' } }, SPOT)).toBe(false);
    expect(liveTraceSpot({ ...g, flags: [...g.flags, spotTrace.flag] }, SPOT)).toBe(false);
    expect(liveTraceSpot(g, 'obj.litter')).toBe(false);   // не слід
  });
  it('сторінка «Шлях Генрі»: знайдене рахується; листівку ядро видає лише за ВСІ сліди (за всі, крім одного, — ні)', () => {
    const g = created().game;
    const none = henryPage(g.flags);
    expect(none.found).toBe(0); expect(none.total).toBe(TRACES.length); expect(none.postcard).toBe(false);
    const allButOne = TRACES.slice(1).map((t) => t.flag);
    const almost = { ...g, flags: [...g.flags, ...allButOne].sort() };
    expect(henryPage(almost.flags).found).toBe(TRACES.length - 1);
    expect(henryPage(almost.flags).postcard).toBe(false);
    expect(grantStickers(almost.stickers, STICKER_DEFS, almost) ?? []).not.toContain(POSTCARD);
    const all = { ...almost, flags: [...almost.flags, (TRACES[0] as (typeof TRACES)[number]).flag].sort() };
    expect(henryPage(all.flags).postcard).toBe(true);
    expect(stickerHolds(STICKER_DEFS[POSTCARD]?.cond as never, all)).toBe(true);
    expect(grantStickers(all.stickers, STICKER_DEFS, all)).toContain(POSTCARD);
  });
});

describe('GAME-215 · контролі (закон 1)', () => {
  it('traceFlag — той самий формат, що в реєстрі й розмові Елізи', () => {
    expect(traceFlag('trace.camp-elise')).toBe('f.trace-camp-elise');
    expect(flags.some((f) => f.id === 'f.trace-camp-elise')).toBe(true);
  });
  it('слід без нагороди дав би 0 XP у гачку — саме це ловить валідатор TRACE_NO_REWARD', () => {
    const first = tracesJson[0] as unknown as Parameters<typeof compileTraces>[0][number];
    const broken = compileTraces([{ ...first, reward: { xp: 0 } }]);
    expect(traceRewards(broken)[0]?.xp).toBe(0);
    expect(traceInteractions(broken)[tracesJson[0]?.spot as string]?.flags).toEqual([traceFlag(tracesJson[0]?.id as string)]);
  });
});
