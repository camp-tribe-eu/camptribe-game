// Сховище сейвів у браузері (GAME-33, TD-007): IndexedDB, атомарний запис.
// Одна транзакція пише `main` і переносить попередній `main` у `prev`: обрив посеред запису
// не лишає ні половинного файлу, ні нуля сейвів. Читання: main → якщо зіпсований, prev.

const DB = 'camplife';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
  });
}

export async function writeSave(json: string): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const prev = store.get('main');
      prev.onsuccess = () => {
        if (typeof prev.result === 'string') store.put(prev.result, 'prev');
        store.put(json, 'main');
      };
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
    });
  } catch {
    return false;
  }
}

/** Кандидати для завантаження в порядку довіри: спершу main, потім prev. Перевіряє їх ядро. */
export async function readSaves(): Promise<string[]> {
  try {
    const db = await open();
    return await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const main = store.get('main');
      const prev = store.get('prev');
      tx.oncomplete = () => {
        db.close();
        resolve([main.result, prev.result].filter((x): x is string => typeof x === 'string'));
      };
      tx.onerror = tx.onabort = () => { db.close(); resolve([]); };
    });
  } catch {
    return [];
  }
}
