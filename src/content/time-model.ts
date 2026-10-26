// Модель часу гравця (GAME-106): скільки РЕАЛЬНИХ хвилин людина проводить у розділі. Бот рахує кроки, а не секунди, а ігровий
// годинник (дорога перемотує десятки «ігрових» хвилин за мить) про час людини не каже нічого. Тому кожен хід має оцінку в
// секундах — за тим, що людина робить на екрані: читає рядок, іде мапою, тисне кнопку.
//
// Оцінки — тимчасові (S0): звіряти з першими живими сесіями (закон 2: число бреше, поки його не розсудив хтось ззовні).
// Чого модель НЕ рахує: вільну прогулянку мапою «просто так», перечитування журналу, паузу. Тож це нижня межа сесії.
import type { CoreDefs } from '../core/defs';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { GameState } from '../core/state';
import { isLuckMove, moves, progressKey, type Move } from './moves';

/** Секунди на одну дію. Кожне число — що саме людина робить за цей час. */
export const SECONDS = {
  /** Вибір персонажа: прочитати 3–6 варіантів (профіль · транспорт · тварина) і обрати. */
  createCharacter: 30,
  /** Екран пакування — раз за день: 9–12 речей, місце в одиницях, кілька натискань. Бот не пакує (пакування не серед ходів), тож додається однією статтею. */
  packing: 45,
  /** Поїхати: натиснути «Піти» й роздивитись нове місце (дорога перемотується миттєво, людина її не чекає). */
  visit: 8,
  /** Дійти мапою до людини чи об'єкта (Еліза, багаття): ~15 с ходи при 128 px/с у межах однієї мапи. */
  walkOnMap: 15,
  /** Один рядок діалогу: прочитати ≤ 140 символів (OD-009) з телефона. */
  line: 3,
  /** Вибрати відповідь: прочитати 2–4 варіанти. Додається до рядка, що відкриється після вибору. */
  choice: 2,
  /** Дія меню на місці (узяти, купити, продати, висушити): знайти кнопку й натиснути. */
  menuTap: 3,
  /** Завершити завдання: прочитати, що виконано, і натиснути. */
  questDone: 5,
  /** Ремонт: обрати інструмент, подивитись результат. */
  repair: 10,
  /** Прочитати підсумок дня. */
  summary: 20,
} as const;

/** Секунди одного ходу бота. Перелік ходів — повний (exhaustive switch): новий тип команди без оцінки не скомпілюється. */
export function moveSeconds(m: Move): number {
  switch (m.type) {
    case 'Visit': return SECONDS.visit;
    case 'Talk': return SECONDS.walkOnMap + SECONDS.line;         // підійти й прочитати перший рядок
    case 'Interact': return SECONDS.walkOnMap + SECONDS.menuTap;
    case 'Continue': return SECONDS.line;                          // наступний рядок (чи закрити розмову)
    case 'Choose': return SECONDS.choice + SECONDS.line;
    case 'RoadEvent': return SECONDS.line;                         // подія в дорозі відкривається рядком
    case 'StartScene': return SECONDS.line;                        // сцена сюжету (GAME-142) — так само
    case 'StartWave': return SECONDS.line;                         // хвиля напруги (GAME-170) відкривається рядком-зачіпкою
    case 'CompleteTask': return SECONDS.walkOnMap + SECONDS.menuTap; // підійти до справи й зробити її
    case 'Pickup': case 'BuyItem': case 'SellItem': case 'DryGear':
    case 'PackItem': case 'UnpackItem': case 'AutoPack':
    case 'BookLeave': case 'CancelLeave':
      return SECONDS.menuTap;
    case 'CompleteQuest': case 'DeclineQuest': return SECONDS.questDone;
    case 'Repair': return SECONDS.repair;
    case 'CreateCharacter': return SECONDS.createCharacter;
    default: { const never: never = m; throw new Error(`time model: no estimate for ${JSON.stringify(never)}`); }
  }
}

/** Разові статті дня, яких бот не робить ходами: вибір персонажа, пакування, підсумок. */
export const DAY_FIXED_SECONDS = SECONDS.createCharacter + SECONDS.packing + SECONDS.summary;

/** Хвилини гравця за послідовність ходів (без вибору персонажа — його додає DAY_FIXED_SECONDS). */
export const minutesOf = (ms: readonly Move[], cost: (m: Move) => number = moveSeconds, fixed = DAY_FIXED_SECONDS): number =>
  (fixed + ms.reduce((a, m) => a + cost(m), 0)) / 60;

/**
 * Найкоротший за часом людини шлях до кінця розділу з `start` (Дейкстра на ходах, без подій-удачі): нижня межа розділу для
 * гравця, що йде просто до мети. null — кінця не знайдено в межах `cap` станів.
 */
export function fastestPath(start: GameState, defs: CoreDefs, cost: (m: Move) => number = moveSeconds, cap = 100_000): Move[] | null {
  const k0 = progressKey(start);
  const dist = new Map<string, number>([[k0, 0]]);
  const prev = new Map<string, { from: string; move: Move }>();
  const states = new Map<string, GameState>([[k0, start]]);
  const done = new Set<string>();
  // GAME-144: розділ триденний — велосипедний простір станів ≈ 100 000; лінійний пошук мінімуму (O(n²)) ішов 6 хв. Двійкова купа
  // з «лінивим» викиданням застарілих записів: O(n log n). Нічия — за ключем (детермінований порядок, як і раніше).
  const heap: { d: number; k: string }[] = [{ d: 0, k: k0 }];
  const less = (a: { d: number; k: string }, b: { d: number; k: string }): boolean => a.d < b.d || (a.d === b.d && a.k < b.k);
  const push = (e: { d: number; k: string }): void => {
    heap.push(e);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!less(heap[i] as { d: number; k: string }, heap[p] as { d: number; k: string })) break;
      [heap[i], heap[p]] = [heap[p] as { d: number; k: string }, heap[i] as { d: number; k: string }];
      i = p;
    }
  };
  const pop = (): { d: number; k: string } | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last !== undefined) {
      heap[0] = last;
      for (let i = 0;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l] as { d: number; k: string }, heap[m] as { d: number; k: string })) m = l;
        if (r < heap.length && less(heap[r] as { d: number; k: string }, heap[m] as { d: number; k: string })) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m] as { d: number; k: string }, heap[i] as { d: number; k: string }];
        i = m;
      }
    }
    return top;
  };
  for (let e = pop(); e !== undefined; e = pop()) {
    const cur = e.k;
    if (done.has(cur) || e.d !== dist.get(cur)) continue;   // застарілий запис купи
    if (done.size > cap) return null;
    done.add(cur);
    const s = states.get(cur) as GameState;
    if (s.campaignEnded) {
      const path: Move[] = [];
      for (let k = cur; prev.has(k); k = (prev.get(k) as { from: string }).from) path.unshift((prev.get(k) as { move: Move }).move);
      return path;
    }
    for (const m of moves(s, defs)) {
      if (isLuckMove(m)) continue;
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
      if (!r.ok) continue;
      const k = progressKey(r.state);
      const d = e.d + cost(m);
      if (k === cur || (dist.has(k) && (dist.get(k) as number) <= d)) continue;
      dist.set(k, d);
      prev.set(k, { from: cur, move: m });
      states.set(k, r.state);
      push({ d, k });
    }
  }
  return null;
}
