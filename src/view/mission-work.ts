// GAME-312 · робота місії на місці: гравець дійшов НОГАМИ в зону табору, куди його відправила розмова, — і там відкривається міні-гра каркаса GAME-308.
// Чиста функція стану: жодного таймера; кадри й позицію героя дає сцена (знімок мінімапи, щокадру). Ніхто не перериває розмову: поки вона відкрита — нічого.
import type { GameState } from '../core/state';
import { MISSIONS, type MissionDef, type Trip } from '../content/missions';
import { ZONES } from './world/ambient';

/** Чи клітинка всередині прямокутника зони (без «найближчої»: місце має бути саме тим). */
export function inZone(zoneId: string, c: number, r: number): boolean {
  const z = ZONES.find((x) => x.id === zoneId);
  return z !== undefined && c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1;
}

/** Яку міні-гру місії відкрити зараз; null — жодну. `hero` — позиція героя в плитках (MiniFrame.px/py). */
export function missionWorkDue(g: GameState, hero: { readonly px: number; readonly py: number } | null, map: string, ms: readonly MissionDef[] = MISSIONS): Trip | null {
  if (map !== 'camp' || hero === null || g.dialogue !== null) return null;
  const c = Math.floor(hero.px); const r = Math.floor(hero.py);
  for (const m of ms) {
    if (g.flags.includes(m.doneFlag)) continue;
    const t = m.trips.find((x) => g.flags.includes(x.flag) && g.minigames?.[x.minigame] === undefined && inZone(x.zone, c, r));
    if (t) return t;
  }
  return null;
}
