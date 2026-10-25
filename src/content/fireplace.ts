// GAME-142 · «Вогнище кінця дня 2» (R1-02): точка старту сцени для гачка кінця дня (GAME-141).
//
// Сцена — content/dialogue/ch1-fire.json (власник `scene`, не NPC і не подія в дорозі). Відкриває її команда ядра StartScene,
// яку шле СЮЖЕТ, а не гравець. Стартер каже, що з оголошених фактів сцени правда зараз; ядро ставить їх прапорцями, і вузли
// сцени самі обирають гілку (branches):
//   * вогнище дозволене І вечеря завершена → біля вогнища; інакше — той самий вечір під навісом із ліхтарем;
//   * фото намету справді є → репліки 6 і 12 згадують фото; інакше — заздалегідь написаний варіант без фото.
// Після репліки 7 — вибір гравця: A «Розкажімо по одній хорошій речі» (репліки 8–12) чи B «Давайте просто побудемо тут».
//
// Як стартувати (GAME-141): наприкінці дня 2, ДО підсумку дня, коли розмови немає:
//   step(sim, { kind: 'command', command: startFireplace(nextCommandId(sim.game), { fireAllowed, dinnerDone, photoTaken }) }, ctx)
// Кожен факт — лише з реального стану (правило сцени: не створювати неіснуючий факт). Фото — GAME-140; доки його немає,
// photoTaken: false. Сцена закінчується вузлом `end` (розмова закрита: state.dialogue === null) — далі підсумок дня.
import type { Command } from '../core/commands';

export const FIREPLACE_SCENE = 'dlg.ch1-fire';

/** Факти сцени — рівно `scene.facts` у ch1-fire.json і рядки content/flags.json (звіряє fireplace.test.ts). */
export const FIREPLACE_FACTS = {
  fireAllowed: 'f.fire-allowed',
  dinnerDone: 'f.fire-dinner-done',
  photoTaken: 'f.fire-photo-tent',
} as const;

export interface FireplaceSetup {
  /** Вогнище в цьому місці дозволене й безпечно розпалене (є дрова, правила кемпінгу). */
  readonly fireAllowed: boolean;
  /** Вечеря дня 2 завершена. */
  readonly dinnerDone: boolean;
  /** Метью справді зробив фото намету (GAME-140). */
  readonly photoTaken: boolean;
}

/** Факти, які правдиві для цього вечора, — у порядку FIREPLACE_FACTS. */
export function fireplaceFacts(s: FireplaceSetup): string[] {
  return (Object.keys(FIREPLACE_FACTS) as (keyof FireplaceSetup)[]).filter((k) => s[k]).map((k) => FIREPLACE_FACTS[k]);
}

/** Команда ядра, що відкриває сцену біля вогнища (чи під навісом із ліхтарем). */
export function startFireplace(commandId: string, s: FireplaceSetup): Command {
  return { type: 'StartScene', commandId, sceneId: FIREPLACE_SCENE, facts: fireplaceFacts(s) };
}
