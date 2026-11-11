/// <reference types="node" />
// GAME-292 · CH2-D3: збір (мокрий чи сухий намет за погодою), прощання з Інгрід, дорога додому, підсумок розділу, Атлас із печаткою Люксембургу і тизер розділу 3 (Ельзас).
// Закон 1: кожен сторож нижче показано червоним мутацією (текст червоного — в описі PR):
//  1) розділ 2 завершується ЛИШЕ завершенням квесту CH2-D3-HOME-001 за КОЖНОЇ погоди × комбінація профіль/транспорт/тварина × усі вибори сцен; МУТАЦІЯ «chapter2_complete — окремий прапорець» → червоніє;
//  2) МУТАЦІЯ «сцена збору не знає погоди» → сторож «дощ = мокрий намет» червоніє;
//  3) МУТАЦІЯ «з'єднання половинок після раннього виїзду з Шенгену недосяжне» → сторож «нічого не лишається нез'єднаним» червоніє;
//  4) нічого не блокується: гравець поза кемпінгом без сцени збору однаково завершує крок.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDALLION, MEDALLION_HALF1, MEDALLION_HALF2 } from '../core/join';
import { fromSave, serialize } from '../core/save';
import { todayWeather, type SimState } from '../core/sim';
import { CHAPTER2_END, chapter2Complete, luxembourgStamp } from '../core/story';
import { WEATHERS, type Weather } from '../core/weather';
import { SECONDS, moveSeconds } from './time-model';
import { ch2CarTrips } from './ch2-live';
import { PACK_LATE_JOIN_FLAG, PACK_QUEST, PACK_SCENE, PACK_WET_FLAG, halvesUnjoined, packDue, packFinishMove, packMove } from './ch2-pack';
import { SCHENGEN, SCHENGEN_QUEST } from './ch2-schengen';
import { storyMoves } from './director';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import { PANEL_VIEW, atlasOffer, storyOffer, summaryOffer } from '../view/story-offer';
import { episodeLines, recapKeysCh2, RECAP_LINES } from '../ui/episode-beats';
import { atlasMapModel } from '../ui/atlas-model';
import { episodeProblems } from '../view/episode-check';
import { COMBOS, MULLERTHAL, NODES_OF, comboName, direct, playSchengen, readScene, resetIds, run, schengenDay, settle, type Combo } from './ch2-day3.test.helpers';
import ukC from '../../content/locales/uk.json';
import enC from '../../content/locales/en.json';
import ukUi from '../i18n/uk.json';
import enUi from '../i18n/en.json';
import questsJson from '../../content/quests.json';

const HOME = 'loc.home';
const has = (s: SimState, id: string): number => s.game.inventory[id] ?? 0;
const ch2Sent = (m: Move, q: string): boolean => m.type === 'CompleteQuest' && (m as { questId: string }).questId === q;

interface Day3 {
  readonly start: SimState;
  readonly afterSchengen: SimState;
  readonly pack: Played2;
  readonly mid: SimState;
  readonly end: SimState;
  readonly seconds: number;
  readonly sent: Move[];
}
interface Played2 { readonly nodes: string[]; readonly seconds: number }

