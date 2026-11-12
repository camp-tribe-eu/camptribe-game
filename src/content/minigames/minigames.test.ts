// GAME-308 · еталонна гра, ключі тексту й сумісність каркаса з трьома наявними діями руками (кілки GAME-189, дрова GAME-190, риболовля GAME-193).
// Закон 1: бот проходить кожен результат; мутація (зайвий дотик, нуль дотиків, вузька смуга) міняє результат — тест це бачить.
import { describe, expect, it } from 'vitest';
import {
  FPS, NORMAL, NO_INPUT, OUTCOMES, RELAXED, canContinue, checkMinigame, closeRun, defineMinigame, openRun, setPaused, startRun, stepRun,
  type AnyMinigame, type Difficulty, type FrameInput, type MinigameRun, type Outcome,
} from '../../core/minigame';
import { LOCALES, type Key } from '../../i18n';
import { moves } from '../moves';
import { dispatch, type Command } from '../../core/commands';
import { initialState } from '../../core/state';
import { play } from '../../core/story.fixture';
import { GAME_DEFS } from '../slice-defs';
import { MINIGAMES, MINIGAME_DEFS, minigameById } from './index';
import { CORE_HALF, REFERENCE, STOPS, markerAt, outcomeFromScore, scoreAt } from './reference';
import { BAND as TENT_BAND, inBand as tentIn, markerAt as tentMarker, startTent, stepTent, type TentState } from '../tent-pitch';
import { BRANCHES, STRIKES, inBand as woodIn, markerAt as woodMarker, startWood, stepWood, woodTarget, type WoodState } from '../wood-chop';
import { FISH_IDLE, fishAt, makeRng, stepFish, type FishState } from '../fishing';

