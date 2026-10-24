// GAME-103: пам'яттєва заглушка «сховища YouTube Playables SDK». Справжнього SDK не викликає, мережі немає:
// лише доводить, що гра не залежить від IndexedDB, і дає тестам другу реалізацію SaveBackend з тим самим контрактом.
// Поведінка збігається з IndexedDB-реалізацією: main/prev, окремий карантин stale:*, атомарність запису.
import type { SaveBackend } from './save-backend';
import { staleKey } from './save-store';

export interface MemoryBackend extends SaveBackend {
  /** Лише для тестів: наступний запис (write/quarantine) невдалий і нічого не змінює — імітація відмови сховища. */
  failNextWrite(): void;
  /** Лише для тестів: сирий вміст слотів. */
  readonly slots: ReadonlyMap<string, string>;
}

export function createMemoryBackend(): MemoryBackend {
  const slots = new Map<string, string>();
  let fail = false;
  const failing = (): boolean => { const f = fail; fail = false; return f; };
  return {
    slots,
    failNextWrite: () => { fail = true; },
    read: async () => [slots.get('main'), slots.get('prev')].filter((x): x is string => typeof x === 'string'),
    write: async (json) => {
      if (failing()) return false;
      const main = slots.get('main');
      if (main !== undefined) slots.set('prev', main);
      slots.set('main', json);
      return true;
    },
    quarantine: async (json) => {
      if (failing()) return false;
      slots.set(staleKey(json), json);
      return true;
    },
    readStale: async () => [...slots.entries()].filter(([k]) => k.startsWith('stale:')).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v),
    dismissStale: async (json) => { slots.delete(staleKey(json)); return true; },
  };
}
