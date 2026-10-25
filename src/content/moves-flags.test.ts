// GAME-170 рецензія · moves() не дає боту Interact із прапорцями (інакше вибух простору станів), тож бот не бачить obj.litter.
// Це чесно лише доти, доки жодна умова квесту, ворота розмови чи гілка сцени не читає прапорець, який ставить ЛИШЕ така взаємодія:
// інакше бот не дійшов би до гілки, а перебір її б не перевірив. Множину виводимо з контенту, а не списком.
import { describe, expect, it } from 'vitest';
import flags from '../../content/flags.json';
import { checkDefs, type CoreDefs } from '../core/defs';
import { GAME_DEFS } from './slice-defs';

/** Прапорці, які ставлять лише виключені з moves() взаємодії. */
const excludedFlags = (d: CoreDefs): string[] => [...new Set(Object.values(d.interactions).flatMap((i) => i.flags ?? []))];

/** Усе, що читає прапорці: сюжет (квести, розмови, сцени), хвилі, життя, пакування. Будь-яка згадка id там — читання. */
const readers = (d: CoreDefs, flag: string): string[] =>
  Object.entries({ story: d.story, waves: d.waves, life: d.life, packing: d.packing }).filter(([, v]) => JSON.stringify(v ?? null).includes(`"${flag}"`)).map(([k]) => k);

const KINDS = Object.fromEntries(flags.map((f) => [f.id, (f as { kind?: string }).kind]));

describe('прапорці виключених взаємодій ніхто не читає', () => {
  it('множина не порожня (інакше сторож нічого не стереже) і містить f.litter-cleaned-ch1', () => {
    expect(excludedFlags(GAME_DEFS)).toContain('f.litter-cleaned-ch1');
  });
  it('жодна умова квесту / ворота розмови / гілка сцени їх не читає', () => {
    for (const f of excludedFlags(GAME_DEFS)) expect(readers(GAME_DEFS, f), f).toEqual([]);
  });
  it('негативний контроль: ворота розмови читає f.litter-cleaned-ch1 → сторож червоніє', () => {
    const story = structuredClone(GAME_DEFS.story) as NonNullable<CoreDefs['story']>;
    const node = Object.values(story.dialogues).flatMap((x) => Object.values(x.nodes))[0] as { branches?: unknown };
    node.branches = [{ when: { flag: 'f.litter-cleaned-ch1' }, next: 'x' }];
    expect(readers({ ...GAME_DEFS, story }, 'f.litter-cleaned-ch1')).toEqual(['story']);
  });
  it('реєстр: прапорці взаємодій каталогу гри — з реєстру й позначені interaction (checkDefs)', () => {
    expect(checkDefs(GAME_DEFS, KINDS)).toEqual([]);
  });
});
