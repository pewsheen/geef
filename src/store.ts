import {
  cleanGroupName,
  normalizeGroups,
  pruneEmptyGroups,
} from "./group-utils.ts";

const DB_NAME = "geef";
const DB_VERSION = 4;
const DEFAULT_GROUP = "General";
const GROUPS_KEY = "groups";

let dbPromise;

export function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listMedia() {
  const db = await openDb();
  const records = await request(
    db.transaction("gifs", "readonly").objectStore("gifs").getAll(),
  );
  return records.sort(sortByFavoriteThenRecent);
}

export async function listGroups() {
  const db = await openDb();
  const settings = db
    .transaction("settings", "readonly")
    .objectStore("settings");
  return readGroups(settings);
}

export async function getLibraryUsage() {
  const db = await openDb();
  const tx = db.transaction(["gifs", "blobs", "thumbnails"], "readonly");
  const [media, blobs, thumbnails] = await Promise.all([
    request(tx.objectStore("gifs").getAll()),
    request(tx.objectStore("blobs").getAll()),
    request(tx.objectStore("thumbnails").getAll()),
  ]);
  const mediaBytesById = new Map(
    blobs.map((item) => [item.id, item.blob?.size || 0]),
  );
  const thumbnailBytesById = new Map(
    thumbnails.map((item) => [item.id, item.blob?.size || 0]),
  );
  const groups = new Map();

  for (const item of media) {
    const group = item.group || DEFAULT_GROUP;
    const usage = groups.get(group) || {
      group,
      itemCount: 0,
      mediaBytes: 0,
      thumbnailBytes: 0,
      totalBytes: 0,
    };
    usage.itemCount += 1;
    usage.mediaBytes += mediaBytesById.get(item.id) || 0;
    usage.thumbnailBytes += thumbnailBytesById.get(item.id) || 0;
    usage.totalBytes = usage.mediaBytes + usage.thumbnailBytes;
    groups.set(group, usage);
  }

  const mediaBytes = [...mediaBytesById.values()].reduce(
    (total, bytes) => total + bytes,
    0,
  );
  const thumbnailBytes = [...thumbnailBytesById.values()].reduce(
    (total, bytes) => total + bytes,
    0,
  );
  return {
    itemCount: media.length,
    mediaBytes,
    thumbnailBytes,
    totalBytes: mediaBytes + thumbnailBytes,
    groups: [...groups.values()].sort(
      (a, b) => b.totalBytes - a.totalBytes || a.group.localeCompare(b.group),
    ),
  };
}

export async function saveGroups(groups) {
  const db = await openDb();
  return transaction(db, ["settings"], "readwrite", (stores) =>
    writeGroups(stores.settings, groups),
  );
}

export async function getSetting(key) {
  const db = await openDb();
  const row = await request(
    db.transaction("settings", "readonly").objectStore("settings").get(key),
  );
  return row?.value ?? null;
}

export async function saveSetting(key, value) {
  const db = await openDb();
  return transaction(db, ["settings"], "readwrite", (stores) => {
    stores.settings.put({ key, value });
    return value;
  });
}

export async function renameGroup(oldGroup, newGroup) {
  const db = await openDb();
  const from = cleanGroupName(oldGroup);
  const to = cleanGroupName(newGroup);
  if (!from || !to || from === to) return listGroups();

  return transaction(db, ["gifs", "settings"], "readwrite", async (stores) => {
    const records = await request(stores.gifs.getAll());
    for (const gif of records) {
      if ((gif.group || DEFAULT_GROUP) === from) {
        stores.gifs.put({ ...gif, group: to, updatedAt: Date.now() });
      }
    }

    const groups = (await readGroups(stores.settings))
      .map((group) => (group === from ? to : group))
      .filter((group) => group !== from);
    return writeGroups(stores.settings, groups);
  });
}

