import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ZIP imports use local JSZip with explicit resource limits", async () => {
  const [html, script] = await Promise.all([
    read("../src/sidepanel.html"),
    read("../src/sidepanel.js"),
  ]);

  assert.match(html, /<script src="vendor\/jszip\.min\.js"><\/script>/);
  assert.match(script, /MAX_ZIP_FILE_BYTES/);
  assert.match(script, /MAX_ZIP_ENTRY_COUNT/);
  assert.match(script, /MAX_ZIP_ENTRY_BYTES/);
  assert.match(script, /MAX_ZIP_TOTAL_BYTES/);
  assert.match(script, /entry\.internalStream\("uint8array"\)/);
  assert.match(script, /hasGifSignature\(bytes\)/);
  assert.doesNotMatch(script, /new DecompressionStream/);
});
