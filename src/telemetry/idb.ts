/**
 * ตัวห่อ IndexedDB อย่างง่าย — ใช้เป็นที่เก็บคิว event (ทนเน็ตหลุด) และสถานะ session/ความคืบหน้า
 * ไม่ใช้ localStorage เป็นที่เก็บข้อมูลวิจัย
 */
const DB_NAME = 'printlab-m4';
const DB_VERSION = 1;

export const STORES = {
  events: 'events',
  kv: 'kv',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB ไม่พร้อมใช้งาน'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.events)) {
        const store = db.createObjectStore(STORES.events, { keyPath: 'eventId' });
        store.createIndex('sent', 'sent', { unique: false });
        store.createIndex('participantCode', 'participantCode', { unique: false });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.kv)) {
        db.createObjectStore(STORES.kv);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('เปิด IndexedDB ไม่สำเร็จ'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    const tx = db.transaction(STORES.kv, 'readonly');
    return (await wrap(tx.objectStore(STORES.kv).get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORES.kv, 'readwrite');
    await wrap(tx.objectStore(STORES.kv).put(value, key));
  } catch (err) {
    console.warn('kvSet ล้มเหลว', err);
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORES.kv, 'readwrite');
    await wrap(tx.objectStore(STORES.kv).delete(key));
  } catch {
    /* ไม่มีอะไรต้องทำ */
  }
}

export async function putAll(store: string, items: unknown[]): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const it of items) os.put(it);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx error'));
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  try {
    const db = await open();
    const tx = db.transaction(store, 'readonly');
    return (await wrap(tx.objectStore(store).getAll())) as T[];
  } catch {
    return [];
  }
}

export async function getByIndex<T>(store: string, index: string, value: IDBValidKey): Promise<T[]> {
  try {
    const db = await open();
    const tx = db.transaction(store, 'readonly');
    return (await wrap(tx.objectStore(store).index(index).getAll(value))) as T[];
  } catch {
    return [];
  }
}

export async function count(store: string): Promise<number> {
  try {
    const db = await open();
    const tx = db.transaction(store, 'readonly');
    return await wrap(tx.objectStore(store).count());
  } catch {
    return 0;
  }
}

export async function clearStore(store: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  await wrap(tx.objectStore(store).clear());
}
