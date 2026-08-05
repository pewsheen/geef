export const MEDIA_CHECKSUM_ALGORITHM = "SHA-256";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export async function createMediaChecksum(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest(
    MEDIA_CHECKSUM_ALGORITHM,
    bytes,
  );
  return {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: bytesToHex(new Uint8Array(digest)),
  };
}

export function normalizeMediaChecksum(checksum) {
  if (
    checksum?.algorithm !== MEDIA_CHECKSUM_ALGORITHM ||
    typeof checksum.digest !== "string"
  ) {
    return null;
  }

  const digest = checksum.digest.toLowerCase();
  if (!SHA256_HEX_PATTERN.test(digest)) return null;
  return { algorithm: MEDIA_CHECKSUM_ALGORITHM, digest };
}

export function mediaChecksumKey(checksum) {
  const normalized = normalizeMediaChecksum(checksum);
  return normalized
    ? `${normalized.algorithm.toLowerCase()}:${normalized.digest}`
    : "";
}

export function createMediaChecksumIndex(records = []) {
  const index = {
    exact: new Map(),
    sources: new Map(),
  };
  for (const record of records) indexMediaChecksumRecord(index, record);
  return index;
}

export function indexMediaChecksumRecord(index, record) {
  if (!record?.id) return index;
  addIndexedRecord(index.exact, mediaChecksumKey(record.checksum), record);
  addIndexedRecord(
    index.sources,
    mediaChecksumKey(record.sourceChecksum),
    record,
  );
  return index;
}

export function removeMediaChecksumRecord(index, record) {
  if (!record?.id) return index;
  removeIndexedRecord(
    index.exact,
    mediaChecksumKey(record.checksum),
    record.id,
  );
  removeIndexedRecord(
    index.sources,
    mediaChecksumKey(record.sourceChecksum),
    record.id,
  );
  return index;
}

export function findExactMediaChecksum(index, checksum, options = {}) {
  return findIndexedRecord(
    index?.exact,
    mediaChecksumKey(checksum),
    options.excludeId,
  );
}

export function findSourceMediaChecksum(index, checksum, options = {}) {
  const key = mediaChecksumKey(checksum);
  return (
    findIndexedRecord(index?.exact, key, options.excludeId) ||
    findIndexedRecord(index?.sources, key, options.excludeId)
  );
}

export function mediaChecksumImportDecision(index, checksum, options = {}) {
  const key = mediaChecksumKey(checksum);
  const exactMatch = findIndexedRecord(index?.exact, key, options.excludeId);
  if (exactMatch) {
    return {
      action: options.explicitAdd
        ? "add"
        : options.converting
          ? "prompt"
          : "skip",
      matchKind: "exact",
      record: exactMatch,
    };
  }

  const sourceMatch = findIndexedRecord(index?.sources, key, options.excludeId);
  if (sourceMatch) {
    return {
      action: options.explicitAdd ? "add" : "prompt",
      matchKind: "source",
      record: sourceMatch,
    };
  }

  return { action: "add", matchKind: null, record: null };
}

function addIndexedRecord(bucket, key, record) {
  if (!key) return;
  const records = bucket.get(key) || new Map();
  records.set(record.id, record);
  bucket.set(key, records);
}

function removeIndexedRecord(bucket, key, id) {
  if (!key) return;
  const records = bucket.get(key);
  if (!records) return;
  records.delete(id);
  if (!records.size) bucket.delete(key);
}

function findIndexedRecord(bucket, key, excludeId) {
  if (!key) return null;
  for (const record of bucket?.get(key)?.values() || []) {
    if (record.id !== excludeId) return record;
  }
  return null;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
