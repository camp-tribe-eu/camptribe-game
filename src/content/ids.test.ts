// Звірка форматів id: кожен id і grantId із content/ мусить проходити перевірку ядра. Інакше ядро
// мовчки відкине справжній контент як INVALID_COMMAND (розбіжність знайдено при злитті GAME-35).
import { describe, expect, it } from 'vitest';
import events from '../../content/events.json';
import items from '../../content/items.json';
import locations from '../../content/locations.json';
import npcs from '../../content/npcs.json';
import quests from '../../content/quests.json';
import { CONTENT_ID, isContentId } from '../core/commands';
import { SLICE_DEFS } from './slice-defs';

const grantIds = [...quests, ...events].flatMap((x) => ('reward' in x && x.reward ? [x.reward.grantId] : []));
const ids = [...items, ...npcs, ...locations, ...events].map((x) => x.id);

describe('формат id: content/ ↔ ядро', () => {
  it('у контенті справді є id і нагороди (інакше звірка нічого не доводить)', () => {
    expect(ids.length).toBeGreaterThan(5);
    expect(grantIds.length).toBeGreaterThan(0);
  });
  it('кожен id контенту проходить перевірку ядра', () => {
    expect(ids.filter((id) => !isContentId(id))).toEqual([]);
  });
  it('кожен grantId контенту проходить перевірку ядра', () => {
    expect(grantIds.filter((id) => !isContentId(id))).toEqual([]);
  });
  it('каталог зрізу — у тому ж форматі', () => {
    const all = [...Object.keys(SLICE_DEFS.items), ...Object.keys(SLICE_DEFS.interactions), ...Object.values(SLICE_DEFS.interactions).map((d) => d.grantId)];
    expect(all.filter((id) => !CONTENT_ID.test(id))).toEqual([]);
  });
  it('негативний контроль: підкреслення відкидається, як і у валідаторі', () => {
    expect(isContentId('rw.campfire_warmth')).toBe(false);
    expect(isContentId('rw.campfire-warmth')).toBe(true);
  });
});