export async function removeGroup(groupName, fallbackGroup = DEFAULT_GROUP) {
  const db = await openDb();
  const target = cleanGroupName(groupName);
  const fallback = cleanGroupName(fallbackGroup) || DEFAULT_GROUP;
  if (!target) return listGroups();

  return transaction(db, ["gifs", "settings"], "readwrite", async (stores) => {
    const records = await request(stores.gifs.getAll());
    let movedRecords = false;

    for (const gif of records) {
      if ((gif.group || DEFAULT_GROUP) === target) {
        movedRecords = true;
        stores.gifs.put({ ...gif, group: fallback, updatedAt: Date.now() });
      }
    }

    const rawGroups = (await readGroups(stores.settings)).filter(
      (group) => group !== target,
    );
    if (movedRecords) rawGroups.push(fallback);
    return writeGroups(stores.settings, rawGroups);
  });
}

export async function getMediaBlob(id) {
  const db = await openDb();
  const row = await request(
    db.transaction("blobs", "readonly").objectStore("blobs").get(id),
  );
  return row?.blob || null;
}

export async function getMediaThumbnail(id) {
  const db = await openDb();
  const row = await request(
    db.transaction("thumbnails", "readonly").objectStore("thumbnails").get(id),
  );
  return row?.blob || null;
}

export async function saveMediaThumbnail(id, blob) {
  const db = await openDb();
  await transaction(db, ["thumbnails"], "readwrite", (stores) => {
    stores.thumbnails.put({ id, blob });
  });
  return blob;
}

export async function saveMedia(record, blob, thumbnailBlob = null) {
  const db = await openDb();
  await transaction(
    db,
    ["gifs", "blobs", "thumbnails", "settings"],
    "readwrite",
    async (stores) => {
      stores.gifs.put(record);
      stores.blobs.put({ id: record.id, blob });
      if (thumbnailBlob)
        stores.thumbnails.put({ id: record.id, blob: thumbnailBlob });

      const groups = await readGroups(stores.settings);
      writeGroups(stores.settings, [...groups, record.group || DEFAULT_GROUP]);
    },
  );
  return record;
}

export async function saveMediaChecksum(id, checksum) {
  const db = await openDb();
  return transaction(db, ["gifs"], "readwrite", async (stores) => {
    const current = await request(stores.gifs.get(id));
    if (!current) return null;
    const next = { ...current, checksum };
    stores.gifs.put(next);
    return next;
  });
}

export async function updateMedia(id, patch) {
  const db = await openDb();
  return transaction(db, ["gifs", "settings"], "readwrite", async (stores) => {
    const current = await request(stores.gifs.get(id));
    if (!current) throw new Error("Media item not found");
    const next = { ...current, ...patch, updatedAt: Date.now() };
    stores.gifs.put(next);

    if (patch.group && patch.group !== current.group) {
      const records = await request(stores.gifs.getAll());
      const currentGroups = await readGroups(stores.settings);
      const nextRecords = records.map((gif) => (gif.id === id ? next : gif));
      writeGroups(
        stores.settings,
        pruneEmptyGroups([...currentGroups, patch.group], nextRecords),
      );
    }

    return next;
  });
}

export async function moveMediaToGroup(ids, group) {
  const db = await openDb();
  const selectedIds = new Set(ids);
  if (!selectedIds.size) return 0;

  return transaction(db, ["gifs", "settings"], "readwrite", async (stores) => {
    const records = await request(stores.gifs.getAll());
    const currentGroups = await readGroups(stores.settings);
    const now = Date.now();
    let movedCount = 0;
    const nextRecords = records.map((record) => {
      if (
        !selectedIds.has(record.id) ||
        (record.group || DEFAULT_GROUP) === group
      )
        return record;
      const next = { ...record, group, updatedAt: now };
      stores.gifs.put(next);
      movedCount += 1;
      return next;
    });

    writeGroups(
      stores.settings,
      pruneEmptyGroups([...currentGroups, group], nextRecords),
    );
    return movedCount;
  });
}

