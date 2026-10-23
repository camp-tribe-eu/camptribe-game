// GAME-32 · меню сюжету на екрані не губить доказу «тупиків немає».
// Повний перебір по графу, який бачить ГРАВЕЦЬ (лише дії меню), для кожної комбінації старту:
//  1) з кожного досяжного через меню стану кінець розділу ще досяжний через меню;
//  2) кожна показана дія має текст в обох мовах (немає «голих» ключів);
//  3) вибір персонажа на екрані = комбінації, які дозволяє валідатор.
// Негативні контролі: меню без «завершити квест» і без відповідей у розмові мусить почервоніти.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim } from '../core/sim';
import type { GameState } from '../core/state';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { GAME_DEFS } from '../content/slice-defs';
import { CONTENT } from '../content/story';
import type { Move } from '../content/moves';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import { JOURNAL_TYPES } from '../core/sim';
import { JOURNAL_LABELS } from '../ui/StoryPanel';
import { characterChoices, menuMoves, outcomeKey, storyOffer } from './story-offer';

const DEFS: CoreDefs = GAME_DEFS;
type Menu = (s: GameState) => { move: Move; next: GameState }[];
const realMenu: Menu = (s) => menuMoves(s, DEFS);

function create(intent: Move): GameState {
  const r = dispatch(newSim(1, 5_000).game, { ...intent, commandId: 'c0' } as Command, DEFS);
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r.state;
}

/** Стани, з яких через меню кінця не досягти (порожньо — тупиків немає), і скільки станів усього. */
function deadEnds(first: GameState, menu: Menu): { states: number; ended: number; stuck: GameState[] } {
  const seen = new Map<string, GameState>([[outcomeKey(first), first]]);
  const back = new Map<string, string[]>();
  const queue = [first];
  for (let s = queue.shift(); s; s = queue.shift()) {
    const k = outcomeKey(s);
    for (const { next } of menu(s)) {
      const nk = outcomeKey(next);
      back.set(nk, [...(back.get(nk) ?? []), k]);
      if (!seen.has(nk)) { seen.set(nk, next); queue.push(next); }
    }
    if (seen.size > 100_000) throw new Error('простір станів вибухнув — тест не доводить нічого');
  }
  const ended = [...seen].filter(([, s]) => s.campaignEnded).map(([k]) => k);
  const ok = new Set(ended);
  const stack = [...ended];
  for (let k = stack.pop(); k !== undefined; k = stack.pop()) for (const p of back.get(k) ?? []) if (!ok.has(p)) { ok.add(p); stack.push(p); }
  return { states: seen.size, ended: ended.length, stuck: [...seen].filter(([k]) => !ok.has(k)).map(([, s]) => s) };
}

const choices = characterChoices(DEFS);

describe('меню сюжету: з кожного стану, досяжного через меню, кінець досяжний (GAME-32)', () => {
  it('вибір персонажа = комбінації валідатора', () => {
    const fromValidator = enumerateCombos(CONTENT).map((k) => `${k.profile}|${k.transport}|${k.animal}`).sort();
    const onScreen = choices.map(({ intent }) => {
      const c = intent as Extract<Move, { type: 'CreateCharacter' }>;
      return `${c.profileId}|${c.transportId}|${c.animalId ?? 'animal.none'}`;
    }).sort();
    expect(onScreen.length).toBeGreaterThan(1);
    expect(onScreen).toEqual(fromValidator);
  });

  for (const { intent, offer } of choices) {
    it(`${offer.profileKey} · ${offer.transportKey} · ${offer.animalKey ?? 'no animal'}`, () => {
      const r = deadEnds(create(intent), realMenu);
      expect(r.states).toBeGreaterThan(10);
      expect(r.ended).toBeGreaterThan(0);
      expect(r.stuck.map((s) => ({ quests: s.quests, at: s.player?.locationId, dialogue: s.dialogue }))).toEqual([]);
    });
  }

  it('негативний контроль: меню без «завершити квест» — тупик знайдено', () => {
    const first = choices[0];
    if (!first) throw new Error('no characters');
    const r = deadEnds(create(first.intent), (s) => realMenu(s).filter((o) => o.move.type !== 'CompleteQuest'));
    expect(r.ended).toBe(0);
    expect(r.stuck.length).toBeGreaterThan(0);
  });

  it('негативний контроль: розмова без відповідей (лише «далі») — застрягає в діалозі', () => {
    const first = choices[0];
    if (!first) throw new Error('no characters');
    const r = deadEnds(create(first.intent), (s) => realMenu(s).filter((o) => o.move.type !== 'Choose'));
    expect(r.stuck.some((s) => s.dialogue !== null)).toBe(true);
  });
});

