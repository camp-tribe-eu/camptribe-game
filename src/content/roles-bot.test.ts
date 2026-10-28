// GAME-106 (закриття PARTIAL) · бот проходить 3 дні розділу 1 для КОЖНОГО розподілу ролей.
// Розподіл ролей = стан прапорця f.roles (хто веде маршрут): unset (вибору не робили) | route-george | route-matthew. Зерна не потрібні:
// прохід — детермінований сценарій (як у day3.test), а з меж днів 1 і 2 та після розмови з Джорджем додатково працює вичерпний
// пошук `endReachable` (той самий бот-перевірник, що в bot.test). Досяжні розподіли ВИВОДЯТЬСЯ з контенту, а не вписані руками:
// значення enum f.roles × профілі, яким доступний npc.george (єдина розмова, що ставить роль). Хто Джорджа не має — лише unset.
// Закон 1: перевірка має негативний контроль — копія контенту, де роль знімає єдиний шлях до обов'язкового квесту, і прохід червоніє.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import { chapterComplete } from '../core/story';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { endReachable, type EndMemo } from './bot';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory, STORY, type RawContent } from './story';
import flags from '../../content/flags.json';
import npcs from '../../content/npcs.json';

const GEORGE = 'npc.george';
const ELISE = 'npc.elise';
const END = 'CH1-D3-HOME-001';
const CAP = 20_000;

interface Combo { profile: string; transport: string; animal: string }
const COMBOS = (enumerateCombos(CONTENT) as { profile: string | null; transport: string | null; animal: string }[]).filter((c): c is Combo => c.profile !== null && c.transport !== null);

const rolesDef = (flags as { id: string; values?: string[] }[]).find((f) => f.id === 'f.roles');
const GEORGE_PROFILES = ((npcs as { id: string; when?: { profiles?: string[] } }[]).find((n) => n.id === GEORGE)?.when?.profiles) ?? null;
/** Розподіли ролей, досяжні для комбінації: unset завжди; кожне значення enum — лише якщо профіль бачить Джорджа (null = усі). */
const rolesFor = (c: Combo): (string | null)[] => [null, ...(GEORGE_PROFILES === null || GEORGE_PROFILES.includes(c.profile) ? rolesDef?.values ?? [] : [])];
/** Номер вибору в george-plan.route: 0 — Джордж веде, 1 — Метью (порядок рядків діалогу). */
const ROUTE_CHOICE: Record<string, number> = { 'route-george': 0, 'route-matthew': 1 };

let n = 0;
const talk: Move = { type: 'Talk', npcId: ELISE };
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
const visit = (locationId: string): Move => ({ type: 'Visit', locationId });