export async function touchMedia(id) {
  const db = await openDb();
  return transaction(db, ["gifs"], "readwrite", async (stores) => {
    const current = await request(stores.gifs.get(id));
    if (!current) return null;
    const now = Date.now();
    const next = {
      ...current,
      useCount: (current.useCount || 0) + 1,
      lastUsedAt: now,
      updatedAt: now,
    };
    stores.gifs.put(next);
    return next;
  });
}

export async function deleteMedia(id) {
  const db = await openDb();
  await transaction(
    db,
    ["gifs", "blobs", "thumbnails", "settings"],
    "readwrite",
    async (stores) => {
      const records = await request(stores.gifs.getAll());
      const currentGroups = await readGroups(stores.settings);
      stores.gifs.delete(id);
      stores.blobs.delete(id);
      stores.thumbnails.delete(id);

      writeGroups(
        stores.settings,
        pruneEmptyGroups(
          currentGroups,
          records.filter((gif) => gif.id !== id),
        ),
      );
    },
  );
}

export async function deleteMediaItems(ids) {
  const db = await openDb();
  const selectedIds = new Set(ids);
  if (!selectedIds.size) return 0;

  return transaction(
    db,
    ["gifs", "blobs", "thumbnails", "settings"],
    "readwrite",
    async (stores) => {
      const records = await request(stores.gifs.getAll());
      const currentGroups = await readGroups(stores.settings);
      const existingIds = new Set(records.map((record) => record.id));
      let deletedCount = 0;

      for (const id of selectedIds) {
        if (!existingIds.has(id)) continue;
        stores.gifs.delete(id);
        stores.blobs.delete(id);
        stores.thumbnails.delete(id);
        deletedCount += 1;
      }

      writeGroups(
        stores.settings,
        pruneEmptyGroups(
          currentGroups,
          records.filter((record) => !selectedIds.has(record.id)),
        ),
      );
      return deletedCount;
    },
  );
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0,
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
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const order = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** order).toFixed(order ? 1 : 0)} ${units[order]}`;
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);

    open.onupgradeneeded = () => {
      const db = open.result;

      let gifs;
      if (!db.objectStoreNames.contains("gifs")) {
        // Keep the original store name so existing GIF libraries migrate
        // without copying large blobs. Records in it are now media-agnostic.
        gifs = db.createObjectStore("gifs", { keyPath: "id" });
        gifs.createIndex("group", "group", { unique: false });
        gifs.createIndex("favorite", "favorite", { unique: false });
        gifs.createIndex("lastUsedAt", "lastUsedAt", { unique: false });
      } else {
        gifs = open.transaction.objectStore("gifs");
      }

      if (!gifs.indexNames.contains("checksum"))
        gifs.createIndex("checksum", "checksum.digest", { unique: false });

      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("thumbnails")) {
        db.createObjectStore("thumbnails", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
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

async function readGroups(settings) {
  const row = await request(settings.get(GROUPS_KEY));
  return normalizeGroups(Array.isArray(row?.value) ? row.value : []);
}

function writeGroups(settings, groups) {
  const normalized = normalizeGroups(groups);
  settings.put({ key: GROUPS_KEY, value: normalized });
  return normalized;
}

function transaction(db, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((name) => [name, tx.objectStore(name)]),
    );
    let callbackResult;
    let callbackError;

    tx.oncomplete = () => resolve(callbackResult);
    tx.onerror = () => reject(callbackError || tx.error);
    tx.onabort = () =>
      reject(
        callbackError || tx.error || new Error("IndexedDB transaction aborted"),
      );

    Promise.resolve()
      .then(() => callback(stores))
      .then((result) => {
        callbackResult = result;
      })
      .catch((error) => {
        callbackError = error;
        tx.abort();
      });
  });
}

function sortByFavoriteThenRecent(a, b) {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return (
    (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)
  );
}
