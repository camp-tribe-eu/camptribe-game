// GAME-313 · спільний ходок героя: УСЯ ходьба (шлях по тайлах мапи табору, кермо клавішами, зупинка, дія) — всередині сторінки, в rAF.
// Чому: кожен обмін Node→браузер під навантаженням коштує 0,5–2 с (кадр гри 60–120 мс), тож рішення «куди далі» ухвалювались на застарілих координатах:
// герой проскакував ціль, клавішу відпускали із запізненням, «найближчий» об'єкт змінювався між кроком і дією (сусід ворушиться). Тут рішення і дія — в тому самому кадрі.
// Замінює локальні копії (walkTo/walk + BFS) у game-112, 172, 180, 184, 221, 230. Закон 1: мутація «ніколи не відпускати клавіші» червонить game-112 (герой не зупиняється в цілі); game-221 вона НЕ червонить —
// той тест перевіряє лише, що герой рухається. Мутація «позначка запізнюється понад 5 с / хибний id позначки» червонить game-180 і 184 (act.markWaitMs).
// Жодних очікувань за часом: межа maxMs — лише страховка від вічного циклу (при спливі кидаємо помилку з останнім знімком, а не чекаємо).
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export const TILE = 32;
export interface Pt { x: number; y: number }
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];

/** Центр клітинки (c, r) у пікселях мапи. */
export const tileCenter = (t: { c: number; r: number }): Pt => ({ x: (t.c + 0.5) * TILE, y: (t.r + 0.5) * TILE });

/** Умова зупинки: усі задані поля мають виконатись разом (І); список умов у `until` — АБО. */
export interface Cond {
  /** Відстань героя до цілі менша за стільки px (по прямій). */
  within?: number;
  /** probe.nearObject дорівнює цьому id. */
  nearObject?: string;
  /** probe.barkBy дорівнює цьому id (репліка звучить саме над ним). */
  barkBy?: string;
  /** true — над кимось звучить репліка (probe.bark !== null). */
  bark?: boolean;
}

export interface WalkOpts {
  /** Для повідомлення про помилку при спливі страховки. */
  label: string;
  /** Нерухома ціль, px мапи. */
  to?: Pt;
  /** Ціль — мешканець або сусід за id: позиція перечитується КОЖНОГО кадру (probe.residents, потім probe.neighbours). */
  toId?: string;
  /** Ціль — найближчий до героя мешканець (перераховується щокадру). */
  toNearest?: 'residents';
  /** Коли зупинитись (АБО між елементами). Без `until` і без `act` ходьба не завершиться — задай одне з двох. */
  until?: Cond[];
  /** Дія в тому самому кадрі, де nearObject === id (і, якщо задано marks, позначка над головою id — одна з marks): клавіша йде в ТОЙ САМИЙ кадр, що й перевірка. */
  act?: { id: string; key: 'Space' | 'KeyE'; marks?: string[]; /** Скільки мс після підходу чекати потрібну позначку (окремий дедлайн, за замовчуванням 5 с); сплив — помилка markMessage. */ markWaitMs?: number; markMessage?: string };
  /** Після умови — дочекатись, поки герой завмер (x, y не міняються 10 кадрів, анімації нема) і умова ще правдива; інакше — рушаємо знову. За замовчуванням так. */
  settle?: boolean;
  /** Страховка, мс (за замовчуванням 70 с). */
  maxMs?: number;
  /** Ключі probe, які знімати КОЖЕН кадр (глибока копія) — для вимірів «по ходу»; повертаються в samples. */
  sample?: string[];
}

export interface WalkResult<P> { at: P; samples: Partial<P>[] }