/** Весь день 3 від ранку (Шенген активний): поїздка, сцена Шенгену, збір (сцену відкриває режисер), дорога додому. `sp` — вибори Шенгену, `pk` — вибір «хто складає намет», `fw` — «що сказати Інгрід». */
function day3(w: Weather, combo?: Combo, sp = 0, pk = 0, fw = 0): Day3 {
  const start = schengenDay(w, combo);
  const trip = playSchengen(start, sp & 1, (sp >> 1) & 1, (sp >> 2) & 1);
  const afterSchengen = trip.sim;
  const d1 = direct(afterSchengen);   // режисер сам відкриває сцену збору
  expect(d1.sent.map((m) => m.type), 'збір: режисер відкриває сцену, більше нічого').toEqual(['StartScene']);
  const sc = readScene(d1.sim, PACK_SCENE, (id) => (id === 'pack' ? pk : id === 'farewell' ? fw : 0));
  const d2 = direct(sc.sim);
  const mid = d2.sim;
  let seconds = trip.seconds + moveSeconds(d1.sent[0] as never) + sc.seconds - SECONDS.line;   // перший рядок уже в moveSeconds(StartScene)
  // дорога додому: авто (дійти до нього, рамка з єдиною відповіддю), приїзд, режисер завершує квест-кінець
  const trips = ch2CarTrips(mid.game);
  expect(trips, 'авто пропонує лише дорогу додому').toEqual([[{ type: 'Visit', locationId: HOME }]]);
  seconds += SECONDS.walkOnMap + moveSeconds(trips[0]?.[0] as never);
  const home = settle(run(mid, trips[0]?.[0] as object));
  const d3 = direct(home);
  seconds += d3.sent.reduce((a, m) => a + moveSeconds(m as never), 0);
  return { start, afterSchengen, pack: { nodes: sc.nodes, seconds: sc.seconds }, mid, end: d3.sim, seconds, sent: [...trip.sent, ...d1.sent, ...d2.sent, ...d3.sent] };
}

describe('GAME-292 · день 3 завершується квестом за КОЖНОЇ погоди', () => {
  it('вибірка названа: комбінацій 5 (enumerateCombos), погод 3, виборів: Шенген 2×2×2 (беремо 2 набори) × збір 2 × прощання 2 = 8 на комбінацію×погоду', () => {
    expect(COMBOS.length).toBe(5);
    expect(WEATHERS.length).toBe(3);
    process.stdout.write(`GAME-292 combos: ${COMBOS.map(comboName).join('; ')}\n`);
  });

  let runs = 0;
  const paths = new Set<string>();
  for (const combo of COMBOS) {
    it(`${comboName(combo)}: усі погоди × вибори → збір зіграно раз, квест завершено, HOME завершується візитом, chapter2 — наслідок квесту, медальйон цілий`, () => {
      for (const w of WEATHERS) {
        for (let k = 0; k < 8; k++) {
          const sp = k & 1 ? 7 : 0;
          const r = day3(w, combo, sp, (k >> 1) & 1, (k >> 2) & 1);
          runs++;
          const g = r.end.game;
          expect(r.end.journal.filter((e) => e.type === 'StartScene' && e.ref === PACK_SCENE).length, 'сцена збору — раз').toBe(1);
          expect(g.quests[PACK_QUEST]?.status).toBe('completed');
          expect(g.quests[CHAPTER2_END]?.status, `${w}: квест-кінець завершено візитом додому`).toBe('completed');
          expect(chapter2Complete(g, STORY), 'chapter2_complete виведено з квесту').toBe(true);
          expect(g.campaignEnded).toBe(true);
          expect(g.player?.locationId).toBe(HOME);
          expect(r.mid.game.quests[CHAPTER2_END]?.status, 'до візиту додому квест-кінець лише активний').toBe('active');
          expect(chapter2Complete(r.mid.game, STORY), 'до візиту додому розділу не завершено').toBe(false);
          expect([has(r.end, MEDALLION), has(r.end, MEDALLION_HALF1), has(r.end, MEDALLION_HALF2)], 'медальйон цілий').toEqual([1, 0, 0]);
          expect(has(r.end, 'item.microcard')).toBe(1);
          expect(g.flags.includes(PACK_WET_FLAG), 'мокрий намет — лише в дощ').toBe(w === 'rain');
          expect(g.flags.includes(PACK_LATE_JOIN_FLAG), 'зі штатного Шенгену половинки вже з’єднані: пізнього з’єднання нема').toBe(false);
          expect(storyMoves(r.end, GAME_DEFS), 'після кінця розділу сюжет мовчить').toEqual([]);
          expect(r.sent.filter((m) => ch2Sent(m, PACK_QUEST)).length, 'крок збору завершує режисер раз').toBe(1);
          expect(r.sent.filter((m) => ch2Sent(m, CHAPTER2_END)).length, 'квест-кінець завершує режисер раз').toBe(1);
          paths.add(r.pack.nodes.join('>'));
        }
      }
    });
  }
  it('підсумок вибірки: 5 комбінацій × 3 погоди × 8 виборів = 120 проходжень; шляхів сцени збору 8 (сухо: 2×2, дощ: 2×2)', () => {
    expect(runs).toBe(COMBOS.length * WEATHERS.length * 8);
    expect(paths.size, [...paths].join(' | ')).toBe(8);
    process.stdout.write(`GAME-292 playthroughs: ${runs}; pack scene paths: ${paths.size}\n`);
  });
});

