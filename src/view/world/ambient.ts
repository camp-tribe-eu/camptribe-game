// GAME-172 «Живий кемпінг» · фонові мешканці табору. ЛИШЕ відображення: не стан ядра, не сейв, без Math.random.
// Позиція мешканця — чиста функція ігрового часу (хвилини годинника ядра, з часткою від accMs): той самий час → та сама клітинка,
// пауза зупиняє й їх. Розклад — цикл «стоїть dwell хв → іде найкоротшим шляхом до наступної точки → стоїть …».
// Шлях рахується BFS по сітці стін МІНУС клітинки цілей взаємодії, тож мешканець не стоїть і не проходить крізь ціль (її тап не закрито).
import { centerOf, findPath, isSolid, tileOf, type Grid, type Pt, type Tile } from './follow';
import type { Dir } from './character';
import type { Key } from '../../i18n';

/** Швидкість мешканців: клітинок за ігрову хвилину (1 хв = 1 с реального часу). 1,5 клітинки/с = 48 px/с — удвічі повільніше за героя (128). */
export const TILES_PER_MIN = 1.5;
/** Герой ближче за стільки пікселів — мешканець кидає репліку. */
export const BARK_RANGE = 80;

export interface Stop { readonly c: number; readonly r: number; readonly dwell: number }
export interface Resident {
  /** id із docs/NARRATIVE_BIBLE.md (npc.nora …). Не в content/npcs.json: вони не квестові, з ними не розмовляють. */
  readonly id: string;
  /** Ключ вигляду в NPC_LOOKS (art.ts). */
  readonly look: string;
  readonly stops: readonly Stop[];
  /** Зсув у циклі, хв — щоб усі не рушали одночасно. */
  readonly phase: number;
  /** Репліки (4–15 слів, голос довідника фраз): ключі src/i18n. */
  readonly barks: readonly Key[];
}

/** Шістеро з біблії (розділ 3, «ще не в контенті»); розклад — за рядком «розклад» біблії, у тоні гри. Клітинки перевіряє ambient.test. */
export const RESIDENTS: readonly Resident[] = [
  { id: 'npc.amina', look: 'amina', phase: 0, barks: ['amb.amina.1', 'amb.amina.2'], stops: [{ c: 15, r: 6, dwell: 45 }, { c: 23, r: 6, dwell: 25 }, { c: 17, r: 7, dwell: 20 }] },
  { id: 'npc.luc', look: 'luc', phase: 40, barks: ['amb.luc.1', 'amb.luc.2'], stops: [{ c: 14, r: 16, dwell: 45 }, { c: 9, r: 12, dwell: 30 }, { c: 17, r: 9, dwell: 25 }] },
  { id: 'npc.nora', look: 'nora', phase: 15, barks: ['amb.nora.1', 'amb.nora.2'], stops: [{ c: 12, r: 8, dwell: 20 }, { c: 27, r: 8, dwell: 30 }, { c: 34, r: 7, dwell: 45 }, { c: 19, r: 13, dwell: 15 }] },
  { id: 'npc.ingrid', look: 'ingrid', phase: 70, barks: ['amb.ingrid.1', 'amb.ingrid.2'], stops: [{ c: 19, r: 10, dwell: 30 }, { c: 21, r: 18, dwell: 60 }, { c: 17, r: 13, dwell: 20 }] },
  { id: 'npc.sarah', look: 'sarah', phase: 25, barks: ['amb.sarah.1', 'amb.sarah.2'], stops: [{ c: 27, r: 9, dwell: 35 }, { c: 22, r: 7, dwell: 15 }, { c: 13, r: 10, dwell: 30 }, { c: 3, r: 5, dwell: 40 }] },
  { id: 'npc.claire', look: 'claire', phase: 55, barks: ['amb.claire.1', 'amb.claire.2'], stops: [{ c: 4, r: 16, dwell: 50 }, { c: 10, r: 19, dwell: 30 }, { c: 17, r: 12, dwell: 25 }] },
];

