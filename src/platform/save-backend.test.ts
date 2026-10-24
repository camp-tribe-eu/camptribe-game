// GAME-103 · контракт SaveBackend: ті самі перевірки проти обох реалізацій — IndexedDB (сайт) і пам'яттєвої заглушки
// «сховища YouTube SDK». Гра має поводитись однаково на будь-якій: ротація main/prev, відкат при відмові запису,
// карантин stale:*, і повний шлях сесії (запис → нова сесія → відновлення).
import { afterEach, describe, expect, it } from 'vitest';
import { serialize } from '../core/save';
import { newSim, type SimState } from '../core/sim';
import { installFakeIdb } from './save-idb-fake.test.helpers';
import { idbBackend, type SaveBackend } from './save-backend';
import { createMemoryBackend } from './save-memory';
import { createSaveSession, type SessionBridge } from './save-session';

interface Harness { readonly backend: SaveBackend; failNextWrite(): void }
const IMPLS: readonly [name: string, make: () => Harness][] = [
  ['IndexedDB (сайт)', () => { const f = installFakeIdb();
    // Обрив — на одну операцію, як і в заглушки: після неї сховище знову справне.
    const once = <A extends unknown[], R>(op: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => { try { return await op(...a); } finally { f.failPutKey = null; } };
    return { backend: { ...idbBackend, write: once(idbBackend.write), quarantine: once(idbBackend.quarantine) }, failNextWrite: () => { f.failPutKey = 'main'; } };
  }],
  ["пам'ять (заглушка YouTube SDK)", () => { const m = createMemoryBackend(); return { backend: m, failNextWrite: () => m.failNextWrite() }; }],
];
afterEach(() => { delete (globalThis as { indexedDB?: unknown }).indexedDB; });

function bridge(): SessionBridge & { sim: SimState } {
  const b = {
    sim: newSim(1, 0), sent: 0,
    get state() { return b.sim; },
    load(s: SimState) { b.sim = s; },
    restart() { b.sim = newSim(1, 0); },
    setPaused() {},
  };
  return b;
}

describe.each(IMPLS)('контракт SaveBackend: %s', (_n, make) => {
  it('позитивний контроль: main новий, prev = попередній main, читання main → prev', async () => {
    const { backend } = make();
    for (const x of ['A', 'B', 'C']) expect(await backend.write(x)).toBe(true);
    expect(await backend.read()).toEqual(['C', 'B']);
  });

  it('відмова запису: false, а main і prev лишаються як були; наступний запис у нормі', async () => {
    const h = make();
    await h.backend.write('OLD-PREV'); await h.backend.write('OLD-MAIN');
    h.failNextWrite();
    expect(await h.backend.write('NEW')).toBe(false);
    expect(await h.backend.read()).toEqual(['OLD-MAIN', 'OLD-PREV']);
    expect(await h.backend.write('C')).toBe(true);
    expect(await h.backend.read()).toEqual(['C', 'OLD-MAIN']);
  });

  it('порожнє сховище читається як []', async () => {
    expect(await make().backend.read()).toEqual([]);
  });

  it('карантин stale:* не чіпається ротацією й відмовою запису; dismiss прибирає лише свій', async () => {
    const h = make(); const b = h.backend;
    const s1 = '{"checksum":"abc"}'; const s2 = '{"checksum":"def"}';
    await b.quarantine(s1); await b.quarantine(s2);
    await b.write('A'); h.failNextWrite(); await b.write('B');
    expect((await b.readStale()).sort()).toEqual([s1, s2].sort());
    expect(await b.read()).toEqual(['A']);
    expect(await b.dismissStale(s1)).toBe(true);
    expect(await b.readStale()).toEqual([s2]);
  });

  it('повний шлях сесії: запис → нова сесія відновлює стан → карантин видно в наступній сесії', async () => {
    const { backend } = make();
    const content = {};
    const first = bridge();
    const s1 = createSaveSession(first, backend, content);
    await s1.start();
    first.sim = { ...first.sim, finds: 9 };
    expect(await s1.save()).toBe(true);
    const second = bridge();
    await createSaveSession(second, backend, content).start();
    expect(second.sim.finds).toBe(9);
    expect(serialize(second.sim)).toBe(serialize(first.sim));
    await backend.quarantine('{"checksum":"zzz"}');
    const third = bridge();
    const s3 = createSaveSession(third, backend, content);
    await s3.start();
    expect(s3.stale).toBe('{"checksum":"zzz"}');
  });
});
