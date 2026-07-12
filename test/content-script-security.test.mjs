import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("automatic send is scoped to the focused field composer", async () => {
  const script = await readFile(
    new URL("../src/content-script.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(script, /button\[type=["']submit["']\]/);
  assert.match(script, /function clickSendButton\(target\)/);
  assert.match(script, /target\.closest\?\.\(COMPOSER_SELECTOR\)/);
  assert.match(script, /composer\.querySelector\(selector\)/);
});
