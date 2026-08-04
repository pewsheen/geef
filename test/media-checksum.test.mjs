import test from "node:test";
import assert from "node:assert/strict";

import {
  createMediaChecksum,
  MEDIA_CHECKSUM_ALGORITHM,
  mediaChecksumKey,
  normalizeMediaChecksum,
} from "../src/media-checksum.ts";

test("creates stable SHA-256 metadata for stored media bytes", async () => {
  const checksum = await createMediaChecksum(new Blob(["hello"]));

  assert.deepEqual(checksum, {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  });
  assert.equal(mediaChecksumKey(checksum), `sha-256:${checksum.digest}`);
});

test("normalizes valid checksum metadata and rejects malformed values", () => {
  const digest = "A".repeat(64);
  assert.deepEqual(normalizeMediaChecksum({ algorithm: "SHA-256", digest }), {
    algorithm: "SHA-256",
    digest: digest.toLowerCase(),
  });
  assert.equal(normalizeMediaChecksum({ algorithm: "SHA-1", digest }), null);
  assert.equal(
    normalizeMediaChecksum({ algorithm: "SHA-256", digest: "not-a-hash" }),
    null,
  );
});