describe('тексти меню: кожен ключ існує в обох мовах', () => {
  const has = (k: string | null): boolean => k !== null && k in uk && k in en;

  it('кожен показаний ключ — у uk і en, у кожному стані меню', () => {
    const missing = new Set<string>();
    for (const { intent, offer } of choices) {
      for (const k of [offer.profileKey, offer.transportKey, offer.animalKey]) if (k !== null && !has(k)) missing.add(k);
      // Обхід станів меню з журналом — щоб перевірити й записи журналу.
      let frontier = [{ ...newSim(1, 5_000), game: create(intent) }];
      const seen = new Set<string>();
      while (frontier.length) {
        const next: typeof frontier = [];
        for (const sim of frontier) {
          const k = outcomeKey(sim.game);
          if (seen.has(k)) continue;
          seen.add(k);
          const o = storyOffer(sim, DEFS).offer;
          const keys = [o.locationKey, ...o.quests.flatMap((q) => [q.key, ...q.objectives.map((x) => x.key)]), ...o.inventory.map((i) => i.key),
            ...(o.dialogue ? [o.dialogue.key, o.dialogue.speakerKey] : []),
            ...[...o.actions, ...(o.dialogue?.answers ?? [])].filter((a) => a.kind !== 'continue').map((a) => a.key)];
          for (const key of keys) if (!has(key)) missing.add(String(key));
          for (const { next: g } of realMenu(sim.game)) next.push({ ...sim, game: g });
        }
        frontier = next;
      }
      expect(seen.size).toBeGreaterThan(10);
    }
    expect([...missing].sort()).toEqual([]);
  });

  it('кожен тип запису журналу має підпис — і нічого зайвого', () => {
    expect(Object.keys(JOURNAL_LABELS).sort()).toEqual([...JOURNAL_TYPES].sort());
  });

  it('негативний контроль: невідомий id дає null, і перевірка вище його б помітила', () => {
    expect(has(null)).toBe(false);
    expect(has('q.does-not-exist')).toBe(false);
  });
});

describe('storyOffer: знімок для UI', () => {
  it('без персонажа — екран вибору; id дії веде саме до своєї команди', () => {
    const { offer, intents } = storyOffer(newSim(1, 5_000), DEFS);
    expect(offer.stage).toBe('create');
    expect(offer.characters.length).toBe(choices.length);
    for (const c of offer.characters) expect(intents.get(c.id)?.type).toBe('CreateCharacter');
  });

  it('у розмові — лише відповіді; велосипедна відповідь лише велосипедистові', () => {
    const bike = choices.find(({ intent }) => (intent as { transportId: string }).transportId === 'transport.bike');
    const car = choices.find(({ intent }) => (intent as { transportId: string }).transportId === 'transport.car');
    if (!bike || !car) throw new Error('need bike and car');
    const toElise = (g: GameState): GameState => {
      // Шлях меню до Елізи: перший вузол-розмова, знайдений обходом.
      const queue = [g];
      const seen = new Set<string>();
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (s.dialogue) return s;
        const k = outcomeKey(s);
        if (seen.has(k)) continue;
        seen.add(k);
        for (const { next } of realMenu(s)) queue.push(next);
      }
      throw new Error('dialogue unreachable');
    };
    const answers = (g: GameState): (string | null)[] => {
      const o = storyOffer({ ...newSim(1), game: g }, DEFS).offer;
      expect(o.actions).toEqual([]);
      return o.dialogue?.answers.map((a) => a.key) ?? [];
    };
    expect(answers(toElise(create(bike.intent)))).toContain('dlg.elise-greeting.hello.c1');
    expect(answers(toElise(create(car.intent)))).not.toContain('dlg.elise-greeting.hello.c1');
  });

  it('дія, що повторює наслідок іншої, показана один раз', () => {
    const g = create((choices[0] as { intent: Move }).intent);
    const keys = realMenu(g).map((o) => outcomeKey(o.next));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