/** Повести героя в сторінці. Повертає знімок probe в кадрі, де ходьба завершилась (для act — кадр дії), і зрізи кожного кадру, якщо задано `sample`. */
export async function walkInPage<P extends object = Record<string, unknown>>(page: Page, opts: WalkOpts): Promise<WalkResult<P>> {
  if (!opts.until?.length && !opts.act) throw new Error(`${opts.label}: walkInPage без until і без act не має кінця`);
  if (opts.to === undefined && opts.toId === undefined && opts.toNearest === undefined) throw new Error(`${opts.label}: нема цілі (to / toId / toNearest)`);
  const out = await page.evaluate(({ o, walls, width, height, tile }) => new Promise<{ ok: true; at: unknown; samples: unknown[] } | { ok: false; at: unknown; why?: string }>((resolve) => {
    interface Ent { id: string; x: number; y: number }
    interface Pr { playerX: number; playerY: number; playerMoving: boolean; nearObject: string | null; bark: string | null; barkBy: string | null; npcMarks: Record<string, string>; residents: Ent[]; neighbours: Ent[] }
    const g = (window as unknown as { __game: { probe: Pr } }).__game.probe;
    const snap = (): unknown => JSON.parse(JSON.stringify(g));
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, KeyE: 69 };
    const fire = (type: string, k: string): void => {
      const e = new KeyboardEvent(type, { key: k === 'Space' ? ' ' : k, code: k, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => codes[k] });
      window.dispatchEvent(e);
    };
    let held: string | null = null;
    const set = (want: string | null): void => {
      if (held === want) return;
      if (held) fire('keyup', held);
      held = want;
      if (want) fire('keydown', want);
    };
    const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= width || r >= height || (walls[r * width + c] ?? 0) > 0;
    /** Наступна клітинка шляху (BFS по вільних клітинках; клітинка цілі прохідна навіть якщо вона стіна — стаємо впритул). null — вже там або шляху нема. */
    const nextStep = (from: { c: number; r: number }, to: { c: number; r: number }): { c: number; r: number } | null => {
      const key = (c: number, r: number): number => r * width + c;
      const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
      const q = [from];
      for (let i = 0; i < q.length; i++) {
        const t = q[i] as { c: number; r: number };
        if (t.c === to.c && t.r === to.r) {
          const path: number[] = [];
          for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
          const n = path[1];
          return n === undefined ? null : { c: n % width, r: Math.floor(n / width) };
        }
        for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
          const c = t.c + dc; const r = t.r + dr;
          if ((solid(c, r) && !(c === to.c && r === to.r)) || prev.has(key(c, r))) continue;
          prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
        }
      }
      return null;
    };
    const target = (): Ent | Pt | null => {
      if (o.toNearest) {
        let best: Ent | null = null; let bd = Infinity;
        for (const r of g.residents) { const d = Math.hypot(r.x - g.playerX, r.y - g.playerY); if (d < bd) { bd = d; best = r; } }
        return best;
      }
      if (o.toId !== undefined) return g.residents.find((x) => x.id === o.toId) ?? g.neighbours.find((x) => x.id === o.toId) ?? null;
      return o.to ?? null;
    };
    const t0 = performance.now();
    const samples: unknown[] = [];
    let lastX = Number.NaN; let lastY = Number.NaN; let same = 0;
    let nearSince: number | null = null;
    const tick = (): void => {
      if (o.sample) { const s: Record<string, unknown> = {}; for (const k of o.sample) s[k] = JSON.parse(JSON.stringify((g as unknown as Record<string, unknown>)[k] ?? null)); samples.push(s); }
      if (performance.now() - t0 > o.maxMs) { set(null); resolve({ ok: false, at: snap() }); return; }
      const tg = target();
      if (!tg) { set(null); requestAnimationFrame(tick); return; }   // цілі ще нема в кадрі (мешканець не з'явився) — чекаємо кадр
      const dist = Math.hypot(tg.x - g.playerX, tg.y - g.playerY);
      if (o.act && g.nearObject !== o.act.id) nearSince = null;
      // Дія: у ТОМУ САМОМУ кадрі, де щойно переконались, що найближчий — саме він (і позначка над головою потрібна).
      if (o.act && g.nearObject === o.act.id) {
        if (!o.act.marks || o.act.marks.includes(g.npcMarks[o.act.id] ?? '')) {
          set(null);
          const at = snap();
          fire('keydown', o.act.key);
          requestAnimationFrame(() => { fire('keyup', o.act?.key ?? 'Space'); resolve({ ok: true, at, samples }); });
          return;
        }
        // Стоїмо й чекаємо на потрібну позначку, але недовго: окремий дедлайн від моменту підходу (раніше це був expect.poll на 5 с).
        nearSince ??= performance.now();
        if (performance.now() - nearSince > (o.act.markWaitMs ?? 5_000)) { set(null); resolve({ ok: false, at: snap(), why: o.act.markMessage ?? `позначка ${o.act.marks.join('/')} над ${o.act.id} не з'явилась` }); return; }
        set(null); requestAnimationFrame(tick); return;
      }
      const met = (o.until ?? []).some((c) => (c.within === undefined || dist < c.within) && (c.nearObject === undefined || g.nearObject === c.nearObject)
        && (c.barkBy === undefined || g.barkBy === c.barkBy) && (c.bark === undefined || (g.bark !== null) === c.bark));
      same = g.playerX === lastX && g.playerY === lastY && !g.playerMoving ? same + 1 : 0;
      lastX = g.playerX; lastY = g.playerY;
      if (met) {
        set(null);   // відпускаємо в тому самому кадрі, де умова справдилась
        if (!o.settle) { resolve({ ok: true, at: snap(), samples }); return; }
        if (held === null && same >= 10) { resolve({ ok: true, at: snap(), samples }); return; }
        requestAnimationFrame(tick); return;
      }
      // Кермо: у клітинці цілі — до самої точки цілі, інакше — до центру наступної клітинки шляху (спершу вирівнюємось поперек руху, щоб тіло не чіпляло кутів стін).
      const here = { c: Math.floor(g.playerX / tile), r: Math.floor(g.playerY / tile) };
      const there = { c: Math.floor(tg.x / tile), r: Math.floor(tg.y / tile) };
      const tol = o.tol;
      let want: string | null;
      if (here.c === there.c && here.r === there.r) {
        const dx = tg.x - g.playerX; const dy = tg.y - g.playerY;
        want = Math.abs(dx) > tol ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : Math.abs(dy) > tol ? (dy < 0 ? 'ArrowUp' : 'ArrowDown') : null;
      } else {
        const next = nextStep(here, there) ?? there;
        const dx = (next.c + 0.5) * tile - g.playerX; const dy = (next.r + 0.5) * tile - g.playerY;
        const vertical = next.c === here.c;
        const across = vertical ? dx : dy; const along = vertical ? dy : dx;
        const axis = Math.abs(across) > 3 ? across : along;
        const horizontal = Math.abs(across) > 3 ? vertical : !vertical;
        want = horizontal ? (axis < 0 ? 'ArrowLeft' : 'ArrowRight') : (axis < 0 ? 'ArrowUp' : 'ArrowDown');
      }
      set(want);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), {
    o: {
      ...opts,
      settle: opts.act ? false : opts.settle ?? true,
      maxMs: opts.maxMs ?? 70_000,
      // Точність у клітинці цілі: щоб умова within: r була досяжна, крок керма менший за неї (герой стоїть миттєво — інерції нема, але кадр може дати до 8,5 px).
      tol: Math.max(1.5, Math.min(3, Math.min(...(opts.until ?? []).map((c) => c.within ?? Infinity)) / 2.5)),
    },
    walls: WALLS, width: MAP.width, height: MAP.height, tile: TILE,
  });
  if (!out.ok && out.why) throw new Error(`${out.why}: ${JSON.stringify(out.at)}`);
  if (!out.ok) throw new Error(`${opts.label}: герой не дійшов за ${(opts.maxMs ?? 70_000) / 1000} с: ${JSON.stringify(out.at)}`);
  return { at: out.at as P, samples: out.samples as Partial<P>[] };
}
