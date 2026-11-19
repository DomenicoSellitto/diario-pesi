// Archivio locale con IndexedDB.
// Per cambiare il formato dei dati: aumentare DB_VERSION e aggiungere un caso
// in upgrade() che trasformi i dati esistenti senza perderli.

export const DB_NAME = 'diario-pesi';
export const DB_VERSION = 1;
export const STORES = ['exercises', 'templates', 'sessions', 'sets', 'boxing', 'meta'];

let dbPromise = null;

function upgrade(db, oldVersion /*, tx */) {
  if (oldVersion < 1) {
    db.createObjectStore('exercises', { keyPath: 'id' });
    const t = db.createObjectStore('templates', { keyPath: 'id' });
    t.createIndex('status', 'status');
    const s = db.createObjectStore('sessions', { keyPath: 'id' });
    s.createIndex('start', 'start');
    const st = db.createObjectStore('sets', { keyPath: 'id' });
    st.createIndex('sessionId', 'sessionId');
    st.createIndex('exerciseId', 'exerciseId');
    const b = db.createObjectStore('boxing', { keyPath: 'id' });
    b.createIndex('date', 'date');
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  // if (oldVersion < 2) { ... migrazione futura ... }
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function all(name) { return wrap((await store(name)).getAll()); }
export async function byIndex(name, index, value) {
  return wrap((await store(name)).index(index).getAll(value));
}
export async function put(name, value) { await wrap((await store(name, 'readwrite')).put(value)); return value; }
export async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) { return put('meta', { key, value }); }

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Cancella tutto e riscrive (usato dall'importazione del backup).
export async function replaceAll(data) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const os = tx.objectStore(name);
      os.clear();
      for (const item of data[name] || []) os.put(item);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dumpAll() {
  const out = {};
  for (const name of STORES) out[name] = await all(name);
  return out;
}