const SOLO = { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as const;
const TAP: FrameInput = { taps: [{ x: 0.5, y: 0.5 }], drag: null };
const HOLD: FrameInput = { taps: [], drag: { x: 0.5, y: 0.5 } };

/** Прогнати гру ботом: bot бачить стан запуску й дає вхід кадру. */
function playOut(def: AnyMinigame, bot: (r: MinigameRun) => FrameInput, d: Difficulty = NORMAL): MinigameRun {
  const results = d === NORMAL ? undefined : { [def.id]: { last: 'scrappy' as const, consequence: 'x', plays: 2, scrappyStreak: 2 } };
  let r = startRun(openRun(def, results, 1));
  while (r.phase === 'play') r = stepRun(def, r, bot(r));
  return r;
}

describe('еталонна гра mg.reference: три результати досяжні', () => {
  /** Торкається, коли маркер у ядрі смуги; не частіше, ніж раз на пів ходу маркера; не більше `max` разів. */
  const centred = (max: number) => {
    let last = -999; let taps = 0;
    return (r: MinigameRun): FrameInput => {
      const s = r.state as { t: number };
      const d = r.difficulty;
      if (taps < max && s.t - last > 30 && Math.abs(markerAt(s.t) - 0.5) <= CORE_HALF * d.bandScale * 0.5) { last = s.t; taps++; return TAP; }
      return NO_INPUT;
    };
  };
  it('good: три влучні дотики', () => {
    const r = playOut(REFERENCE, centred(STOPS));
    expect(r.outcome).toBe('good');
    expect(r.frame).toBeLessThan(r.limit);   // гра закінчилась сама, не межею
  });
  it('fine: два влучні дотики, третього немає — гра йде до межі, результат нормальний', () => {
    const r = playOut(REFERENCE, centred(2));
    expect(r.outcome).toBe('fine');
    expect(r.frame).toBe(r.limit);
  });
  it('scrappy: жодного дотику — гра сама закінчується межею часу, без блоку', () => {
    const r = playOut(REFERENCE, () => NO_INPUT);
    expect(r.outcome).toBe('scrappy');
    expect(r.frame).toBe(r.limit);
    expect(canContinue(r)).toBe(true);
  });
  it('поріг оцінки: 6,5 → good, 4,3 → fine, 2,1,0 → scrappy', () => {
    expect([6, 5, 4, 3, 2, 1, 0].map(outcomeFromScore)).toEqual(['good', 'good', 'fine', 'fine', 'scrappy', 'scrappy', 'scrappy']);
  });
  it('допомога справді полегшує: дотик, що у звичайній грі «мимо», у послабленій — у смузі', () => {
    // відхилення 0,10 від центру: за звичайної смуги (0,16) — 1 бал; ядро (0,06) — не влучно; у допомоги ядро 0,09 — майже, смуга 0,24
    const m = 0.5 + 0.2;   // за межею звичайної смуги, але в смузі допомоги
    expect(scoreAt(m, NORMAL)).toBe(0);
    expect(scoreAt(m, RELAXED)).toBe(1);
  });
  it('допомога: більше кадрів на те саме', () => {
    expect(playOut(REFERENCE, () => NO_INPUT, RELAXED).limit).toBeGreaterThan(playOut(REFERENCE, () => NO_INPUT).limit);
  });
  it('один дотик за кадр — одна зупинка (подвійний дотик у кадрі не дає двох)', () => {
    const twice: FrameInput = { taps: [{ x: 0, y: 0 }, { x: 1, y: 1 }], drag: null };
    const r = stepRun(REFERENCE, startRun(openRun(REFERENCE, undefined, 1)), twice);
    expect((r.state as { scores: number[] }).scores).toHaveLength(1);
  });
  it('лише дотик і перетягування: поверхня гри не читає нічого іншого (тип входу — taps + drag)', () => {
    expect(Object.keys(NO_INPUT).sort()).toEqual(['drag', 'taps']);
  });
});

describe('реєстр і тексти', () => {
  it('id унікальні й знаходяться; каталог ядра збігається з реєстром', () => {
    expect(new Set(MINIGAMES.map((m) => m.id)).size).toBe(MINIGAMES.length);
    for (const m of MINIGAMES) {
      expect(minigameById(m.id)).toBe(m);
      for (const o of OUTCOMES) expect(MINIGAME_DEFS[m.id]?.[o]).toBe(m.outcomes[o].consequence);
    }
  });
  it('усі ключі тексту є і в uk, і в en, непорожні (і вони різні: «сяк-так» не збігається з «добре»)', () => {
    const keys = (m: AnyMinigame): string[] => [m.titleKey, m.introKey, m.hintKey, ...OUTCOMES.map((o) => m.outcomes[o].resultKey)];
    const shell = ['mg.pause', 'mg.resume', 'mg.moveOn', 'mg.start', 'mg.close', 'mg.paused', 'mg.help', 'mg.timeLeft'];
    for (const lang of ['uk', 'en'] as const) {
      for (const k of [...shell, ...MINIGAMES.flatMap(keys)]) expect(LOCALES[lang][k as Key]?.trim(), `${lang} ${k}`).toBeTruthy();
      for (const m of MINIGAMES) expect(new Set(OUTCOMES.map((o) => LOCALES[lang][m.outcomes[o].resultKey as Key])).size).toBe(3);
    }
  });
  it('допомога без докору: тексти допомоги й результату не містять оцінок «програв / невдача / поганий»', () => {
    const shaming = /програ|невдач|погано|поганий|помилк|failed?\b|lose|lost|bad\b|wrong|mistake/i;
    for (const lang of ['uk', 'en'] as const) {
      for (const k of ['mg.help', 'mg.moveOn', 'mg.paused', ...MINIGAMES.flatMap((m) => [m.hintKey, m.outcomes.scrappy.resultKey])]) expect(LOCALES[lang][k as Key], `${lang} ${k}`).not.toMatch(shaming);
    }
  });
});

describe('scrappy не звужує те, що далі можна робити у грі', () => {
  it('набір ходів гри після scrappy такий самий, як без нього (результат міні-гри нічого не замикає)', () => {
    const before = play([SOLO], initialState(0), GAME_DEFS);
    const r = dispatch(before, { type: 'FinishMinigame', commandId: 'mgp1', minigameId: 'mg.reference', outcome: 'scrappy' } as Command, GAME_DEFS);
    expect(r.ok).toBe(true);
    expect(moves(r.state, GAME_DEFS)).toEqual(moves(before, GAME_DEFS));
    expect(moves(before, GAME_DEFS).length).toBeGreaterThan(0);
  });
});

// ───────────── Каркас приймає три наявні дії руками (адаптери — лише тут; продакшн-контенту ці тести не додають) ─────────────
const FRAME_MS = 1000 / FPS;
/** Допомога = «більше часу»: маркер повільніший у timeScale разів. */
const dtOf = (d: Difficulty): number => FRAME_MS / d.timeScale;
const hasTap = (i: FrameInput): boolean => i.taps.length > 0;

const OUTCOMES_OF = (p: string): AnyMinigame['outcomes'] => ({ good: { consequence: `${p}.good`, resultKey: 'mg.ref.result.good' }, fine: { consequence: `${p}.fine`, resultKey: 'mg.ref.result.fine' }, scrappy: { consequence: `${p}.scrappy`, resultKey: 'mg.ref.result.scrappy' } });

/** Кілки (GAME-189): дотик = удар; промахи → нормально / сяк-так. */
const TENT = defineMinigame<TentState, TentState>({
  id: 'mg.hosted-tent', titleKey: 'mg.ref.title', introKey: 'mg.ref.intro', hintKey: 'mg.ref.hint', limitFrames: 60 * FPS, outcomes: OUTCOMES_OF('tent'),
  init: () => stepTent(startTent(0), { kind: 'act', placeOk: true }).state,
  step: (s, i, d) => { const a = hasTap(i) ? stepTent(s, { kind: 'act', placeOk: true }).state : s; return stepTent(a, { kind: 'tick', dtMs: dtOf(d) }).state; },
  done: (s) => s.phase === 'done',
  outcomeOf: (s) => (s.phase !== 'done' ? 'scrappy' : s.misses === 0 ? 'good' : s.misses <= 2 ? 'fine' : 'scrappy'),
  view: (s) => s,
});
/** Дрова (GAME-190): дотик іде в наступну ціль (гілка, колода) і в удар. */
const WOOD = defineMinigame<WoodState, WoodState>({
  id: 'mg.hosted-wood', titleKey: 'mg.ref.title', introKey: 'mg.ref.intro', hintKey: 'mg.ref.hint', limitFrames: 60 * FPS, outcomes: OUTCOMES_OF('wood'),
  init: () => startWood(),
  step: (s, i, d) => {
    let st = s;
    if (hasTap(i)) { const t = woodTarget(st); if (t) st = stepWood(st, { kind: 'act', branch: t.kind === 'branch' ? t.i : null, atBlock: t.kind === 'block' }).state; }
    return stepWood(st, { kind: 'tick', dtMs: dtOf(d) }).state;
  },
  done: (s) => s.phase === 'done',
  outcomeOf: (s) => (s.phase !== 'done' ? 'scrappy' : s.misses === 0 ? 'good' : s.misses <= 2 ? 'fine' : 'scrappy'),
  view: (s) => s,
});
interface FishHost { readonly f: FishState; readonly t: number }
/** Риболовля (GAME-193): утримання = перетягування (down); улов без промахів — добре, після промаху — нормально, без улову — сяк-так. */
const FISH = defineMinigame<FishHost, FishHost>({
  id: 'mg.hosted-fish', titleKey: 'mg.ref.title', introKey: 'mg.ref.intro', hintKey: 'mg.ref.hint', limitFrames: 90 * FPS, outcomes: OUTCOMES_OF('fish'),
  init: () => ({ f: FISH_IDLE, t: 0 }),
  step: (s, i, d) => {
    const rng = makeRng((7 + s.t * 7919) >>> 0);   // випадковість — чиста функція кадру, не прихований стан
    const down = i.drag !== null || hasTap(i);
    const f = s.f.phase === 'choice' ? (hasTap(i) ? stepFish(s.f, { kind: 'choose', keep: false }, rng).state : s.f) : stepFish(s.f, { kind: 'tick', dtMs: dtOf(d), down }, rng).state;
    return { f, t: s.t + 1 };
  },
  done: (s) => s.f.released + s.f.kept > 0,
  outcomeOf: (s) => (s.f.released + s.f.kept === 0 ? 'scrappy' : s.f.slipped + s.f.aways === 0 ? 'good' : 'fine'),
  view: (s) => s,
});

describe('каркас приймає наявні дії руками', () => {
  const HOSTED = [TENT, WOOD, FISH];
  it('кожна оголошує три результати й вкладається в 30–90 с (checkMinigame чистий)', () => {
    for (const h of HOSTED) expect(checkMinigame(h), h.id).toEqual([]);
  });
  it('кілки: влучні дотики → good; один промах → fine; без дотиків → scrappy (і далі пускає)', () => {
    const hit = (r: MinigameRun): FrameInput => { const s = r.state as TentState; return s.phase === 'peg' && tentIn(tentMarker(s.t)) && Math.abs(tentMarker(s.t) - (TENT_BAND.from + TENT_BAND.to) / 2) < 0.06 ? TAP : NO_INPUT; };
    expect(playOut(TENT, hit).outcome).toBe('good');
    let missed = false;
    const oneMiss = (r: MinigameRun): FrameInput => { const s = r.state as TentState; if (!missed && s.t > 100 && !tentIn(tentMarker(s.t))) { missed = true; return TAP; } return hit(r); };
    expect(playOut(TENT, oneMiss).outcome).toBe('fine');
    const none = playOut(TENT, () => NO_INPUT);
    expect(none.outcome).toBe('scrappy');
    expect(canContinue(none)).toBe(true);
  });
  it('дрова: гілки й колода → good; один промах → fine; без дотиків → scrappy', () => {
    const hit = (r: MinigameRun): FrameInput => { const s = r.state as WoodState; return s.phase === 'chop' ? (woodIn(woodMarker(s.t)) ? TAP : NO_INPUT) : s.phase === 'gather' ? TAP : NO_INPUT; };
    const good = playOut(WOOD, hit);
    expect(good.outcome).toBe('good');
    expect((good.state as WoodState).strikes).toBe(STRIKES);
    expect(BRANCHES).toBeGreaterThan(0);
    let missed = false;
    const oneMiss = (r: MinigameRun): FrameInput => { const s = r.state as WoodState; if (!missed && s.phase === 'chop' && !woodIn(woodMarker(s.t))) { missed = true; return TAP; } return hit(r); };
    expect(playOut(WOOD, oneMiss).outcome).toBe('fine');
    expect(playOut(WOOD, () => NO_INPUT).outcome).toBe('scrappy');
  });
  it('риболовля: улов → good; пропущене «клює» і потім улов → fine; без вводу → scrappy', () => {
    /** Бот: утримує, поки шкала не заряджена; відпускає (закид); на «клює» тисне (підсікання; або пропускає раз); у боротьбі тримає зону під рибою; на виборі торкається. */
    const bot = (skipFirstBite: boolean) => {
      return (r: MinigameRun): FrameInput => {
        const f = (r.state as FishHost).f;
        switch (f.phase) {
          case 'idle': return HOLD;
          case 'charge': return f.power < 0.5 ? HOLD : NO_INPUT;
          case 'bite': return skipFirstBite && f.slipped === 0 ? NO_INPUT : HOLD;
          case 'reel': return fishAt(f) > f.zone ? HOLD : NO_INPUT;
          case 'choice': return TAP;
          default: return NO_INPUT;
        }
      };
    };
    const good = playOut(FISH, bot(false));
    expect(good.outcome).toBe('good');
    const fine = playOut(FISH, bot(true));
    expect(fine.outcome).toBe('fine');
    const none = playOut(FISH, () => NO_INPUT);
    expect(none.outcome).toBe('scrappy');
    expect(canContinue(none)).toBe(true);
  });
  it('усі три — через ядро: результат ложиться в стан командою, наслідок з каталогу', () => {
    const defs = { ...GAME_DEFS, minigames: { ...MINIGAME_DEFS, ...Object.fromEntries(HOSTED.map((h) => [h.id, { good: h.outcomes.good.consequence, fine: h.outcomes.fine.consequence, scrappy: h.outcomes.scrappy.consequence }])) } };
    let s = play([SOLO], initialState(0), defs);
    for (const h of HOSTED) {
      const r = dispatch(s, { type: 'FinishMinigame', commandId: `h-${h.id}`, minigameId: h.id, outcome: 'scrappy' } as Command, defs);
      expect(r.ok, h.id).toBe(true);
      s = r.state;
      expect(s.minigames?.[h.id]?.consequence).toBe(h.outcomes.scrappy.consequence);
    }
  });
  it('допомога читається адаптером: те саме без вводу триває довше (більше часу)', () => {
    for (const h of HOSTED) expect(playOut(h, () => NO_INPUT, RELAXED).limit, h.id).toBeGreaterThan(playOut(h, () => NO_INPUT).limit);
  });
  it('закрита гра не оживає: кадри після close нічого не міняють; пауза закритої — ні', () => {
    const r = closeRun(playOut(TENT, () => NO_INPUT));
    expect(r.phase).toBe('closed');
    expect(stepRun(TENT, r, TAP)).toBe(r);
    expect(setPaused(r, true)).toBe(r);
  });
});

export type { Outcome };
