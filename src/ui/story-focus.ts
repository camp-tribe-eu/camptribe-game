// GAME-280 · Коли екран подорожі повертає фокус на рядок стану (GAME-80: після дії кнопки перебудовуються, і повторне натискання влучало б у нову першу).
// Ключ — лише те, що на екрані можна натиснути чи прочитати як репліку. Новий знімок offer із тим самим ключем (port.onStory після кроку сцени, нової хвилини,
// об'єкта поруч — port.story() щоразу дає новий об'єкт) фокусу НЕ чіпає: інакше він зіскакував із кнопки між її вибором і Enter, і натискання йшло
// в порожнє місце (CI 42414046498: «затиснутий Enter», журнал 0). Час, погода, гроші, цілі — не в ключі: вони не змінюють, що натискати.
import type { OfferAction, StoryOffer } from './story-types';

export type FocusOffer = Pick<StoryOffer, 'stage' | 'locationKey' | 'characters' | 'actions' | 'locked' | 'dialogue' | 'packing'>;

const ids = (a: readonly OfferAction[] | undefined): string => (a ?? []).map((x) => `${x.kind}:${x.key ?? ''}:${x.id}:${x.shortCents ?? ''}`).join(',');

export function offerFocusKey(o: FocusOffer): string {
  const d = o.dialogue;
  const p = o.packing;
  return [
    o.stage,
    o.locationKey ?? '',
    o.characters.map((c) => c.id).join(','),
    ids(o.actions),
    ids(o.locked),
    d ? `${d.speakerId ?? ''}/${d.key ?? ''}/${d.ui ? 'ui' : ''}/${d.request ? 'req' : ''}/${ids(d.answers)}/${ids(d.gifts)}` : '-',
    p ? `${p.load?.id ?? ''}/${p.overflow.map((x) => x.key).join(',')}/${p.groups.map((g) => g.items.map((i) => `${i.key}${i.state}`).join(',')).join(';')}` : '-',
  ].join('|');
}

/**
 * GAME-320 · зразковий день, табір: ☰ не пропонує стрибків часу (дорога, сон, очікування — вони перегортали день до ночі) і не показує цілей та квестів старої гри розділу 1.
 * Пауза, налаштування, збереження й розмови лишаються.
 */
export const SAMPLE_CAMP_LOCATION = 'loc.camp.lake';
const SAMPLE_CAMP_HIDDEN: readonly OfferAction['kind'][] = ['visit', 'sleep', 'wait', 'rest'];
/** Стрибки часу, які ядро в зразковому дні відхиляє за північ, — не показуємо в жодній локації (дорога лишається: вона доводить до 23:30 і не блокує). */
const SAMPLE_SKIPS: readonly OfferAction['kind'][] = ['sleep', 'wait', 'rest'];
export const sampleActions = (actions: readonly OfferAction[], sample: boolean): readonly OfferAction[] => (sample ? actions.filter((a) => !SAMPLE_SKIPS.includes(a.kind)) : actions);
export const inSampleCamp = (sample: boolean, locationKey: string | null): boolean => sample && locationKey === SAMPLE_CAMP_LOCATION;
export const sampleMenuActions = (actions: readonly OfferAction[], sampleCamp: boolean, sampleRoad = false): readonly OfferAction[] =>
  (sampleCamp ? actions.filter((a) => !SAMPLE_CAMP_HIDDEN.includes(a.kind)) : sampleRoad ? actions.filter((a) => !SAMPLE_ROAD_HIDDEN.includes(a.kind) && !(a.kind === 'visit' && a.key !== SAMPLE_CAMP_LOCATION)) : actions);

/**
 * GAME-349 · зразковий день, зупинка на дорозі (після міні-гри чи пропуску): ☰ показує лише наступний справжній крок — «Завершити: У дорогу».
 * «Піти: Дім/Крамниця» (у табір — лишається, це крок після «Завершити») і «Висушити: …» тут нічого не ведуть (день уже в дорозі), а «Зробити» старої хвилі розділу 1 («Поправити багаж», «Звірити маршрут»)
 * після пропуску дороги ставало рекомендованою дією й відсувало «Завершити» на п'яте місце (у ландшафті — під згин). «Завершити» закриває ці справи саме.
 */
export const SAMPLE_ROAD_LOCATION = 'loc.road';
const SAMPLE_ROAD_HIDDEN: readonly OfferAction['kind'][] = ['dry', 'task'];   // «Піти» — окремо: лишається лише в табір (єдиний шлях далі)
export const inSampleRoad = (sample: boolean, locationKey: string | null): boolean => sample && locationKey === SAMPLE_ROAD_LOCATION;

/** GAME-325 · зразковий день: підказка «Відкрий ☰, щоб почати» — поки день не почався (етап create), а не лише поки не вперше відкрито ☰ (прапор hintSeen переживає перезавантаження й «Почати знову»). */
export const startHintOn = (sample: boolean, hintSeen: boolean): boolean => sample || !hintSeen;
/** GAME-325 · зразковий день: ☰ без списку-довідки (звання, навички, речі) — «Що робити» лежить угорі, а не на 900–2600 px під згином. Компактна панель (мапа-перша) і так коротка. */
export const sampleActionsFirst = (sample: boolean, compact: boolean): boolean => sample && !compact;

/**
 * GAME-326 · зразковий день: ОДНА рекомендована дія. Порядок «що веде день»: завершити квест-ціль (offer.goal) → завершити будь-який →
 * взяти НЕОБХІДНЕ (намет, спальник; ліхтар — за бажанням) → розрахуватись → піти в дорогу чи табір → піти будь-куди. «Висушити» й «Поговорити» — ніколи.
 */
const MUST = ['item.tent', 'item.sleeping-bag'];
const FWD = ['loc.road', 'loc.camp.lake'];
const NO = 9;
const rank = (a: OfferAction, goal: string | null): number =>
  a.kind === 'task' ? -1 : a.kind === 'complete' ? (a.key === goal ? 0 : 1) : a.kind === 'pickup' ? (MUST.includes(a.key ?? '') ? 2 : NO) : a.kind === 'checkout' ? 3 : a.kind === 'visit' ? (FWD.includes(a.key ?? '') ? 4 : 5) : NO;
/** GAME-327 · «Зробити» (дрібні справи квесту) — першими, поки лишаються: «Завершити» мовчки закриває їх усі разом. */
/** GAME-327 · у таборі зразка рекомендація — «Дошка табору», коли жодна дія списку нічого кращого не веде. */
export const boardRec = (sampleCamp: boolean, rec: OfferAction | undefined): boolean => sampleCamp && rec === undefined;
export const nextAction = (acts: readonly OfferAction[], goal: string | null): OfferAction | undefined => {
  const best = [...acts].sort((x, y) => rank(x, goal) - rank(y, goal))[0];
  return best && rank(best, goal) < NO ? best : undefined;
};
