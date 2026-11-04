// GAME-224 · сторож єдиного джерела «побічного» (content/side.ts). Перебір (exploreView) не розрізняє побічні прапорці й нагороди — це
// чесно лише доти, доки сюжет їх не читає. Тут: (1) класифікація повна й узгоджена зі story/slice-defs; (2) жоден квест, хвиля, життя,
// пакування чи подія не читає побічного; розмову читає лише просильник, і так, що вузол не лишається без виходу; (3) контролі —
// мутація контенту (квест/чужа розмова/вузол без запасного вибору читає побічний прапорець) червоніє.
import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from '../core/state';
import { exploreView } from './moves';
import type { CoreDefs, DialogueDef } from '../core/defs';
import { REQUESTS } from './requests';
import { SIDE_EXTRA_FLAGS, SIDE_GRANTS, SIDE_INTERACTIONS } from './side';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';

const SIDE_FLAGS: readonly string[] = [...new Set([...(STORY.requestFlags ?? []), ...SIDE_EXTRA_FLAGS, ...Object.values(SIDE_INTERACTIONS).flatMap((i) => i.flags ?? [])])];
const mentions = (v: unknown, names: readonly string[]): string[] => { const j = JSON.stringify(v ?? null); return names.filter((n) => j.includes(`"${n}"`)); };
const GIVER_NPCS = new Set(REQUESTS.flatMap((r) => (r.giver ? [r.giver] : [])));

/** Порушення: де побічні прапорці чи нагороди читає те, що веде сюжет. Порожньо — сюжет від побічного не залежить. */
function violations(story: NonNullable<CoreDefs['story']>, rest: Pick<CoreDefs, 'waves' | 'life' | 'packing'>): string[] {
  const names = [...SIDE_FLAGS, ...SIDE_GRANTS];
  const out: string[] = [];
  for (const [id, q] of Object.entries(story.quests)) for (const n of mentions(q, names)) out.push(`quest ${id} читає ${n}`);
  for (const [k, v] of Object.entries(rest)) for (const n of mentions(v, names)) out.push(`${k} читає ${n}`);
  for (const [id, d] of Object.entries(story.dialogues) as [string, DialogueDef][]) {
    const giver = d.npcId !== undefined && GIVER_NPCS.has(d.npcId);
    for (const n of mentions({ at: d.trigger?.when, q: d.scene?.atQuest }, names)) out.push(`dialogue ${id}: trigger/scene читає ${n}`);   // scene.facts — запис, не читання
    for (const [nid, node] of Object.entries(d.nodes)) {
      const reads = (c: unknown): boolean => mentions(c, SIDE_FLAGS).length > 0;
      // автоматична розвилка («Далі» → перша виконана гілка, інакше `next`) безпечна: безумовний запасний вихід є завжди (GAME-144)
      for (const n of mentions((node.branches ?? []).map((b) => b.when), names)) if (node.next === undefined) out.push(`dialogue ${id}/${nid}: гілки читають ${n} без запасного next`);
      const gates = (node.choices ?? []).map((c) => c.when);   // ефекти (setFlag) — запис, не читання
      if (!giver) { for (const n of mentions(gates, names)) out.push(`dialogue ${id}/${nid} (не просильник) читає ${n} у виборі`); continue; }
      const open = (node.choices ?? []).filter((c) => !reads(c.when));
      if ((node.choices ?? []).length > 0 && open.length === 0) out.push(`dialogue ${id}/${nid}: усі відповіді залежать від побічного — вузол може лишитись без виходу`);
    }
  }
  return out;
}
const rest = (): Pick<CoreDefs, 'waves' | 'life' | 'packing'> => ({ ...GAME_DEFS.waves ? { waves: GAME_DEFS.waves } : {}, ...GAME_DEFS.life ? { life: GAME_DEFS.life } : {}, ...GAME_DEFS.packing ? { packing: GAME_DEFS.packing } : {} });
const story = (): NonNullable<CoreDefs['story']> => structuredClone(GAME_DEFS.story) as NonNullable<CoreDefs['story']>;