describe('GAME-292 · МУТАЦІЯ «chapter2_complete — окремий прапорець» (закон 1)', () => {
  const r = day3('sunny');
  const FLAG = 'f.chapter2-complete';
  /** Сторож: розділ завершений лише за завершеного квесту-кінця — і ядро, і те, що бачить гравець (stage 'ended' + chapterEnd). */
  function assertEndFromQuest(done: (g: SimState['game']) => boolean, stage: (s: SimState) => string): void {
    expect(done(r.end.game), 'квест завершено — розділ завершено').toBe(true);
    expect(done(r.mid.game), 'квест-кінець лише активний — розділ ще триває').toBe(false);
    // прапорець і campaignEnded БЕЗ квесту: розділ не завершується
    const fake = { ...r.mid, game: { ...r.mid.game, campaignEnded: true, flags: [...r.mid.game.flags, FLAG] } };
    expect(done(fake.game), 'прапорець без квесту не завершує розділ').toBe(false);
    expect(stage(r.end), 'гравець бачить кінець розділу після квесту').toBe('ended');
    expect(stage(fake), 'гравець НЕ бачить кінця за прапорцем без квесту').toBe('play');
  }
  const realStage = (s: SimState): string => storyOffer(s, GAME_DEFS, PANEL_VIEW).offer.stage;
  it('справжнє ядро: розділ завершується лише квестом (і в ядрі, і на екрані)', () => {
    assertEndFromQuest((g) => chapter2Complete(g, STORY), realStage);
    expect(storyOffer(r.end, GAME_DEFS, PANEL_VIEW).offer.chapterEnd, 'кінець саме розділу 2').toBe(2);
    expect(storyOffer(r.mid, GAME_DEFS, PANEL_VIEW).offer.chapterEnd).toBeUndefined();
  });
  it('мутація: «завершено = campaignEnded чи прапорець» → сторож червоніє', () => {
    expect(() => assertEndFromQuest((g) => g.campaignEnded || g.flags.includes(FLAG), realStage)).toThrow(/прапорець без квесту не завершує розділ/);
  });
  it('мутація: екран бере кінець із прапорця (stage ended за campaignEnded) → сторож червоніє', () => {
    const flagStage = (s: SimState): string => (s.game.campaignEnded ? 'ended' : realStage(s));
    expect(() => assertEndFromQuest((g) => chapter2Complete(g, STORY), flagStage)).toThrow(/гравець НЕ бачить кінця за прапорцем без квесту/);
  });
  it('у flags.json нема прапорця завершення розділу 2 (його не поставити без квесту)', () => {
    const flags = JSON.parse(readFileSync(new URL('../../content/flags.json', import.meta.url), 'utf8')) as { id: string }[];
    expect(flags.filter((f) => /chapter\d+[-_]complete/.test(f.id))).toEqual([]);
    expect(luxembourgStamp(r.end.game)).toBe(true);
  });
});

describe('GAME-292 · МУТАЦІЯ «сцена збору не знає погоди»: дощ = мокрий намет', () => {
  function assertWeather(mover: (w: Weather, g: SimState['game']) => Move): void {
    for (const w of WEATHERS) {
      // стан до сцени збору (сцену відкриває режисер), але хід сцени — від перевіреного мовця
      const before = playSchengen(schengenDay(w), 0, 0, 0).sim;
      expect(packDue(before), 'збір попереду').toBe(true);
      const s = readScene(run(before, mover(w, before.game)), PACK_SCENE).nodes;
      if (w === 'rain') { expect(s, 'дощ: мокрий намет').toContain('tent-wet'); expect(s).not.toContain('tent-dry'); expect(s).toContain('open-wet'); }
      else { expect(s, `${w}: сухий намет`).toContain('tent-dry'); expect(s).not.toContain('tent-wet'); expect(s).not.toContain('open-wet'); }
    }
  }
  it('справжній мовець: дощ — мокрий намет, інакше сухий; чужі погоди не плутаються', () => { assertWeather(packMove); });
  it('мутація: сцена завжди «як за сонця» → сторож червоніє', () => {
    expect(() => assertWeather((_w, g) => packMove('sunny', g))).toThrow();
  });
  it('мутація: сцена завжди «мокра» → сторож червоніє', () => {
    expect(() => assertWeather((_w, g) => packMove('rain', g))).toThrow();
  });
});

