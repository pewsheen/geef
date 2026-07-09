import { pruneEmptyGroups } from './group-utils.mjs';

const DB_NAME = 'geef';
const DB_VERSION = 2;
const GROUPS_KEY = 'groups';

let dbPromise;

export function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listGifs() {
  const db = await openDb();
  const records = await request(db.transaction('gifs', 'readonly').objectStore('gifs').getAll());
  return records.sort(sortByFavoriteThenRecent);
}

export async function listGroups() {
  const db = await openDb();
  const row = await request(db.transaction('settings', 'readonly').objectStore('settings').get(GROUPS_KEY));
  return Array.isArray(row?.value) ? normalizeGroups(row.value) : [];
}

export async function saveGroups(groups) {
  const db = await openDb();
  const normalized = normalizeGroups(groups);
  await transaction(db, ['settings'], 'readwrite', (stores) => {
    stores.settings.put({ key: GROUPS_KEY, value: normalized });
  });
  return normalized;
}

export async function renameGroup(oldGroup, newGroup) {
  const db = await openDb();
  const from = cleanGroupName(oldGroup);
  const to = cleanGroupName(newGroup);
  if (!from || !to || from === to) return listGroups();

  return transaction(db, ['gifs', 'settings'], 'readwrite', async (stores) => {
    const records = await request(stores.gifs.getAll());
    for (const gif of records) {
      if ((gif.group || 'General') === from) {
        stores.gifs.put({ ...gif, group: to, updatedAt: Date.now() });
      }
    }

    const current = await request(stores.settings.get(GROUPS_KEY));
    const groups = normalizeGroups([...(current?.value || []), to].map((group) => (group === from ? to : group)));
    stores.settings.put({ key: GROUPS_KEY, value: groups.filter((group) => group !== from) });
    return groups;
  });
}

export async function removeGroup(groupName, fallbackGroup = 'General') {
  const db = await openDb();
  const target = cleanGroupName(groupName);
  const fallback = cleanGroupName(fallbackGroup) || 'General';
  if (!target) return listGroups();

  return transaction(db, ['gifs', 'settings'], 'readwrite', async (stores) => {
    const records = await request(stores.gifs.getAll());
    let movedRecords = false;

    for (const gif of records) {
      if ((gif.group || 'General') === target) {
        movedRecords = true;
        stores.gifs.put({ ...gif, group: fallback, updatedAt: Date.now() });
      }
    }

    const current = await request(stores.settings.get(GROUPS_KEY));
    const rawGroups = [...(current?.value || [])].filter((group) => group !== target);
    if (movedRecords) rawGroups.push(fallback);
    const groups = normalizeGroups(rawGroups);
    stores.settings.put({ key: GROUPS_KEY, value: groups });
    return groups;
  });
}

export async function getGifBlob(id) {
  const db = await openDb();
  const row = await request(db.transaction('blobs', 'readonly').objectStore('blobs').get(id));
  return row?.blob || null;
}

export async function saveGif(record, blob) {
  const db = await openDb();
  await transaction(db, ['gifs', 'blobs', 'settings'], 'readwrite', async (stores) => {
    stores.gifs.put(record);
    stores.blobs.put({ id: record.id, blob });

    const current = await request(stores.settings.get(GROUPS_KEY));
    const groups = normalizeGroups([...(current?.value || []), record.group || 'General']);
    stores.settings.put({ key: GROUPS_KEY, value: groups });
  });
  return record;
}

export async function updateGif(id, patch) {
  const db = await openDb();
  return transaction(db, ['gifs', 'settings'], 'readwrite', async (stores) => {
    const current = await request(stores.gifs.get(id));
    if (!current) throw new Error('GIF not found');
    const next = { ...current, ...patch, updatedAt: Date.now() };
    stores.gifs.put(next);

    if (patch.group && patch.group !== current.group) {
      const records = await request(stores.gifs.getAll());
      const currentGroups = await request(stores.settings.get(GROUPS_KEY));
      const nextRecords = records.map((gif) => (gif.id === id ? next : gif));
      const groups = pruneEmptyGroups([...(currentGroups?.value || []), patch.group], nextRecords);
      stores.settings.put({ key: GROUPS_KEY, value: groups });
    }

    return next;
  });
}

export async function touchGif(id) {
  const db = await openDb();
  return transaction(db, ['gifs'], 'readwrite', async (stores) => {
    const current = await request(stores.gifs.get(id));
    if (!current) return null;
    const next = {
      ...current,
      useCount: (current.useCount || 0) + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now()
    };
    stores.gifs.put(next);
    return next;
  });
}

export async function deleteGif(id) {
  const db = await openDb();
  await transaction(db, ['gifs', 'blobs', 'settings'], 'readwrite', async (stores) => {
    const records = await request(stores.gifs.getAll());
    const currentGroups = await request(stores.settings.get(GROUPS_KEY));
    stores.gifs.delete(id);
    stores.blobs.delete(id);

    const groups = pruneEmptyGroups(currentGroups?.value || [], records.filter((gif) => gif.id !== id));
    stores.settings.put({ key: GROUPS_KEY, value: groups });
  });
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function bytesToHuman(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** order).toFixed(order ? 1 : 0)} ${units[order]}`;
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);

    open.onupgradeneeded = () => {
      const db = open.result;

      if (!db.objectStoreNames.contains('gifs')) {
        const gifs = db.createObjectStore('gifs', { keyPath: 'id' });
        gifs.createIndex('group', 'group', { unique: false });
        gifs.createIndex('favorite', 'favorite', { unique: false });
        gifs.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  return dbPromise;
}

function request(indexedDbRequest) {
  return new Promise((resolve, reject) => {
    indexedDbRequest.onsuccess = () => resolve(indexedDbRequest.result);
    indexedDbRequest.onerror = () => reject(indexedDbRequest.error);
  });
}

function transaction(db, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
    let callbackResult;

    tx.oncomplete = () => resolve(callbackResult);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));

    Promise.resolve(callback(stores))
      .then((result) => {
        callbackResult = result;
      })
      .catch((error) => {
        tx.abort();
        reject(error);
      });
  });
}

function normalizeGroups(groups) {
  return [...new Set(groups.map(cleanGroupName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function cleanGroupName(value) {
  return (value || '').trim().slice(0, 32);
}

function sortByFavoriteThenRecent(a, b) {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0);
}