describe('GAME-224 · єдине джерело побічного', () => {
  it('усі взаємодії ядра — побічні й походять із side.ts; їхні прапорці й нагороди — у списках перебору', () => {
    expect(Object.keys(GAME_DEFS.interactions).sort()).toEqual(Object.keys(SIDE_INTERACTIONS).sort());
    expect(SIDE_GRANTS.length).toBeGreaterThan(30);
    expect(STORY.sideGrants).toEqual([...SIDE_GRANTS]);
    for (const i of Object.values(SIDE_INTERACTIONS)) for (const f of i.flags ?? []) expect(STORY.requestFlags, f).toContain(f);
    expect(STORY.requestFlags).toEqual(expect.arrayContaining([...SIDE_EXTRA_FLAGS]));
  });

  it('перебір (exploreView) не розрізняє жодного побічного прапорця й нагороди, але розрізняє чужі', () => {
    const base = initialState();
    const view = (s: GameState): string => JSON.stringify(exploreView(s, STORY));
    for (const f of SIDE_FLAGS) expect(view({ ...base, flags: [f] }), f).toBe(view(base));
    for (const g of SIDE_GRANTS) expect(view({ ...base, grants: [g] }), g).toBe(view(base));
    expect(view({ ...base, grants: ['rw.st-005'] }), 'сюжетна нагорода').not.toBe(view(base));
    expect(view({ ...base, flags: ['f.pack-tent'] }), 'сюжетний прапорець').not.toBe(view(base));
    // контроль: без списків сторож ловить розрізнення
    const none = { ...STORY, requestFlags: [], sideGrants: [] };
    expect(JSON.stringify(exploreView({ ...base, grants: [SIDE_GRANTS[0] as string] }, none))).not.toBe(JSON.stringify(exploreView(base, none)));
  });

  it('сюжет не читає побічного: жодних порушень', () => {
    expect(violations(GAME_DEFS.story as NonNullable<CoreDefs['story']>, rest())).toEqual([]);
  });

  it('контроль: умова квесту читає побічний прапорець → порушення', () => {
    const s = story();
    const q = Object.values(s.quests)[0] as unknown as { objectives?: { when?: unknown }[]; unlockedBy?: unknown };
    (q as { when?: unknown }).when = { flag: 'f.litter-cleaned-ch1' };
    expect(violations(s, rest()).some((v) => v.startsWith('quest ') && v.includes('f.litter-cleaned-ch1'))).toBe(true);
  });
  it('контроль: нагорода побічної взаємодії в умові квесту → порушення', () => {
    const s = story();
    (Object.values(s.quests)[0] as { when?: unknown }).when = { flag: 'rw.campfire-warmth' };
    expect(violations(s, rest()).length).toBeGreaterThan(0);
  });
  it('контроль: чужа (не просильника) розмова читає побічний прапорець → порушення', () => {
    const s = story();
    const d = Object.values(s.dialogues).find((x) => x.npcId !== undefined && !GIVER_NPCS.has(x.npcId));
    if (!d) throw new Error('немає розмови не-просильника');
    const node = Object.values(d.nodes).find((n) => n.choices?.length) as unknown as { choices: { when?: unknown }[] };
    (node.choices[0] as { when?: unknown }).when = { notFlag: 'f.photo-lake' };
    expect(violations(s, rest()).some((v) => v.includes('не просильник'))).toBe(true);
  });
  it('контроль: вузол просильника, де ВСІ відповіді залежать від побічного → порушення', () => {
    const s = story();
    const d = Object.values(s.dialogues).find((x) => x.npcId === 'npc.nora');
    const node = Object.values(d?.nodes ?? {}).find((n) => (n.choices?.length ?? 0) > 0) as unknown as { choices: { when?: unknown }[] };
    for (const c of node.choices) c.when = { notFlag: 'f.req-nora-shore-done' };
    expect(violations(s, rest()).some((v) => v.includes('без виходу'))).toBe(true);
  });
  it('контроль: хвиля читає побічний прапорець → порушення', () => {
    expect(violations(GAME_DEFS.story as NonNullable<CoreDefs['story']>, { ...rest(), waves: { x: { when: { flag: 'f.bench-repaired' } } } as never }).some((v) => v.startsWith('waves'))).toBe(true);
  });
});
