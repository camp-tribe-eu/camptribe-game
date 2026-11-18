// GAME-324 · зразковий день (?sampleDay=1) пише в ОКРЕМУ базу: «Почати знову» там не зачіпає звичайний сейв власника.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { installFakeIdb, type Fake } from './save-idb-fake.test.helpers';
import { saveBackend, useSampleSlot } from './save-backend';

let fake: Fake;
beforeEach(() => { fake = installFakeIdb(); });
afterEach(() => { delete (globalThis as { indexedDB?: unknown }).indexedDB; });

it('слот зразка окремий: запис і повторний запис («Почати знову») не змінюють звичайний main/prev і не читають їх', async () => {
  await saveBackend.write('NORMAL-1');
  await saveBackend.write('NORMAL-2');
  useSampleSlot();
  expect(await saveBackend.read()).toEqual([]);   // звичайного сейву зразок не бачить
  await saveBackend.write('SAMPLE-1');
  await saveBackend.write('SAMPLE-NEW');
  expect([fake.dbs['camplife']?.get('main'), fake.dbs['camplife']?.get('prev')]).toEqual(['NORMAL-2', 'NORMAL-1']);
  expect(fake.dbs['camplife-sample']?.get('main')).toBe('SAMPLE-NEW');
  expect(await saveBackend.read()).toEqual(['SAMPLE-NEW', 'SAMPLE-1']);
});
