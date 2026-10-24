// GAME-103 · спільне для тестів сейву: обидві реалізації SaveBackend (IndexedDB через підробку IDB і пам'яттєва
// заглушка «сховища YouTube SDK») і обгортка-шлюз над БУДЬ-ЯКОЮ з них. Шлюз дає тестам сесії той контроль, що
// раніше давала власна підробка (затримати читання, затримати/відхилити карантин, бачити спроби запису), але дані
// лежать у справжній реалізації — тож тести сесії перевіряють і логіку сесії, і саме сховище.
import { idbBackend, type SaveBackend } from './save-backend';
import { installFakeIdb } from './save-idb-fake.test.helpers';
import { createMemoryBackend } from './save-memory';

export interface Harness {
  readonly backend: SaveBackend;
  /** Наступний запис (write/quarantine) — невдалий на рівні сховища: відкат, false. Лише на одну операцію. */
  failNextWrite(): void;
}

export const IMPLS: readonly (readonly [name: string, make: () => Harness])[] = [
  ['IndexedDB (site)', () => {
    const f = installFakeIdb();
    // Обрив — на одну операцію, як і в заглушки: після неї сховище знову справне.
    const once = <A extends unknown[], R>(op: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => { try { return await op(...a); } finally { f.failPutKey = null; } };
    return { backend: { ...idbBackend, write: once(idbBackend.write), quarantine: once(idbBackend.quarantine) }, failNextWrite: () => { f.failPutKey = 'main'; } };
  }],
  ['memory (YouTube SDK stub)', () => { const m = createMemoryBackend(); return { backend: m, failNextWrite: () => m.failNextWrite() }; }],
];

/** Прибрати підробку IDB після тесту (afterEach). */
export const uninstallFakeIdb = (): void => { delete (globalThis as { indexedDB?: unknown }).indexedDB; };

export interface Gated extends SaveBackend {
  /** Справжнє сховище під шлюзом — для перевірки, що саме в ньому лежить. */
  readonly inner: SaveBackend;
  /** Спроби запису (синхронно, у порядку викликів) — і вдалі, і ні. Що записалось, видно через inner.read(). */
  readonly writes: string[];
  /** Порядок завершених операцій карантину: `q:<json>` / `d:<json>`. */
  readonly log: string[];
  /** Відпустити стартове читання (до цього read() чекає — так тести відтворюють гонки старту). */
  release(): void;
  /** Наступний quarantine чекатиме на releaseQuarantine. */
  holdQuarantine(): void;
  /** true — карантин іде в справжнє сховище; false — сховище відмовило (нічого не записано). */
  releaseQuarantine(ok: boolean): void;
  failNextWrite(): void;
  /** Дочекатися всіх операцій сховища і обробників сесії на них. */
  settle(): Promise<void>;
}

/**
 * Шлюз над реалізацією: спершу кладе `slots` у справжнє сховище (prev, потім main — ротація зробить main першим),
 * далі read() стоїть до release(). Інші операції йдуть у справжнє сховище.
 */
export async function gated(h: Harness, slots: readonly string[] = []): Promise<Gated> {
  const inner = h.backend;
  for (const s of [...slots].reverse()) if (!(await inner.write(s))) throw new Error('seed write failed');
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const writes: string[] = [];
  const log: string[] = [];
  const inflight = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => { inflight.add(p); void p.finally(() => inflight.delete(p)); return p; };
  let held = false;
  let releaseQ: ((ok: boolean) => void) | null = null;
  return {
    inner, writes, log, release,
    failNextWrite: () => h.failNextWrite(),
    read: () => track(gate.then(() => inner.read())),
    write: (json) => { writes.push(json); return track(inner.write(json)); },
    quarantine: (json) => {
      const run = async (): Promise<boolean> => { const ok = await inner.quarantine(json); if (ok) log.push(`q:${json}`); return ok; };
      if (!held) return track(run());
      held = false;
      return track(new Promise<boolean>((resolve) => { releaseQ = (ok) => { if (ok) void track(run()).then(resolve); else resolve(false); }; }));
    },
    readStale: () => track(inner.readStale()),
    dismissStale: (json) => track(inner.dismissStale(json).then((ok) => { if (ok) log.push(`d:${json}`); return ok; })),
    holdQuarantine: () => { held = true; },
    releaseQuarantine: (ok) => { const r = releaseQ; releaseQ = null; if (!r) throw new Error('no quarantine is held'); r(ok); },
    async settle() {
      // Операції IDB-підробки — ланцюжки setTimeout; обробники сесії (.then) — мікрозадачі після них.
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 0));
        if (inflight.size === 0) { await new Promise((r) => setTimeout(r, 0)); if (inflight.size === 0) return; }
      }
      throw new Error('storage did not settle');
    },
  };
}
