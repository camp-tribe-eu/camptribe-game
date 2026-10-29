// GAME-179 · розмова з NPC на мапі: що над головою (маркер), куди NPC повертається, коли до нього заговорили. Чисті функції без Phaser —
// сцена лише малює те, що тут вирішено; тести ганяють правила без канви.
import type { Dir } from './world/character';

/** «…» — є про що побалакати; «!» — у NPC є прохання (GAME-180: його можна взяти чи здати, src/content/requests.ts requestMarker). */
export type NpcMarker = 'chat' | 'request';

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
