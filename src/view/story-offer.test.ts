// GAME-32 · меню сюжету на екрані не губить доказу «тупиків немає».
// Повний перебір по графу, який бачить ГРАВЕЦЬ (лише дії меню), для кожної комбінації старту:
//  1) з кожного досяжного через меню стану кінець розділу ще досяжний через меню;
//  2) кожна показана дія має текст в обох мовах (немає «голих» ключів);
//  3) вибір персонажа на екрані = комбінації, які дозволяє валідатор.
// Негативні контролі: меню без «завершити квест» і без відповідей у розмові мусить почервоніти.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim, step, type SimState } from '../core/sim';
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
import { DAY_MINUTES, WEATHERS, tripMinutes, weatherOf, type Weather } from '../core/weather';
import { WEATHER_LABELS } from '../ui/StoryPanel';
import ukUi from '../i18n/uk.json';
import enUi from '../i18n/en.json';

const DEFS: CoreDefs = GAME_DEFS;
type Menu = (s: GameState) => { move: Move; next: GameState }[];
const realMenu: Menu = (s) => menuMoves(s, DEFS);

function create(intent: Move): GameState {
  const r = dispatch(newSim(1, 5_000).game, { ...intent, commandId: 'c0' } as Command, DEFS);
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r.state;
}

/** Взаємодії сцени (об'єкт поруч на мапі) — гравець може зробити їх будь-коли, навіть посеред розмови. */
const sceneMoves = (s: GameState): { move: Move; next: GameState }[] => [
  ...Object.keys(DEFS.interactions).map((targetId) => ({ type: 'Interact', targetId }) as Move),
  // Подія в дорозі — хід симуляції (GAME-31): у стан після неї заходимо, але кінець має бути досяжний меню.
  ...Object.entries(DEFS.story?.dialogues ?? {}).filter(([, d]) => d.trigger).map(([eventId]) => ({ type: 'RoadEvent', eventId }) as Move),
].flatMap((move) => {
  const r = dispatch(s, { ...move, commandId: `i${s.seq}` } as Command, DEFS);
  return r.ok ? [{ move, next: r.state }] : [];
});

/**
 * Стани, з яких через меню кінця не досягти (порожньо — тупиків немає), і скільки станів усього.
 * Досяжне — меню ПЛЮС сцена (рецензія: Interact можливий будь-коли); кінець має бути досяжний меню.
 */
