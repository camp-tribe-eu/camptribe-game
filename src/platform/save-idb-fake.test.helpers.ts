// GAME-33 · атомарність запису сейву: обрив між put('prev') і put('main') не лишає половинного стану.
// fake-indexeddb у залежностях немає (і не додаємо) — мінімальна пам'яттєва підробка того підмножини IDB,
// яке справді використовує save-store: open/upgrade, transaction, get/put/delete/openCursor, complete/abort.
// Межі підробки (рецензія PR #34): onerror не стріляє (у справжньому IDB помилка запиту → error → abort), а запит після
// автокомміту не кидає TransactionInactiveError. Нинішньому save-store це байдуже (запити синхронно в onsuccess), але
// await усередині транзакції пройшов би тут і впав би в браузері — така зміна потребує e2e, не лише цього тесту.
type Data = Map<string, unknown>;

export interface Fake {
  data: Data;
  /** Ключ, на записі якого транзакція обривається (імітація падіння/вигнання вкладки посеред запису). */
  failPutKey: string | null;
  /** Скільки транзакцій відкрито за весь час — щоб «окремі транзакції» були видимі в тесті. */
  txCount: number;
}

export function installFakeIdb(): Fake {
  const fake: Fake = { data: new Map(), failPutKey: null, txCount: 0 };

  function makeTx(db: object) {
    fake.txCount++;
    // Робоча копія: комміт лише на complete, обрив її викидає — це і є відкат транзакції.
    const work: Data = new Map(fake.data);
    let pending = 0;
    let aborted = false;
    let settled = false;
    const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; onabort: (() => void) | null; objectStore: () => unknown } = {
      oncomplete: null, onerror: null, onabort: null,
      objectStore: () => store,
    };
    const abort = () => {
      if (aborted || settled) return;
      aborted = true;
      setTimeout(() => { settled = true; tx.onabort?.(); }, 0);
    };
    const finishIfIdle = () => {
      if (pending > 0 || aborted || settled) return;
      setTimeout(() => {
        if (pending > 0 || aborted || settled) return;
        settled = true;
        fake.data = work;
        tx.oncomplete?.();
      }, 0);
    };
    function request<T>(op: () => T) {
      const req: { result: T | undefined; onsuccess: (() => void) | null } = { result: undefined, onsuccess: null };
      pending++;
      setTimeout(() => {
        pending--;
        if (!aborted) { req.result = op(); req.onsuccess?.(); }
        finishIfIdle();
      }, 0);
      return req;
    }
    const store = {
      get: (k: string) => request(() => work.get(k)),
      put: (v: unknown, k: string) => request(() => {
        if (fake.failPutKey === k) { abort(); return undefined; }
        work.set(k, v);
        return k;
      }),
      delete: (k: string) => request(() => { work.delete(k); }),
      openCursor: () => {
        const keys = [...work.keys()].sort();
        let i = 0;
        const req: { result: unknown; onsuccess: (() => void) | null } = { result: null, onsuccess: null };
        const next = () => {
          pending++;
          setTimeout(() => {
            pending--;
            const k = keys[i];
            req.result = k === undefined ? null : { key: k, value: work.get(k), continue: () => { i++; next(); } };
            req.onsuccess?.();
            finishIfIdle();
          }, 0);
        };
        next();
        return req;
      },
    };
    void db;
    return tx;
  }

  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const db = { createObjectStore: () => ({}), transaction: () => makeTx(db), close: () => {} };
      const req: { result: typeof db; error: null; onupgradeneeded: (() => void) | null; onsuccess: (() => void) | null; onerror: (() => void) | null } =
        { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => { req.onupgradeneeded?.(); req.onsuccess?.(); }, 0);
      return req;
    },
  };
  return fake;
}

