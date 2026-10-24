// GAME-115: реєстр прапорців (content/flags.json) ↔ ядро. Сімейства f.pack-* і f.seen-* породжує валідатор
// (FLAG_FAMILIES) і ставить ядро (packFlag, eventSeenFlag) — дві реалізації одного формату; погода в реєстрі —
// той самий перелік, що WEATHERS ядра. Розійдуться — реєстр збреше, і тут почервоніє.
import { describe, expect, it } from 'vitest';
import flags from '../../content/flags.json';
import packing from '../../content/packing.json';
import { FLAG_FAMILIES } from '../../scripts/validator/codes.mjs';
import { packFlag } from '../core/packing';
import { eventSeenFlag } from '../core/story';
import { WEATHERS } from '../core/weather';

const row = (id: string) => flags.find((f) => f.id === id);

describe('реєстр прапорців ↔ ядро (GAME-115)', () => {
  it('f.pack-*: валідатор породжує рівно ті назви, що ставить ядро', () => {
    const fam = FLAG_FAMILIES['packing.items'];
    expect(packing.items.length).toBeGreaterThan(0); // інакше звірка нічого не доводить
    expect(fam.gen({ packing })).toEqual(packing.items.map((x) => packFlag(x.item)));
    expect(row(`${fam.prefix}*`)?.generatedFrom).toBe('packing.items');
  });
  it('f.seen-*: валідатор породжує рівно ті назви, що ставить ядро', () => {
    const fam = FLAG_FAMILIES['dialogues.trigger'];
    const dialogues = [{ id: 'dlg.a-b', trigger: {} }, { id: 'dlg.c', npcId: 'npc.x' }];
    expect(fam.gen({ dialogues })).toEqual([eventSeenFlag('dlg.a-b')]);
    expect(eventSeenFlag('dlg.a-b').startsWith(fam.prefix)).toBe(true);
    expect(row(`${fam.prefix}*`)?.generatedFrom).toBe('dialogues.trigger');
  });
  it('s.weather у реєстрі — той самий перелік, що WEATHERS ядра', () => {
    expect(row('s.weather')?.values).toEqual([...WEATHERS]);
  });
  it('негативний контроль: інший префікс сімейства не збігся б із ядром', () => {
    expect(packFlag('item.tent').startsWith('f.packed-')).toBe(false);
  });
});