/** Зони табору: прямокутник (клітинки, включно) і якір — клітинка, до якої ПІШКИ мусить дійти герой зі старту. Читає ambient.test. */
export interface Zone { readonly id: string; readonly c0: number; readonly r0: number; readonly c1: number; readonly r1: number; readonly anchor: Tile }
export const ZONES: readonly Zone[] = [
  { id: 'tents-old', c0: 0, r0: 1, c1: 9, r1: 10, anchor: { c: 1, r: 5 } },
  { id: 'campfire', c0: 1, r0: 3, c1: 5, r1: 6, anchor: { c: 3, r: 5 } },
  { id: 'reception', c0: 13, r0: 3, c1: 17, r1: 6, anchor: { c: 15, r: 6 } },
  { id: 'sanitary', c0: 21, r0: 3, c1: 25, r1: 6, anchor: { c: 23, r: 6 } },
  { id: 'shore', c0: 24, r0: 6, c1: 27, r1: 10, anchor: { c: 27, r: 8 } },
  { id: 'pier', c0: 28, r0: 6, c1: 36, r1: 8, anchor: { c: 35, r: 7 } },
  { id: 'tents-south', c0: 0, r0: 13, c1: 13, r1: 19, anchor: { c: 4, r: 16 } },
  { id: 'forest-path', c0: 18, r0: 8, c1: 19, r1: 15, anchor: { c: 19, r: 13 } },
  { id: 'clearing', c0: 14, r0: 16, c1: 25, r1: 20, anchor: { c: 21, r: 18 } },
];

/** Клітинки, які мешканцям заборонені: цілі взаємодії (тригери й NPC мапи) — сітка стін плюс ці клітинки як стіни. */
export function residentGrid(walls: Grid, spots: readonly Pt[]): Grid {
  const solid = [...walls.solid];
  for (const s of spots) {
    const t = tileOf(walls, s);
    if (t.c >= 0 && t.r >= 0 && t.c < walls.cols && t.r < walls.rows) solid[t.r * walls.cols + t.c] = true;
  }
  return { ...walls, solid };
}

interface Leg { readonly dwell: number; readonly travel: number; readonly path: readonly Tile[] }
export interface Timeline { readonly resident: Resident; readonly cycle: number; readonly legs: readonly Leg[] }

/** Розклад мешканця: для кожної точки — стоянка й шлях до наступної (по колу). null — якоїсь точки не досягти (мапа зламана): тест червоніє. */
export function buildTimeline(grid: Grid, resident: Resident): Timeline | null {
  const legs: Leg[] = [];
  const n = resident.stops.length;
  for (let i = 0; i < n; i++) {
    const a = resident.stops[i] as Stop;
    const b = resident.stops[(i + 1) % n] as Stop;
    const path = findPath(grid, { c: a.c, r: a.r }, { c: b.c, r: b.r });
    if (!path) return null;
    legs.push({ dwell: a.dwell, travel: (path.length - 1) / TILES_PER_MIN, path });
  }
  return { resident, cycle: legs.reduce((s, l) => s + l.dwell + l.travel, 0), legs };
}

export interface Placed { readonly x: number; readonly y: number; readonly moving: boolean; readonly dir: Dir }

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));

/** Де мешканець о `minutes` ігрових хвилин (дробове число). Чиста функція: ні випадковості, ні стану. */
export function placeAt(grid: Grid, tl: Timeline, minutes: number): Placed {
  let m = (((minutes + tl.resident.phase) % tl.cycle) + tl.cycle) % tl.cycle;
  for (const leg of tl.legs) {
    const first = leg.path[0] as Tile;
    const here = centerOf(grid, first);
    if (m < leg.dwell) return { ...here, moving: false, dir: 'down' };
    m -= leg.dwell;
    if (m < leg.travel) {
      const along = (m / leg.travel) * (leg.path.length - 1);
      const i = Math.min(Math.floor(along), leg.path.length - 2);
      const a = centerOf(grid, leg.path[i] as Tile);
      const b = centerOf(grid, leg.path[i + 1] as Tile);
      const u = along - i;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, moving: true, dir: dirOf(b.x - a.x, b.y - a.y) };
    }
    m -= leg.travel;
  }
  const last = centerOf(grid, tl.legs[0]?.path[0] ?? { c: 0, r: 0 });   // недосяжно: m < cycle; запасний вихід для округлення
  return { ...last, moving: false, dir: 'down' };
}

/** Чи стоїть точка (піксель) на прохідній клітинці сітки стін. */
export const walkableAt = (grid: Grid, p: Pt): boolean => !isSolid(grid, tileOf(grid, p));

