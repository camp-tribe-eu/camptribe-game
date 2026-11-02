// GAME-215 · «Сліди Генрі»: позначки олівцем дідуся на мапах регіонів (content/traces.json). Слід — не квест: його стан — один прапорець
//   f.trace-<назва>  знайдено: дотик до позначки на мапі (Interact → traceInteractions, slice-defs) або, для «людини, що пам'ятає», вибір у розмові з NPC.
// Усе необов'язкове: сюжет від слідів не залежить (валідатор TRACE_GATES_QUEST), позначка живе, поки слід не знайдено. Нагорода (XP) — як у прохань
// GAME-180: з'явився прапорець → ядро видає `rw.<слід>` раз (StoryDefs.requestRewards, src/content/story.ts). За всі сліди — наклейка-листівка
// (content/stickers.json, умова all на кожен прапорець; валідатор TRACE_POSTCARD_MISSING). Чисті функції без Phaser: сцена й Атлас лише читають.
import tracesRaw from '../../content/traces.json';
import type { InteractionDef } from '../core/defs';
import type { GameState } from '../core/state';

export const TRACE_KINDS = ['cache', 'person', 'inscription', 'riddle', 'gift'] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

export interface TraceDef {
  readonly id: string; readonly kind: TraceKind; readonly location: string; readonly spot?: string; readonly npc?: string;
  readonly nameKey: string; readonly textKey: string;
  /** Рік сліду (1978 — старі); немає — свіжий слід цієї осені: головна нитка. Дата на листівці каже, що є що (картка власника). */
  readonly year?: number;
  readonly reward: { readonly xp: number };
  readonly flag: string;
}
interface RawTrace { id: string; kind: TraceKind; location: string; spot?: string; npc?: string; nameKey: string; textKey: string; year?: number; reward: { xp: number } }

/** Слідів на регіон (картка власника 31.10: 3–5). Дзеркало TRACE_MIN/TRACE_MAX валідатора (scripts/validator/codes.mjs); рівність стереже traces.test.ts. */
export const TRACE_MIN = 3;
export const TRACE_MAX = 5;

/** Прапорець сліду: `trace.home-bench` → `f.trace-home-bench` (той самий формат у реєстрі, розмовах і валідаторі). */
export const traceFlag = (id: string): string => `f.${id.replace(/\./g, '-')}`;
/** Усі прапорці слідів починаються так: вони косметичні для сюжету (повний перебір їх не розрізняє, moves.ts exploreView). */
export const TRACE_FLAG_PREFIX = 'f.trace-';
export const TRACE_SPOT_PREFIX = 'trace.';

export const compileTraces = (raw: readonly RawTrace[]): TraceDef[] => raw.map((t) => ({ ...t, flag: traceFlag(t.id) }));
export const TRACES: readonly TraceDef[] = compileTraces(tracesRaw as RawTrace[]);

export const traceFlags = (ts: readonly TraceDef[] = TRACES): string[] => ts.map((t) => t.flag);

/** Взаємодія ядра для позначки на мапі: дотик ставить прапорець сліду; нагорода «0 центів», разова за grantId (повторний дотик — відмова ядра). */
export function traceInteractions(ts: readonly TraceDef[] = TRACES): Record<string, InteractionDef> {
  return Object.fromEntries(ts.filter((t) => t.spot !== undefined).map((t) => [t.spot as string, { grantId: `rw.${t.id.replace(/\./g, '-')}`, moneyCents: 0, flags: [t.flag] }] as const));
}

/** Нагороди слідів для ядра (той самий гачок, що в прохань GAME-180/181): з'явився прапорець → XP раз за ключ. */
export const traceRewards = (ts: readonly TraceDef[] = TRACES): { flag: string; key: string; xp: number; om: number; skills: string[] }[] =>
  ts.map((t) => ({ flag: t.flag, key: `rw.${t.id.replace(/\./g, '-')}`, xp: t.reward.xp, om: 0, skills: [] }));

export const isTraceSpot = (name: string, ts: readonly TraceDef[] = TRACES): boolean => ts.some((t) => t.spot === name);
export const traceOfSpot = (name: string, ts: readonly TraceDef[] = TRACES): TraceDef | undefined => ts.find((t) => t.spot === name);

/** Позначка на мапі живе, поки слід не знайдено, гравець у регіоні сліду й розмови немає (під час розмови світ мовчить, як усі об'єкти). */
export function liveTraceSpot(g: GameState, name: string, ts: readonly TraceDef[] = TRACES): boolean {
  const t = traceOfSpot(name, ts);
  return t !== undefined && g.player?.locationId === t.location && g.dialogue === null && !g.flags.includes(t.flag);
}

/** Сторінка Атласу «Шлях Генрі»: кожен слід за регіоном, знайдений чи ні, рік або «свіжий»; листівка — коли знайдено всі. */
export interface TraceRow { readonly id: string; readonly kind: TraceKind; readonly location: string; readonly nameKey: string; readonly textKey: string; readonly year: number | null; readonly found: boolean }
export interface HenryPage { readonly traces: readonly TraceRow[]; readonly found: number; readonly total: number; readonly postcard: boolean }
export function henryPage(flags: readonly string[], ts: readonly TraceDef[] = TRACES): HenryPage {
  const traces = ts.map((t) => ({ id: t.id, kind: t.kind, location: t.location, nameKey: t.nameKey, textKey: t.textKey, year: t.year ?? null, found: flags.includes(t.flag) }));
  const found = traces.filter((t) => t.found).length;
  return { traces, found, total: traces.length, postcard: traces.length > 0 && found === traces.length };
}