describe('GAME-292 · з’єднання медальйона досяжне й після раннього виїзду з Шенгену', () => {
  /** Виїхали з набережної до сцени (☰): квест Шенгену завершується сам, половинки видано, але НЕ з’єднано. До збору. */
  function leftEarly(w: Weather): SimState {
    let s = schengenDay(w);
    s = settle(run(s, { type: 'Visit', locationId: SCHENGEN }));
    s = run(s, { type: 'Visit', locationId: MULLERTHAL });
    return direct(s, PACK_SCENE).sim;
  }
  /** Сторож «нічого не лишається нез'єднаним»: після збору медальйон цілий, а половинок нема. `mover` — хід сцени збору. */
  function assertJoined(mover: (w: Weather, g: SimState['game']) => Move): string[] {
    const all: string[] = [];
    for (const w of WEATHERS) {
      const s0 = leftEarly(w);
      expect(halvesUnjoined(s0.game), 'виїхали рано: половинки в рюкзаку, цілого нема').toBe(true);
      expect(has(s0, MEDALLION)).toBe(0);
      expect(packDue(s0)).toBe(true);
      const sc = readScene(run(s0, mover(w, s0.game)), PACK_SCENE, (id) => (id === 'late' ? 1 : 0));
      all.push(sc.nodes.join('>'));
      const done = direct(sc.sim).sim;
      expect([has(done, MEDALLION), has(done, MEDALLION_HALF1), has(done, MEDALLION_HALF2)], `${w}: медальйон цілий після збору`).toEqual([1, 0, 0]);
    }
    return all;
  }
  it('справжня сцена: пропонує з’єднати («late»), вибір ставить прапорець, режисер шле JoinItems — медальйон цілий за кожної погоди', () => {
    const nodes = assertJoined(packMove);
    for (const p of nodes) expect(p).toContain('late');
    for (const p of nodes) expect(p).toContain('joined-late');
  });
  it('мутація: сцена не знає про нез’єднані половинки (факт відсутній) → сторож червоніє', () => {
    expect(() => assertJoined((w) => ({ type: 'StartScene', sceneId: PACK_SCENE, facts: w === 'rain' ? [PACK_WET_FLAG] : [] }) as Move)).toThrow();   // той самий мовець, але без факту «половинки не з'єднані»
  });
  it('вибір «з’єднати» не шле JoinItems із однією половинкою: ядро відхиляє (GAME-291), режисер мовчить', () => {
    const s0 = leftEarly('sunny');
    const one = { ...s0, game: { ...s0.game, inventory: { ...s0.game.inventory, [MEDALLION_HALF1]: 0 }, flags: [...s0.game.flags, 'f.ch2-medallion-join'].sort() } };
    expect(storyMoves(one, GAME_DEFS).some((m) => m.type === 'JoinItems')).toBe(false);
    expect(halvesUnjoined(one.game)).toBe(false);
  });
});

