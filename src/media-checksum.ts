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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
