// GAME-179 · розмова з NPC на мапі: що над головою (маркер), куди NPC повертається, коли до нього заговорили. Чисті функції без Phaser —
// сцена лише малює те, що тут вирішено; тести ганяють правила без канви.
import type { Dir } from './world/character';

/** «…» — є про що побалакати; «!» — у NPC є прохання (дані для GAME-180: завдання від NPC; поки що жоден NPC його не має). */
export type NpcMarker = 'chat' | 'request';

/**
 * Гачок прохань (GAME-180): id NPC, у яких зараз є прохання. Поки порожній — жоден NPC «!» не показує; GAME-180 наповнить його з даних завдань.
 * Сцена вже вміє малювати «!» (tests/e2e/game-179.spec.ts і npc-talk.test.ts доводять правило), тож лишається лише дати дані.
 */
export const REQUEST_NPCS: ReadonlySet<string> = new Set<string>();

/** Ближче за стільки пікселів «…» видно над головою; «!» видно завжди, поки NPC у кадрі (прохання не мусить загубитись у натовпі). */
export const CHAT_MARKER_RANGE = 200;

/**
 * Маркер над NPC. `canTalk` — ядро зараз прийме розмову (NPC тут, відкритий); `hasRequest` — гачок прохань (GAME-180);
 * `dist` — відстань від героя, px. Хто не готовий говорити, не має ніякого маркера: підходити нема до кого.
 */
export function markerFor(canTalk: boolean, hasRequest: boolean, dist: number): NpcMarker | null {
  if (!canTalk) return null;
  if (hasRequest) return 'request';
  return dist <= CHAT_MARKER_RANGE ? 'chat' : null;
}

/** Куди дивиться той, хто стоїть у `from`, коли говорить із тим, хто в `to` (вісь із більшим зсувом; нічия — по вертикалі, як у ходьбі). */
export function facingToward(from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
