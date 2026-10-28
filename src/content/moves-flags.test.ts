// GAME-170 рецензія · moves() не дає боту Interact із прапорцями (інакше вибух простору станів), тож бот не бачить obj.litter.
// Це чесно лише доти, доки жодна умова квесту чи ворота розмови (вибір із when) не читає прапорець, який ставить ЛИШЕ така взаємодія:
// інакше бот не дійшов би до гілки, а перебір її б не перевірив. Множину виводимо з контенту, а не списком.
// GAME-144: єдиний дозволений читач — АВТОМАТИЧНА гілка (`branches` вузла з `next`): у неї завжди є безумовний запасний вихід, тож
// гравець без прапорця нічого не втрачає й ніде не застрягає, а обидві гілки доводить day3.test прямим станом (Еліза дякує за пакети).
import { describe, expect, it } from 'vitest';
import flags from '../../content/flags.json';
import { checkDefs, type CoreDefs } from '../core/defs';
import { GAME_DEFS } from './slice-defs';

/** Прапорці, які ставлять лише виключені з moves() взаємодії. */
const excludedFlags = (d: CoreDefs): string[] => [...new Set(Object.values(d.interactions).flatMap((i) => i.flags ?? []))];

/** Сюжет без автоматичних гілок (`branches`) — усе інше в ньому читати прапорець взаємодії не може. */
const withoutBranches = (story: CoreDefs['story']): unknown => story && {
  ...story,
  dialogues: Object.fromEntries(Object.entries(story.dialogues).map(([id, dlg]) => [id, { ...dlg, nodes: Object.fromEntries(Object.entries(dlg.nodes).map(([n, node]) => [n, { ...node, branches: undefined }])) }])),
};
/** Усе, що читає прапорці: сюжет (квести, розмови, сцени — без гілок), хвилі, життя, пакування. Будь-яка згадка id там — читання. */
const readers = (d: CoreDefs, flag: string): string[] =>
  Object.entries({ story: withoutBranches(d.story), waves: d.waves, life: d.life, packing: d.packing }).filter(([, v]) => JSON.stringify(v ?? null).includes(`"${flag}"`)).map(([k]) => k);
/** Діалоги, чиї автоматичні гілки читають прапорець. */
const branchReaders = (d: CoreDefs, flag: string): string[] =>
  Object.entries(d.story?.dialogues ?? {}).filter(([, dlg]) => Object.values(dlg.nodes).some((n) => JSON.stringify(n.branches ?? null).includes(`"${flag}"`))).map(([id]) => id);

const KINDS = Object.fromEntries(flags.map((f) => [f.id, (f as { kind?: string }).kind]));

describe('прапорці виключених взаємодій ніхто не читає', () => {
  it('множина не порожня (інакше сторож нічого не стереже) і містить f.litter-cleaned-ch1', () => {
    expect(excludedFlags(GAME_DEFS)).toContain('f.litter-cleaned-ch1');
  });
  it('жодна умова квесту / ворота розмови їх не читає; автоматична гілка — лише прощання Елізи (GAME-144)', () => {
    for (const f of excludedFlags(GAME_DEFS)) expect(readers(GAME_DEFS, f), f).toEqual([]);
    expect(branchReaders(GAME_DEFS, 'f.litter-cleaned-ch1')).toEqual(['dlg.elise-greeting']);
  });
  it('негативний контроль: ворота розмови (вибір із when) читає f.litter-cleaned-ch1 → сторож червоніє', () => {
    const story = structuredClone(GAME_DEFS.story) as NonNullable<CoreDefs['story']>;
    const node = Object.values(story.dialogues).flatMap((x) => Object.values(x.nodes)).find((n) => n.choices) as unknown as { choices: { when?: unknown }[] };
    (node.choices[0] as { when?: unknown }).when = { flag: 'f.litter-cleaned-ch1' };
    expect(readers({ ...GAME_DEFS, story }, 'f.litter-cleaned-ch1')).toEqual(['story']);
    // І квест: умова цілі читає прапорець — теж червоно.
    const q = structuredClone(GAME_DEFS.story) as NonNullable<CoreDefs['story']>;
    (Object.values(q.quests)[0] as { when?: unknown }).when = { flags: ['f.litter-cleaned-ch1'] };
    expect(readers({ ...GAME_DEFS, story: q }, 'f.litter-cleaned-ch1')).toEqual(['story']);
  });
  it('реєстр: прапорці взаємодій каталогу гри — з реєстру й позначені interaction (checkDefs)', () => {
    expect(checkDefs(GAME_DEFS, KINDS)).toEqual([]);
  });
});
