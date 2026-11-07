// GAME-247 · «Нагорода видна одразу»: компактна наклейка в куті HUD після кожної справи («+5 € · +15 XP · +3 Природа»).
// ЧИСТА модель: що саме виросло — виводиться з ядра (XP/ОМ прогресу, XP навичок, нові grantId → їхні moneyCents), нічого не вигадується.
// GAME-229 свідомо прибрав цифри НАД героєм (див. fx.headLabels), тому наклейка — у кутку HUD і йде в черзі банерів (banner-queue.ts):
// не лягає на рамку розмови, а кілька нагород однієї дії зливаються в одну наклейку (mergeSums), а не складаються стосом.
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
