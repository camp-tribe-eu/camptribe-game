// GAME-230 · подарунок мешканцю: що бачить і чує гравець. ЛИШЕ відображення (ядро знає реакцію й очки, src/core/friendship.ts).
// Усе покадрово — лічильник кадрів гри, жодних твінів, таймерів, Date і випадковості (сторож no-realtime у gift-fx.test.ts).
//  * реакція → значок над головою мешканця (♥ — «подобається»; «…» — нейтрально чи не до смаку; хмарки-«кепсько» гра не малює: дарунок ніколи не ображає) і звук;
//  * поза героя: кадри листа thrust (руки витягнуті з подарунком), рівно GIFT_POSE_FRAMES кадрів, далі герой стоїть як звичайно.
import type { GiftReaction } from '../../core/friendship';
import type { CampSoundName } from '../../audio/camp-sounds';
import type { Emote } from './neighbours';

/** Скільки кадрів гри тримається поза «вручаю подарунок». */
export const GIFT_POSE_FRAMES = 30;
/** Кадри листа thrust (стовпці 0…7): рука тягнеться (1), тримає подарунок (2), повертається (1). Порядок — за межами кадру age. */
export const POSE_COLUMNS: readonly number[] = [1, 2, 1];

export const giftEmote = (r: GiftReaction): Emote => (r === 'liked' ? 'heart' : 'dots');
/** Дзвіночок — коли подобається; глухий «тьох» — решта (синтез у src/audio/camp-sounds.ts). */
export const giftSound = (r: GiftReaction): CampSoundName => (r === 'liked' ? 'bell' : 'dull');

/** Поза героя на кадрі `age` (0…): стовпець листа thrust або null, коли поза скінчилась (або ще не починалась). */
export function poseColumn(age: number): number | null {
  if (age < 0 || age >= GIFT_POSE_FRAMES) return null;
  const third = GIFT_POSE_FRAMES / POSE_COLUMNS.length;
  return POSE_COLUMNS[Math.min(POSE_COLUMNS.length - 1, Math.floor(age / third))] ?? null;
}
/** Наступний кадр пози: -1 — поза скінчилась. */
export const nextPoseAge = (age: number): number => (age < 0 || age + 1 >= GIFT_POSE_FRAMES ? -1 : age + 1);