describe('GAME-292 · розділ ніколи не блокується', () => {
  it('гравець поза кемпінгом без сцени збору (поїхав на стежку): крок збору завершується сам, розділ іде до дому', () => {
    const pending = playSchengen(schengenDay('sunny'), 0, 0, 0).sim;
    expect(packDue(pending)).toBe(true);
    expect(packFinishMove(pending), 'у кемпінгу режисер чекає сцену й нічого не завершує').toBeNull();
    const away = settle(run(pending, { type: 'Visit', locationId: 'loc.trail.official' }));
    expect(packDue(away), 'поза кемпінгом сцена не відкривається').toBe(false);
    expect(packFinishMove(away)).toEqual({ type: 'CompleteQuest', questId: PACK_QUEST });
    const d = direct(away);
    expect(d.sim.game.quests[PACK_QUEST]?.status).toBe('completed');
    expect(d.sim.game.quests[CHAPTER2_END]?.status, 'квест-кінець відкрито — авто везе додому').toBe('active');
    expect(ch2CarTrips(d.sim.game)).toEqual([[{ type: 'Visit', locationId: HOME }]]);
    expect(d.sim.journal.some((e) => e.type === 'StartScene' && e.ref === PACK_SCENE)).toBe(false);
  });
  it('до ранку дня 3 і до кінця Шенгену сцена збору не відкривається; розділ 1 її не бачить', () => {
    const morning = schengenDay('sunny');
    expect(packDue(morning)).toBe(false);
    expect(storyMoves(morning, GAME_DEFS)).toEqual([]);
    expect(packDue(playSchengen(morning, 0, 0, 0).sim)).toBe(true);
  });
  it('за відкритої розмови сцена збору не стартує (одна розмова за раз)', () => {
    const pending = playSchengen(schengenDay('sunny'), 0, 0, 0).sim;
    const opened = direct(pending).sim;
    expect(opened.game.dialogue?.id).toBe(PACK_SCENE);
    expect(packDue(opened)).toBe(false);
    expect(packFinishMove(opened)).toBeNull();
  });
});

