// GAME-200 · «майже вийшло»: найближча досяжна нагорода й перелік відкритих цілей журналу. Чисті функції над станом і наявними системами
// (прохання сусідів GAME-180, сліди Генрі GAME-215, сторінка Атласу GAME-182/200) — свого стану й нових даних немає, лише читання.
// Нічого не карає й не відлічує часу (OD-022): це підказка «ще стільки до…», а не лічильник.
import { pageFill } from '../core/atlas-fill';
import type { GameState } from '../core/state';
import { stickersOf } from '../core/stickers';
import { REQUESTS, requestStatus, type RequestDef } from './requests';
import { ATLAS_PAGES } from './stickers';
import { TRACES, henryPage, type TraceDef } from './traces';

export type RewardKind = 'request' | 'henry' | 'atlas';
export interface NearestReward {
  readonly kind: RewardKind;
  /** Скільки кроків лишилось (≥ 1): ціль прохання, слід чи наклейка. */
  readonly left: number;
  /** Підпис нагороди: ключ контенту (`ui: false`, прохання) або ключ інтерфейсу (`ui: true`). */
  readonly labelKey: string;
  readonly ui: boolean;
}

const PRIORITY: Readonly<Record<RewardKind, number>> = { request: 0, henry: 1, atlas: 2 };

/** Усі досяжні нагороди: прохання в роботі (лишилось цілей, зроблено все — 1: повернутись), сліди до листівки, наклейки до повної сторінки. */
export function rewardCandidates(g: GameState, rs: readonly RequestDef[] = REQUESTS, ts: readonly TraceDef[] = TRACES, pages = ATLAS_PAGES): NearestReward[] {
  const out: NearestReward[] = [];
  for (const r of rs) {
    const s = requestStatus(g.flags, r, rs);
    if (s === 'ready') out.push({ kind: 'request', left: 1, labelKey: r.trackKey, ui: false });
    else if (s === 'active') out.push({ kind: 'request', left: r.targets.filter((t) => !g.flags.includes(t.flag)).length, labelKey: r.trackKey, ui: false });
  }
  const h = henryPage(g.flags, ts);
  if (h.total > 0 && !h.postcard) out.push({ kind: 'henry', left: h.total - h.found, labelKey: 'rw.henry', ui: true });
  const have = stickersOf(g);
  for (const p of pages) {
    const f = pageFill(have, p.stickers);
    if (f.total > 0 && f.have < f.total) out.push({ kind: 'atlas', left: f.total - f.have, labelKey: 'rw.atlas', ui: true });
  }
  return out.filter((c) => c.left >= 1);
}

/** Найближча: найменше «ще N»; за рівності — прохання, потім сліди, потім Атлас (стабільно, без випадку). null — усе зібрано або гри ще немає. */
export function nearestReward(g: GameState, rs?: readonly RequestDef[], ts?: readonly TraceDef[], pages?: typeof ATLAS_PAGES): NearestReward | null {
  if (!g.player) return null;
  const c = rewardCandidates(g, rs, ts, pages);
  c.sort((a, b) => a.left - b.left || PRIORITY[a.kind] - PRIORITY[b.kind]);
  return c[0] ?? null;
}
