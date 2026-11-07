// GAME-247 · «Нагорода видна одразу»: компактна наклейка в куті HUD після кожної справи («+5 € · +15 XP · +3 Природа»).
// ЧИСТА модель: що саме виросло — виводиться з ядра (XP/ОМ прогресу, XP навичок, нові grantId → їхні moneyCents), нічого не вигадується.
// GAME-229 прибрав цифри над героєм, але OD-029 (07.11.2026, «давай як у Stardew») повернув їх для наклейки нагороди: вона — маленький спливаючий підпис НАД головою героя
// (stickerPlace: над маркерами «!»/«…», не на спрайті), іде в черзі банерів (banner-queue.ts) — не лягає на рамку розмови, — а кілька нагород однієї дії зливаються (mergeSums).
import type { CoreDefs } from '../core/defs';

export interface RewardSum {
  readonly cents: number;
  readonly xp: number;
  readonly om: number;
  /** skillId → приріст XP навички (>0). */
  readonly skills: Readonly<Record<string, number>>;
}
export const NO_REWARD: RewardSum = { cents: 0, xp: 0, om: 0, skills: {} };
/** Життя наклейки в ІГРОВИХ хвилинах (≈ секунд гри); годинник на екранах стоїть — реальних таймерів немає. */
export const STICKER_MIN = 5;

/** Рядок контенту (events.json / quests.json) із грошима: `money` — центи. */
export interface RawRewardRow { readonly reward?: { readonly grantId: string; readonly money?: number } }
/**
 * GAME-277 · grantId → moneyCents з УСІХ місць, звідки нагорода з грошима потрапляє в стан: взаємодії (у т.ч. лагодження лавки й побічні), нагороди квестів, рядки подій контенту.
 * Одна чиста функція — наклейка (main.ts) і сторож (reward-sticker.test.ts) беруть суми лише звідси.
 */
export function grantCentsMap(defs: Pick<CoreDefs, 'interactions' | 'story'>, events: readonly RawRewardRow[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of Object.values(defs.interactions)) out[d.grantId] = d.moneyCents;
  for (const q of Object.values(defs.story?.quests ?? {})) if (q.reward) out[q.reward.grantId] = q.reward.moneyCents;
  for (const e of events) if (e.reward) out[e.reward.grantId] = e.reward.money ?? 0;
  return out;
}

/** GAME-277 · наклейка, що не встигла з'явитись, поки годинник перестрибнув (сон, кінець дня), відлічує життя від першого показу, а не від нагороди. */
export function stickerAt(s: { readonly at: number; readonly seen: boolean }, nowAbs: number): number {
  return !s.seen && nowAbs - s.at >= STICKER_MIN ? nowAbs : s.at;
}
/** Чи наклейка жива в цю ігрову хвилину (at — вже після stickerAt). */
export const stickerLive = (at: number, nowAbs: number): boolean => nowAbs - at >= 0 && nowAbs - at < STICKER_MIN;

/** OD-029 · кадрів життя спливаючого підпису над героєм (≈ 4 с гри): перші 160 — повний, далі згасає; підйом — до RISE_PX. Лише лічильник кадрів, таймерів нема. */
export const POP_FRAMES = 240;
const POP_FADE_FROM = 160;
const RISE_PX = 18;
/** Проміжок між головою героя й низом підпису: лишає місце «!»/«…» над головою. */
export const POP_GAP_PX = 40;
export interface PopPlace { readonly left: number; readonly top: number; readonly opacity: number }
/**
 * Де стоїть підпис (CSS px): по центру над головою героя, низ — на POP_GAP_PX вище верху спрайта й піднімається з віком; у межах екрана.
 * `topInset` — низ шапки: підпис не лізе під неї (герой на камері посередині, тож вище голови місця досить).
 */
export function stickerPlace(o: { heroX: number; heroTop: number; w: number; h: number; vw: number; age: number; topInset: number }): PopPlace {
  const k = Math.min(1, Math.max(0, o.age / POP_FRAMES));
  const rise = RISE_PX * Math.min(1, o.age / 60);
  const left = Math.min(Math.max(4, o.heroX - o.w / 2), Math.max(4, o.vw - o.w - 4));
  const top = Math.max(o.topInset, o.heroTop - POP_GAP_PX - rise - o.h);
  const opacity = o.age <= POP_FADE_FROM ? 1 : Math.max(0, 1 - (o.age - POP_FADE_FROM) / (POP_FRAMES - POP_FADE_FROM));
  return { left, top, opacity: k >= 1 ? 0 : opacity };
}

export interface CoreSnap {
  readonly xp: number;
  readonly om: number;
  readonly skills: Readonly<Record<string, number>>;
  readonly grants: readonly string[];
}

/** Приріст між двома знімками ядра. grantCents: grantId → moneyCents з визначень (взаємодії й нагороди квестів). Зменшення — не нагорода. */
export function rewardDelta(prev: CoreSnap, next: CoreSnap, grantCents: Readonly<Record<string, number>>): RewardSum {
  const seen = new Set(prev.grants);
  let cents = 0;
  for (const g of next.grants) if (!seen.has(g)) cents += grantCents[g] ?? 0;
  const skills: Record<string, number> = {};
  for (const [id, xp] of Object.entries(next.skills)) { const d = xp - (prev.skills[id] ?? 0); if (d > 0) skills[id] = d; }
  return { cents, xp: Math.max(0, next.xp - prev.xp), om: Math.max(0, next.om - prev.om), skills };
}

export const isEmptySum = (s: RewardSum): boolean => s.cents === 0 && s.xp === 0 && s.om === 0 && Object.keys(s.skills).length === 0;

export function mergeSums(a: RewardSum, b: RewardSum): RewardSum {
  const skills: Record<string, number> = { ...a.skills };
  for (const [id, v] of Object.entries(b.skills)) skills[id] = (skills[id] ?? 0) + v;
  return { cents: a.cents + b.cents, xp: a.xp + b.xp, om: a.om + b.om, skills };
}

export interface StickerPart { readonly kind: 'cents' | 'xp' | 'om' | 'skill'; readonly text: string; readonly skill?: string }
/** «+5 €», «+2,5 €». Стільки цілих євро, скільки є; копійки — лише коли вони є. */
export const euros = (cents: number): string => { const e = cents / 100; return Number.isInteger(e) ? String(e) : e.toFixed(2).replace('.', ','); };

/** Частини наклейки у стабільному порядку: €, XP, ОМ, навички (за зменшенням приросту, потім за id) — не більше трьох навичок. */
export function stickerParts(s: RewardSum, label: { readonly xp: string; readonly om: string; readonly skill: (id: string) => string }): StickerPart[] {
  const out: StickerPart[] = [];
  if (s.cents > 0) out.push({ kind: 'cents', text: `+${euros(s.cents)} €` });
  if (s.xp > 0) out.push({ kind: 'xp', text: `+${s.xp} ${label.xp}` });
  if (s.om > 0) out.push({ kind: 'om', text: `+${s.om} ${label.om}` });
  const sk = Object.entries(s.skills).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  for (const [id, v] of sk) out.push({ kind: 'skill', text: `+${v} ${label.skill(id)}`, skill: id });
  return out;
}