describe('GAME-292 · підсумок розділу: рядки лише розділу 2, Атлас із печаткою, тизер розділу 3', () => {
  const r = day3('rain', undefined, 7, 1, 1);
  const ch2Titles = new Set((questsJson as { id: string; titleKey: string }[]).filter((q) => q.id.startsWith('CH2-')).map((q) => q.titleKey));
  it('підсумок дня 3: день розділу 3, секції без рядків розділу 1 (ночівля, пакування), квести — лише CH2', () => {
    const { summary } = summaryOffer(r.end, GAME_DEFS);
    expect(summary, 'підсумок є').not.toBeNull();
    expect(summary?.day, 'день 3 розділу 2, а не день гри').toBe(3);
    const kinds = summary?.sections.map((x) => x.kind) ?? [];
    expect(kinds, 'ніч і пакування належать розділу 1 (прапорці без часу)').not.toContain('night');
    expect(kinds).not.toContain('packed');
    for (const sec of summary?.sections ?? []) {
      if (sec.kind === 'quests') for (const k of sec.keys) expect(ch2Titles.has(k), `квест «${k}» — розділу 2`).toBe(true);
      if (sec.kind === 'events') for (const k of sec.keys) expect(k, 'події дороги — лише розділу 2').toMatch(/^ev\.ch2\.|^dlg\.ev\.ch2\./);
    }
    expect(summary?.nextKey, 'кінець розділу: наступної цілі нема').toBeNull();
    process.stdout.write(`GAME-292 summary: day ${summary?.day}; sections ${JSON.stringify(summary?.sections)}; reward ${JSON.stringify(summary?.reward)}\n`);
  });
  it('Атлас: сторінка Люксембургу з печаткою, цілим медальйоном і мікрокартою; нотатка-тизер — лише після завершення розділу', () => {
    const lux = atlasOffer(r.end.game).luxembourg;
    expect(lux).toEqual({ medallion: 'whole', microcard: true, finale: true });
    const mid = atlasOffer(r.mid.game).luxembourg;
    expect(mid, 'до візиту додому тизера нема').toEqual({ medallion: 'whole', microcard: true, finale: false });
    expect(atlasOffer(r.start.game).luxembourg, 'печатка є вже з прибуття (ранок дня 3)').toBeDefined();
    const ch1 = atlasOffer({ ...r.end.game, quests: {} }).luxembourg;
    expect(ch1, 'без квестів розділу 2 печатки нема').toBeUndefined();
    const map = atlasMapModel(atlasOffer(r.end.game), 'menu');
    expect(map.places.map((p) => p.id)).toContain('luxembourg');
    expect(map.places.find((p) => p.id === 'luxembourg')?.state).toBe('stamped');
    expect(map.stamps).toBe(1 + (atlasOffer(r.end.game).pages[0]?.done === true ? 1 : 0));
    expect(atlasMapModel(atlasOffer({ ...r.end.game, quests: {} }), 'menu').places.map((p) => p.id), 'розділ 1: мапа без змін').not.toContain('luxembourg');
  });
  it('картка-«серія» розділу 2: три рядки за прапорцями ядра, слід дідуся (тарт фламбе, Кольмар), кліфхенгер про Ельзас; сторож таблиці', () => {
    const flags = r.end.game.flags;
    const keys = recapKeysCh2(flags);
    expect(keys).toHaveLength(RECAP_LINES);
    expect(keys).toEqual(['ep2.recap.other', 'ep2.recap.medallion', 'ep2.recap.wet']);   // шлях day3: стежка за замовчуванням (інша), з'єднано, дощ
    expect(recapKeysCh2([])).toEqual(['ep2.recap.other', 'ep2.recap.halves', 'ep2.recap.dry']);
    expect(recapKeysCh2(['f.trail-forgotten'])[0]).toBe('ep2.recap.forgotten');
    const lines = episodeLines(flags, 2);
    const T = (l: Record<string, string>, k: string): string => l[k] ?? '';
    const texts = Object.fromEntries(lines.map((x) => [x.text, [T(ukUi as Record<string, string>, x.text), T(enUi as Record<string, string>, x.text)]]));
    expect(episodeProblems(lines, texts)).toEqual([]);
    for (const [k, [u, e]] of Object.entries(texts)) { expect(u, `uk/${k}`).not.toBe(''); expect(e, `en/${k}`).not.toBe(''); }
    expect(texts['ep2.trace']?.[0]).toMatch(/тарт фламбе/i);
    expect(texts['ep2.trace']?.[0]).toMatch(/Кольмар/);
    expect(texts['ep2.next']?.[0]).toMatch(/Ельзас/);
    expect(texts['ep2.next']?.[1]).toMatch(/Alsace/);
    expect(lines.map((x) => x.text)[0]).toBe('ep2.title');
    expect(episodeLines(flags).map((x) => x.text)[0], 'розділ 1 без змін').toBe('ep.title');
    // усі можливі рядки розділу 2 — у обох мовах
    for (const k of ['ep2.recap.forgotten', 'ep2.recap.other', 'ep2.recap.medallion', 'ep2.recap.halves', 'ep2.recap.wet', 'ep2.recap.dry', 'ep2.trace', 'ep2.next', 'ep2.title']) {
      for (const [lang, l] of [['uk', ukUi], ['en', enUi]] as const) { const t = (l as Record<string, string>)[k]; expect(t, `${lang}/${k}`).toBeTruthy(); expect(Array.from(t as string).length, `${lang}/${k}`).toBeLessThanOrEqual(110); }
    }
  });
  it('мутація: картка розділу 2 без слід-рядка про тарт фламбе → сторож таблиці червоніє', () => {
    const lines = episodeLines(r.end.game.flags, 2).filter((x) => x.kind !== 'trace');
    expect(episodeProblems(lines)).toContain('NO_TRACE: no grandpa line');
  });
});

