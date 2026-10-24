// GAME-33 · атомарність запису сейву: обрив між put('prev') і put('main') не лишає половинного стану.
// fake-indexeddb у залежностях немає (і не додаємо) — мінімальна пам'яттєва підробка того підмножини IDB,
// яке справді використовує save-store: open/upgrade, transaction, get/put/delete/openCursor, complete/abort.
// Межі підробки (рецензія PR #34): onerror не стріляє (у справжньому IDB помилка запиту → error → abort), а запит після
// автокомміту не кидає TransactionInactiveError. Нинішньому save-store це байдуже (запити синхронно в onsuccess), але
// await усередині транзакції пройшов би тут і впав би в браузері — така зміна потребує e2e, не лише цього тесту.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeIdb, type Fake } from './save-idb-fake.test.helpers';
import { dismissStale, readSaves, readStale, writeSave, writeStale } from './save-store';

let fake: Fake;
beforeEach(() => { fake = installFakeIdb(); });
afterEach(() => { delete (globalThis as { indexedDB?: unknown }).indexedDB; });

describe('сховище сейвів: ротація main/prev (GAME-33)', () => {
  it('позитивний контроль: звичайний запис — main новий, prev = попередній main, читання у порядку main → prev', async () => {
    expect(await writeSave('A')).toBe(true);
    expect(await writeSave('B')).toBe(true);
    expect(await writeSave('C')).toBe(true);
    expect(fake.data.get('main')).toBe('C');
    expect(fake.data.get('prev')).toBe('B');
    expect(await readSaves()).toEqual(['C', 'B']);
  });

  it('обрив між put(prev) і put(main): відкат — і main, і prev лишаються як були, writeSave = false', async () => {
    await writeSave('OLD-PREV');
    await writeSave('OLD-MAIN');
    expect([fake.data.get('main'), fake.data.get('prev')]).toEqual(['OLD-MAIN', 'OLD-PREV']);

    fake.failPutKey = 'main';
    expect(await writeSave('NEW')).toBe(false);
    fake.failPutKey = null;

    expect(fake.data.get('main')).toBe('OLD-MAIN');
    expect(fake.data.get('prev')).toBe('OLD-PREV');
    // наступне читання повертає старий main першим
    expect(await readSaves()).toEqual(['OLD-MAIN', 'OLD-PREV']);
  });

  it('після невдалого запису наступний вдалий лишається в нормі (ротація не зіпсована)', async () => {
    await writeSave('A');
    await writeSave('B');
    fake.failPutKey = 'main';
    await writeSave('X');
    fake.failPutKey = null;
    expect(await writeSave('C')).toBe(true);
    expect(await readSaves()).toEqual(['C', 'B']);
  });

  it('запис = одна транзакція readwrite (інакше обрив між двома put не відкотився б)', async () => {
    await writeSave('A');
    const before = fake.txCount;
    await writeSave('B');
    expect(fake.txCount - before).toBe(1);
  });

  it('карантин stale:* не чіпається ротацією й обривом запису', async () => {
    await writeStale('{"checksum":"abc"}');
    await writeSave('A');
    fake.failPutKey = 'main';
    await writeSave('B');
    fake.failPutKey = null;
    expect(await readStale()).toEqual(['{"checksum":"abc"}']);
    expect(await dismissStale('{"checksum":"abc"}')).toBe(true);
    expect(await readStale()).toEqual([]);
  });
});