class Stuck extends Error {}
function play(ms: readonly Move[], from: GameState, defs: CoreDefs): GameState {
  let s = from;
  for (const m of ms) {
    const r = dispatch(s, { ...m, commandId: `roles-${n++}` } as Command, defs);
    if (!r.ok) throw new Stuck(`${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}

/** Розмова з Джорджем удома (лише якщо роль обрано): базове спорядження → маршрут → вихід. */
const georgeMoves = (role: string | null): Move[] => role === null ? [] : [{ type: 'Talk', npcId: GEORGE }, choose(0), choose(0), next, choose(ROUTE_CHOICE[role] as number), next, next];

function createMove(c: Combo): Move { return { type: 'CreateCharacter', profileId: c.profile, transportId: c.transport, ...(c.animal === 'animal.none' ? {} : { animalId: c.animal }) } as Move; }
function day1(c: Combo): Move[] {
  const meet: Move[] = c.transport === 'transport.bike' ? [talk, choose(0), next, next, choose(0), next] : [talk, choose(1), next, choose(0), next];
  return [
    done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
    visit('loc.shop'), { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, done('ST-003'),
    visit('loc.home'), done('CH1-HOME-001'), visit('loc.road'), done('ST-004'), visit('loc.camp.lake'),
    ...meet, { type: 'Pickup', itemId: 'item.firewood' }, done('ST-005'),
  ];
}
const DAY2: Move[] = [done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'), talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001')];
const DAY3: Move[] = [done('CH1-D3-001'), done('CH1-D3-GEAR-001'), talk, choose(14), next, choose(0), next, next, done('CH1-D3-ELISE-001'), visit('loc.road'), done('CH1-D3-RETURN-001'), visit('loc.home'), done(END)];

const verdictOf = (r: boolean | undefined): string => (r === false ? 'НЕдосяжний (тупик)' : 'не доведено (ліміт)');

/**
 * Розділ 1, дні 1–3, для комбінації й розподілу ролей. Повертає перше порушення або null.
 * Перевіряє: кроки сценарію приймаються ядром; після Джорджа й на межах днів 1 і 2 кінець досяжний (вичерпний пошук, тупиків 0);
 * у кінці — campaignEnded, розділ пройдено, роль у стані саме та, що обрана.
 */
function chapterVerdict(c: Combo, role: string | null, defs: CoreDefs, memo: EndMemo): string | null {
  const tag = `${c.profile}/${c.transport}/${c.animal} roles=${role ?? 'unset'}`;
  try {
    let s = play([createMove(c), ...georgeMoves(role)], initialState(5_000), defs);
    for (const r of Object.keys(ROUTE_CHOICE)) if (s.flags.includes(`f.roles-${r}`) !== (r === role)) return `${tag}: прапорець ролі не збігся з вибором`;
    if (role !== null) { const r = endReachable(s, defs, memo, CAP); if (r !== true) return `${tag}: після розмови з Джорджем кінець ${verdictOf(r)}`; }
    for (const [name, ms] of [['день 1', day1(c)], ['день 2', DAY2]] as const) {
      s = play(ms, s, defs);
      const r = endReachable(s, defs, memo, CAP);
      if (r !== true) return `${tag}: на межі «${name}» кінець ${verdictOf(r)}`;
    }
    s = play(DAY3, s, defs);
    if (!s.campaignEnded || !chapterComplete(s, STORY)) return `${tag}: день 3 пройдено, а розділ не закінчено`;
    return null;
  } catch (e) {
    if (e instanceof Stuck) return `${tag}: сценарій застряг на ${e.message}`;
    throw e;
  }
}
const sweep = (defs: CoreDefs, combos: readonly Combo[] = COMBOS): string[] => {
  const memo: EndMemo = new Map();
  return combos.flatMap((c) => rolesFor(c).map((role) => chapterVerdict(c, role, defs, memo))).filter((v): v is string => v !== null);
};
const total = COMBOS.reduce((a, c) => a + rolesFor(c).length, 0);

describe('GAME-106: розділ 1 (3 дні) для кожного розподілу ролей', () => {
  it('розподіли виведено з контенту: unset + значення f.roles лише для профілю з Джорджем; їх більше однієї', () => {
    expect(rolesDef?.values).toEqual(['route-george', 'route-matthew']);
    expect(GEORGE_PROFILES).toEqual(['profile.family-teen']);
    expect(total).toBeGreaterThan(COMBOS.length);
    // Хто Джорджа не бачить — роль поставити не може (інакше «досяжний розподіл» був би недоведеною вигадкою).
    const other = COMBOS.find((c) => !GEORGE_PROFILES?.includes(c.profile));
    expect(other).toBeDefined();
    expect(chapterVerdict(other as Combo, 'route-george', GAME_DEFS, new Map())).toMatch(/застряг/);
  });

  it(`усі ${total} пар «комбінація × розподіл ролей»: дні 1–3 до кінця, кінець досяжний на кожній межі, тупиків 0`, () => {
    expect(sweep(GAME_DEFS)).toEqual([]);
  }, 120_000);

  it('негативний контроль: роль знімає єдиний шлях до обов\'язкового квесту (прощання з Елізою лише для route-matthew) → червоніє', () => {
    const c: RawContent = structuredClone(CONTENT);
    const d = c.dialogues.find((x) => x.id === 'dlg.elise-greeting') as unknown as { nodes: { id: string; choices?: { textKey: string; when?: unknown }[] }[] };
    const farewell = d.nodes.find((x) => x.id === 'hello')?.choices?.find((x) => x.textKey === 'dlg.elise-greeting.hello.c15');
    expect(farewell).toBeDefined();
    (farewell as { when: unknown }).when = { all: [{ quest: 'CH1-D3-ELISE-001', status: 'active' }, { flag: 'f.roles-route-matthew' }] };
    // Один представник (родина на авто з котом): вичерпний пошук тупика в мутантній копії дорогий, а розбіжності в ролях видно й на ньому.
    const one = COMBOS.filter((c2) => c2.profile === 'profile.family-teen' && c2.transport === 'transport.car' && c2.animal === 'animal.cat');
    expect(one).toHaveLength(1);
    const bad = sweep({ ...GAME_DEFS, story: compileStory(c) }, one);
    expect(bad).toHaveLength(2);                                  // george і unset червоніють, matthew — ні
    expect(bad.some((m) => m.includes('roles=route-george'))).toBe(true);
    expect(bad.some((m) => m.includes('roles=unset'))).toBe(true);
    expect(bad.some((m) => m.includes('roles=route-matthew'))).toBe(false);
  }, 120_000);
});
