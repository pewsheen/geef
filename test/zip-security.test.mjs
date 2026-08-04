import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ZIP imports use local JSZip with explicit resource limits", async () => {
  const [html, script, signatures] = await Promise.all([
    read("../src/sidepanel.html"),
    read("../src/sidepanel.ts"),
    read("../src/media-signature.ts"),
  ]);

  assert.doesNotMatch(html, /vendor\/jszip/);
  assert.match(script, /import JSZip from ["']jszip["']/);
  assert.match(script, /MAX_ZIP_FILE_BYTES/);
  assert.match(script, /MAX_ZIP_ENTRY_COUNT/);
  assert.match(script, /MAX_ZIP_ENTRY_BYTES/);
  assert.match(script, /MAX_ZIP_TOTAL_BYTES/);
  assert.match(script, /entry\.internalStream\("uint8array"\)/);
  assert.match(script, /detectMediaMimeType\(bytes\)/);
  assert.match(signatures, /hasGifSignature\(bytes\)/);
  assert.match(script, /LEGACY_ZIP_SCHEMA/);
  assert.match(script, /metadata\.media/);
  assert.doesNotMatch(script, /new DecompressionStream/);
});