function deadEnds(first: GameState, menu: Menu, scene: Menu = sceneMoves): { states: number; ended: number; stuck: GameState[] } {
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
    for (const { next } of scene(s)) {          // лише досяжність, не шлях до кінця
      const nk = outcomeKey(next);
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

  it('сцена справді додає стани (інакше «меню + сцена» нічого не доводить)', () => {
    const first = choices[0];
    if (!first) throw new Error('no characters');
    const g = create(first.intent);
    expect(deadEnds(g, realMenu).states).toBeGreaterThan(deadEnds(g, realMenu, () => []).states);
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
    let journals = 0;
    for (const { intent, offer } of choices) {
      for (const k of [offer.profileKey, offer.transportKey, offer.animalKey]) if (k !== null && !has(k)) missing.add(k);
      // Обхід станів меню з журналом — щоб перевірити й записи журналу.
      let frontier: SimState[] = [step(newSim(1, 5_000), { kind: 'command', command: { ...intent, commandId: 'c0' } as Command }, { defs: DEFS })];
      const seen = new Set<string>();
      while (frontier.length) {
        const next: typeof frontier = [];
        for (const sim of frontier) {
          const k = outcomeKey(sim.game);
          if (seen.has(k)) continue;
          seen.add(k);
          journals = Math.max(journals, sim.journal.length);
          const o = storyOffer(sim, DEFS).offer;
          const keys = [o.locationKey, ...o.quests.flatMap((q) => [q.key, ...q.objectives.map((x) => x.key)]), ...o.inventory.map((i) => i.key),
            ...(o.dialogue ? [o.dialogue.key, ...(o.dialogue.speakerKey === null ? [] : [o.dialogue.speakerKey])] : []),
            ...o.journal.flatMap((e) => (e.key === null ? [] : [e.key])),
            ...[...o.actions, ...(o.dialogue?.answers ?? [])].filter((a) => a.kind !== 'continue').map((a) => a.key)];
          for (const key of keys) if (!has(key)) missing.add(String(key));
          for (const { move } of realMenu(sim.game)) next.push(step(sim, { kind: 'command', command: { ...move, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS }));
        }
        frontier = next;
      }
      expect(seen.size).toBeGreaterThan(10);
    }
    expect(journals).toBeGreaterThan(5);            // журнал справді наповнювався — його ключі перевірено
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

  it('GAME-48: питання Елізі про велосипед — у меню велосипедиста (після того, як сказав), у водія — ніколи', () => {
    /** Чи показує меню, обходячи всі досяжні через меню стани, відповідь із цим ключем. */
    const menuShows = (g0: GameState, key: string): { shown: boolean; states: number } => {
      const queue = [g0];
      const seen = new Set<string>();
      for (let s = queue.shift(); s; s = queue.shift()) {
        const k = outcomeKey(s);
        if (seen.has(k)) continue;
        seen.add(k);
        if (s.dialogue && storyOffer({ ...newSim(1), game: s }, DEFS).offer.dialogue?.answers.some((a) => a.key === key)) return { shown: true, states: seen.size };
        for (const { next } of realMenu(s)) queue.push(next);
      }
      return { shown: false, states: seen.size };
    };
    const byTransport = (t: string) => choices.filter(({ intent }) => (intent as { transportId: string }).transportId === t);
    expect(byTransport('transport.bike').length).toBeGreaterThan(0);
    expect(byTransport('transport.car').length).toBeGreaterThan(0);
    for (const c of byTransport('transport.bike')) expect(menuShows(create(c.intent), 'dlg.elise-greeting.hello.c3').shown).toBe(true);
    for (const c of byTransport('transport.car')) {
      const r = menuShows(create(c.intent), 'dlg.elise-greeting.hello.c3');
      expect(r.shown).toBe(false);
      expect(r.states).toBeGreaterThan(50);                                   // обхід справді пройшов гру, а не впав на старті
      expect(menuShows(create(c.intent), 'dlg.elise-greeting.hello.c2').shown).toBe(true);   // позитивний контроль тим самим обходом
    }
  });

  it('дія, що повторює наслідок іншої, показана один раз', () => {
    const g = create((choices[0] as { intent: Move }).intent);
    const keys = realMenu(g).map((o) => outcomeKey(o.next));
    expect(new Set(keys).size).toBe(keys.length);
    // Удома, коли ціль «озирнись удома» вже виконана: «Піти: Дім» нічого не змінює — його немає.
    const home = realMenu(g).find((o) => o.move.type === 'Visit' && o.move.locationId === 'loc.home')?.next;
    if (!home) throw new Error('visit home expected right after creation (it ticks ST-001)');
    const there = dispatch(home, { type: 'Visit', locationId: 'loc.home', commandId: 'zz' } as Command, DEFS);
    expect(there.ok).toBe(true);                    // ядро таку дію приймає — фільтр саме в меню
    expect(realMenu(home).some((o) => o.move.type === 'Visit' && o.move.locationId === 'loc.home')).toBe(false);
  });

  it('у розмові id відповіді прив\'язаний до вузла: той самий номер відповіді в іншому вузлі — інший id', () => {
    const bike = choices.find(({ intent }) => (intent as { transportId: string }).transportId === 'transport.bike');
    if (!bike) throw new Error('need bike');
    const g = create(bike.intent);
    const a = { ...g, dialogue: { id: 'dlg.elise-greeting', node: 'hello' } };
    const b = { ...g, dialogue: { id: 'dlg.elise-greeting', node: 'spot' } };
    const idA = storyOffer({ ...newSim(1), game: a }, DEFS).offer.dialogue?.answers[0]?.id;
    const idB = storyOffer({ ...newSim(1), game: b }, DEFS).offer.dialogue?.answers[0]?.id;
    expect(idA).toBeDefined();
    expect(idA).not.toBe(idB);
  });
});

describe('storyOffer: погода дня (GAME-46)', () => {
  const dayWith = (w: Weather): number => Array.from({ length: 60 }, (_, d) => d).find((d) => weatherOf(1, d) === w) as number;
  const simAt = (g: GameState, day: number): SimState => ({ ...newSim(1), game: g, clock: { minutes: day * DAY_MINUTES, accMs: 0, paused: false } });
  /** Перший стан меню, де є дорога з хвилинами (для цього транспорту). */
  const withRoad = (g0: GameState): GameState => {
    const queue = [g0];
    const seen = new Set<string>();
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (storyOffer(simAt(s, dayWith('sunny')), DEFS).offer.actions.some((a) => a.kind === 'visit' && a.minutes !== undefined)) return s;
      const k = outcomeKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const { next } of realMenu(s)) queue.push(next);
    }
    throw new Error('no road with minutes reachable');
  };
  const minutesOf = (g: GameState, day: number): (number | undefined)[] =>
    storyOffer(simAt(g, day), DEFS).offer.actions.filter((a) => a.kind === 'visit').map((a) => a.minutes);

  it('знімок несе погоду поточного дня — ту саму, що weatherOf(зерно світу, день); на екрані вибору теж', () => {
    for (const w of ['sunny', 'cloudy', 'rain'] as const) {
      expect(storyOffer(simAt(newSim(1).game, dayWith(w)), DEFS).offer.weather).toBe(w);
      expect(storyOffer(simAt(create((choices[0] as { intent: Move }).intent), dayWith(w)), DEFS).offer.weather).toBe(w);
    }
  });

  it('меню показує час дороги вже з погодою: велосипед у дощ ×1.5 угору, авто — як завжди', () => {
    const pick = (t: string) => choices.find(({ intent }) => (intent as { transportId: string }).transportId === t) as { intent: Move };
    const bike = withRoad(create(pick('transport.bike').intent));
    const dry = minutesOf(bike, dayWith('sunny'));
    expect(dry.some((m) => m !== undefined)).toBe(true);
    expect(minutesOf(bike, dayWith('rain'))).toEqual(dry.map((m) => (m === undefined ? m : tripMinutes(m, 'transport.bike', 'rain'))));
    expect(minutesOf(bike, dayWith('rain'))).not.toEqual(dry);
    const car = withRoad(create(pick('transport.car').intent));
    expect(minutesOf(car, dayWith('rain'))).toEqual(minutesOf(car, dayWith('sunny')));
  });

  it('кожен вид погоди має підпис в обох мовах інтерфейсу', () => {
    expect(Object.keys(WEATHER_LABELS).sort()).toEqual([...WEATHERS].sort());
    for (const w of ['sunny', 'cloudy', 'rain'] as const) {
      const k = WEATHER_LABELS[w];
      expect(ukUi[k], `uk ${k}`).toBeTruthy();
      expect(enUi[k], `en ${k}`).toBeTruthy();
    }
    expect(ukUi['ui.weather']).toBeTruthy();
    expect(enUi['ui.weather']).toBeTruthy();
  });
});
