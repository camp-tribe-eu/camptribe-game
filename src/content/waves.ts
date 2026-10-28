// Хвилі напруги (GAME-170): збирає content/waves.json у форму ядра (WaveDefs). Валідатор (перевірка waves) доводить
// ≥ 2 справи, строки, обидва наслідки, варіанти й безпеку Мії; тут — лише переклад полів. Тексти (textKey) лишаються
// в content/locales — ядру вони не потрібні, їх читає екран.
import type { WaveDef, WaveDefs, WaveTaskDef, WhenDef } from '../core/defs';
import waves from '../../content/waves.json';

interface RawOutcome { textKey: string; effects?: ({ setFlag: string } | { wetGear: boolean })[] }
export interface RawWave {
  id: string; titleKey: string; hookKey: string; stage: string; when?: WhenDef; fallback?: { textKey: string }; allDone?: RawOutcome;
  tasks: { id: string; textKey: string; limitMin: number; leaderOnly?: boolean; animal?: string; when?: WhenDef; targets?: { id: string; safe: boolean }[]; done: RawOutcome; late: RawOutcome }[];
}

const outcome = (o: RawOutcome | undefined) => ({
  effects: (o?.effects ?? []).flatMap((e) => ('setFlag' in e ? [e.setFlag] : [])),
  ...((o?.effects ?? []).some((e) => 'wetGear' in e && e.wetGear) ? { wetGear: true as const } : {}),
});

function wave(w: RawWave): WaveDef {
  return {
    stage: w.stage,
    ...(w.when ? { when: w.when } : {}),
    tasks: w.tasks.map((t): WaveTaskDef => ({
      id: t.id, limitMin: t.limitMin,
      ...(t.leaderOnly === true ? { leaderOnly: true } : {}),
      ...(t.animal !== undefined ? { animal: t.animal } : {}),
      ...(t.when ? { when: t.when } : {}),
      done: outcome(t.done), late: outcome(t.late),
    })),
    ...(w.allDone ? { allDone: outcome(w.allDone) } : {}),
  };
}

export function compileWaves(raw: readonly RawWave[]): WaveDefs {
  return { waves: Object.fromEntries(raw.map((w) => [w.id, wave(w)])) };
}

export const RAW_WAVES: readonly RawWave[] = waves as RawWave[];
export const WAVES: WaveDefs = compileWaves(RAW_WAVES);
/** Хвиля W4 «Вечір на трьох фронтах» (день 2, вечір). Стартує її сюжет (зріз 2); тут — id для стартера й тестів. */
export const WAVE_CH1_EVENING = 'wave.ch1-day2-evening';
/** Зріз 3: W1 «Виїзд о шостій» (пролог, дім), W2 «Небо темнішає» (день 1, зупинка; авто / вело — дві хвилі одного етапу), W3 «Встигнути до зливи» (день 1, табір). */
export const WAVE_CH1_DEPARTURE = 'wave.ch1-home-departure';
export const WAVE_CH1_ROAD = 'wave.ch1-day1-road';
export const WAVE_CH1_ROAD_BIKE = 'wave.ch1-day1-road-bike';
export const WAVE_CH1_ARRIVAL = 'wave.ch1-day1-arrival';
/** GAME-144: W5 «Виїзд з табору» (день 3). */
export const WAVE_CH1_CHECKOUT = 'wave.ch1-day3-checkout';
