import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createMediaChecksumIndex,
  createMediaChecksum,
  findExactMediaChecksum,
  findSourceMediaChecksum,
  indexMediaChecksumRecord,
  MEDIA_CHECKSUM_ALGORITHM,
  mediaChecksumImportDecision,
  mediaChecksumKey,
  normalizeMediaChecksum,
  removeMediaChecksumRecord,
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

test("finds a video by either stored bytes or its pre-conversion source", () => {
  const sourceChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "1".repeat(64),
  };
  const convertedChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "2".repeat(64),
  };
  const original = { id: "original", checksum: sourceChecksum };
  const converted = {
    id: "converted",
    checksum: convertedChecksum,
    sourceChecksum,
  };
  const index = createMediaChecksumIndex([original, converted]);

  assert.equal(findSourceMediaChecksum(index, sourceChecksum), original);
  assert.equal(findExactMediaChecksum(index, convertedChecksum), converted);
  assert.equal(
    findExactMediaChecksum(index, convertedChecksum, {
      excludeId: converted.id,
    }),
    null,
  );

  const convertedOnlyIndex = createMediaChecksumIndex([converted]);
  assert.equal(
    findSourceMediaChecksum(convertedOnlyIndex, sourceChecksum),
    converted,
  );
});

test("updates checksum indexes when an existing item is overwritten", () => {
  const oldChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "3".repeat(64),
  };
  const nextChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "4".repeat(64),
  };
  const oldRecord = { id: "item", checksum: oldChecksum };
  const nextRecord = {
    ...oldRecord,
    checksum: nextChecksum,
    sourceChecksum: oldChecksum,
  };
  const index = createMediaChecksumIndex([oldRecord]);

  removeMediaChecksumRecord(index, oldRecord);
  indexMediaChecksumRecord(index, nextRecord);

  assert.equal(findExactMediaChecksum(index, oldChecksum), null);
  assert.equal(findExactMediaChecksum(index, nextChecksum), nextRecord);
  assert.equal(findSourceMediaChecksum(index, oldChecksum), nextRecord);
});

test("honors explicit add and distinguishes exact from source matches", () => {
  const sourceChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "5".repeat(64),
  };
  const convertedChecksum = {
    algorithm: MEDIA_CHECKSUM_ALGORITHM,
    digest: "6".repeat(64),
  };
  const converted = {
    id: "converted",
    checksum: convertedChecksum,
    sourceChecksum,
  };
  const index = createMediaChecksumIndex([converted]);

  assert.deepEqual(mediaChecksumImportDecision(index, convertedChecksum), {
    action: "skip",
    matchKind: "exact",
    record: converted,
  });
  assert.deepEqual(mediaChecksumImportDecision(index, sourceChecksum), {
    action: "prompt",
    matchKind: "source",
    record: converted,
  });
  assert.deepEqual(
    mediaChecksumImportDecision(index, sourceChecksum, { converting: true }),
    {
      action: "prompt",
      matchKind: "source",
      record: converted,
    },
  );
  assert.deepEqual(
    mediaChecksumImportDecision(index, convertedChecksum, {
      explicitAdd: true,
    }),
    {
      action: "add",
      matchKind: "exact",
      record: converted,
    },
  );
});

test("import UI captures the active group and exposes conversion defaults", async () => {
  const [script, html] = await Promise.all([
    readFile(new URL("../src/sidepanel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/sidepanel.html", import.meta.url), "utf8"),
  ]);

  assert.match(script, /defaultGroup: currentImportGroup\(\)/);
  assert.match(
    script,
    /const currentGroup = contentGroupName\(importRequest\.defaultGroup\)/,
  );
  assert.match(html, /id="generalPanel"/);
  assert.match(html, /id="defaultConvertVideosInput"/);
  assert.match(html, /id="sourceDuplicateDialog"/);
  assert.match(html, /id="sourceDuplicateOverwriteButton"/);
  assert.match(html, /id="sourceDuplicateAddButton"/);
  assert.equal(
    [...script.matchAll(/explicitAdd: prompted && duplicateAction === "add"/g)]
      .length,
    2,
  );
  assert.match(script, /matches the original source for/);
});