describe('GAME-292 · час дня 3 за моделлю (time-model.ts) і розмір сейва', () => {
  it('день 3 від ранку до кінця: поїздка + Шенген + збір + дорога додому + підсумок + сон + тизер — секунди за моделлю', () => {
    const out: number[] = [];
    for (const w of WEATHERS) for (let k = 0; k < 4; k++) {
      const r = day3(w, undefined, k & 1 ? 7 : 0, (k >> 1) & 1, k & 1);
      // після дороги: підсумок дня 3 (читає гравець), «Лягти спати» (сон веде до тизера), тизер — 6 рядків картки й «Далі»
      const tail = SECONDS.summary + moveSeconds({ type: 'Sleep' } as never) + episodeLines(r.end.game.flags, 2).length * SECONDS.line + SECONDS.menuTap;
      out.push(r.seconds + tail);
    }
    const lo = Math.min(...out);
    const hi = Math.max(...out);
    const avg = out.reduce((a, b) => a + b, 0) / out.length;
    process.stdout.write(`GAME-292 day3 model seconds: min ${lo}, max ${hi}, avg ${avg.toFixed(0)} (${(lo / 60).toFixed(1)}–${(hi / 60).toFixed(1)} хв)\n`);
    expect(lo).toBeGreaterThan(120);
    expect(hi).toBeLessThan(420);
  });
  it('сейв після розділу < 500 КБ (байти — в описі PR)', () => {
    resetIds(990_000);
    const r = day3('rain', undefined, 7, 1, 1);
    const bytes = new TextEncoder().encode(serialize(r.end)).length;
    process.stdout.write(`GAME-292 save bytes after chapter 2: ${bytes}\n`);
    expect(bytes).toBeLessThan(500 * 1024);
  });
});

describe('GAME-292 · тексти: пара uk/en, довжина, зміст', () => {
  const RAW = JSON.parse(readFileSync(new URL('../../content/dialogue/ch2-pack.json', import.meta.url), 'utf8')) as { nodes: { id: string; choices?: unknown[] }[] };
  it('кожен ключ сцени — у uk і en, репліка ≤ 110 знаків', () => {
    for (const x of RAW.nodes) {
      for (const k of [`dlg.ch2-pack.${x.id}`, ...(x.choices ?? []).map((_, i) => `dlg.ch2-pack.${x.id}.c${i + 1}`)]) for (const [lang, l] of [['uk', ukC], ['en', enC]] as const) {
        const t = (l as Record<string, string>)[k];
        expect(t, `${lang}/${k}`).toBeTruthy();
        expect(Array.from(t as string).length, `${lang}/${k}`).toBeLessThanOrEqual(110);
      }
    }
    for (const k of ['dlg.ch2-pack.title', 'ui.ended.ch2', 'ui.endedHint.ch2', 'ui.goal.ended.ch2', 'atlas.place.luxembourg', 'atlas.lux.title', 'atlas.lux.stamp', 'atlas.lux.medallion', 'atlas.lux.halves', 'atlas.lux.microcard', 'atlas.lux.note']) {
      const l = k.startsWith('dlg.') ? [ukC, enC] : [ukUi, enUi];
      for (const x of l) expect((x as Record<string, string>)[k], k).toBeTruthy();
    }
  });
  it('сцена знає обидва прапорці з реєстру й має обидві гілки погоди', () => {
    const nodes = Object.keys(NODES_OF(PACK_SCENE));
    for (const id of ['open', 'open-wet', 'tent-dry', 'tent-wet', 'late', 'joined-late', 'farewell', 'road']) expect(nodes, id).toContain(id);
  });
});

describe('GAME-292 · сейви перед збором для e2e (tests/e2e/fixtures/ch2-pack-<погода>.json) і розмір', () => {
  for (const w of ['sunny', 'rain'] as const) {
    const file = new URL(`../../tests/e2e/fixtures/ch2-pack-${w}.json`, import.meta.url);
    it(`сейв «після Шенгену, збір попереду, ${w}» = те, що ядро збирає зараз (G292_WRITE=1 переписує); < 500 КБ`, () => {
      resetIds(992_000);   // ідентифікатори команд у сейві не залежать від порядку інших тестів
      const sim = playSchengen(schengenDay(w), 0, 0, 0).sim;
      expect(packDue(sim), 'збір попереду').toBe(true);
      const json = `${serialize(sim)}\n`;
      expect(new TextEncoder().encode(json).length, 'сейв < 500 КБ').toBeLessThan(500 * 1024);
      if (process.env.G292_WRITE === '1') { writeFileSync(file, json); return; }
      expect(existsSync(file), 'немає фікстури: G292_WRITE=1').toBe(true);
      expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(todayWeather(l.sim)).toBe(w);
      expect(l.sim.game.quests[PACK_QUEST]?.status).toBe('active');
      expect(l.sim.game.quests[SCHENGEN_QUEST]?.status).toBe('completed');
    });
  }
});
