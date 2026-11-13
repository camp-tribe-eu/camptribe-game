// GAME-312 · ніч із бурею: сюди сходиться день. Місії сусідів не збоку — кожна щось у цій ночі міняє (docs/DAY-DESIGN.md §1).
//   «Антена» → прогноз почуто заздалегідь: родина готувалась, а не бігала під дощем (а фольга замість паяння глухне від вологи).
//   «Обручка» → Аміна показала, де перед бурею стоїть окунь: гаряча вечеря (а довгі пошуки лишили вечір коротким).
//   «Ліхтар»  → сухі дрова від тата Тімо: вогонь із першого сірника (а навчений Тімо тримає своє світло сам).
// Сцена ночі (власник `scene`, файл у теці діалогів): її гілки читають рівно ці факти. Відкриває сцену команда ядра
// StartScene, яку шле сюжет дня біля озера; стартер каже лише те, що в стані ПРАВДА (правило сцени: не вигадувати фактів).
//
// 🔴 Точка зшивання з GAME-307 (сценарій дня біля озера, на час цієї картки ще не в main). Коли він приїде, ніч живе в його
// сцені вечора, і зшивання — один рядок: його стартер додає `stormFacts(flags)` до свого переліку фактів, а його JSON оголошує
// ті самі шість назв із STORM_FACTS. Контракт навмисно складається з самих рядків-прапорців, щоб той merge не чіпав ні місій, ні
// тестів. Прогнозу дня місія не суперечить: ранок дає НАТЯК («вітер міцнішає»), приймач Люка — ГОДИНУ.
// 🔴 GAME-308 (каркас міні-ігор) на час картки теж не в main: робота в цих місіях — думання (докази, спогади, ритм), а не
// спритність. Коли каркас приїде, «покрутити ручку» й «підняти плиту» стануть його клієнтами, не змінюючи графа розмов.
import type { Command } from '../core/commands';
import { MISSIONS, type MissionDef } from './missions';

export const STORM_SCENE = 'dlg.storm-night';

/** Факти сцени — рівно `scene.facts` у storm-night.json і рядки content/flags.json (звіряє storm-night.test.ts). */
export const STORM_FACTS = {
  warned: 'f.storm-warned',
  radioWeak: 'f.storm-radio-weak',
  fishSupper: 'f.storm-fish-supper',
  lateStart: 'f.storm-late-start',
  dryWood: 'f.storm-dry-wood',
  boyLight: 'f.storm-boy-light',
} as const;

/** Факти ночі, які випливають із прапорців місій. Порядок — як у STORM_FACTS, щоб порівняння в тестах було стабільним. */
export function stormFacts(flags: readonly string[], ms: readonly MissionDef[] = MISSIONS): string[] {
  const links = ms.flatMap((m) => m.night);
  const earned = new Set(links.filter((l) => flags.includes(l.flag)).map((l) => l.fact));
  return Object.values(STORM_FACTS).filter((f) => earned.has(f));
}

/** Хід (без commandId), що відкриває ніч із бурею з наслідками дня — його шле зразковий день (GAME-314): сцена читає ТІ САМІ прапорці, що й camp-night. */
export function stormNightMove(flags: readonly string[], ms: readonly MissionDef[] = MISSIONS): Omit<Extract<Command, { type: 'StartScene' }>, 'commandId'> {
  return { type: 'StartScene', sceneId: STORM_SCENE, facts: stormFacts(flags, ms) };
}

/** Команда ядра, що відкриває ніч із бурею з наслідками дня. */
export function startStormNight(commandId: string, flags: readonly string[], ms: readonly MissionDef[] = MISSIONS): Command {
  return { commandId, ...stormNightMove(flags, ms) };
}
