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
