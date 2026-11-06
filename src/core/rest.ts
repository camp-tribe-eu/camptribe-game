// Сон і години крамниці (GAME-242). Чисті правила від стану гри й ігрових хвилин: UI, бот і ядро питають одне й те саме місце.
import { isEveningOrNight, isNight, nextAt, shopOpen, SHOP_OPEN, WAKE, WAKE_LATE } from './clock';
import type { GameState } from './state';

/** Крамниця, що має години (одна на гру). Інші місця з товаром (дрова в таборі) — не крамниці. */
export const SHOP_LOCATION = 'loc.shop';
/** Прапорець «намет поставлено» (ставить ST-005). */
export const TENT_FLAG = 'f.night-tent';
/** Дім і табір: де є ліжко чи намет. */
export const HOME_LOCATION = 'loc.home';

/** Де спить родина: ліжко вдома, намет у таборі, або «де застала ніч» (після «пора спати»). null — спати тут не можна. */
export type SleepPlace = 'bed' | 'tent' | 'late';
export function sleepPlace(g: Pick<GameState, 'player' | 'flags'> & { readonly campaignEnded?: boolean }, now: number): SleepPlace | null {
  if (!g.player) return null;
  const at = g.player.locationId ?? '';
  if (isNight(now)) return at === HOME_LOCATION ? 'bed' : g.flags.includes(TENT_FLAG) && at.startsWith('loc.camp.') ? 'tent' : 'late';
  // GAME-264: розділ закінчено вдома — ліжко чекає в будь-яку годину (story.chapterEndSleep): гравець прийшов серед дня, а далі лише сон і тизер.
  if (g.campaignEnded === true && at === HOME_LOCATION) return 'bed';
  if (!isEveningOrNight(now)) return null;
  if (at === HOME_LOCATION) return 'bed';
  return g.flags.includes(TENT_FLAG) && at.startsWith('loc.camp.') ? 'tent' : null;
}
export const canSleep = (g: Pick<GameState, 'player' | 'flags'>, now: number): boolean => sleepPlace(g, now) !== null;

/** Ігрова хвилина пробудження: 07:00 після свідомого сну, 07:30 після того, як герой заснув сам. */
export const wakeMinute = (now: number, auto: boolean): number => nextAt(now, auto ? WAKE_LATE : WAKE);
/** Скільки хвилин чекати відчинення крамниці (0 — відчинена). */
export const minutesToOpen = (now: number): number => (shopOpen(now) ? 0 : nextAt(now, SHOP_OPEN) - now);
/** Крамниця зачинена саме зараз і саме тут. */
export const shopClosedHere = (g: Pick<GameState, 'player'>, now: number): boolean => g.player?.locationId === SHOP_LOCATION && !shopOpen(now);
