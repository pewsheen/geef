import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("GitHub Actions are pinned to full commit hashes", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/package-extension.yml", import.meta.url),
    "utf8",
  );
  const uses = [...workflow.matchAll(/^\s*uses:\s+([^\s#]+)/gm)].map(
    (match) => match[1],
  );

  assert.ok(uses.length > 0);
  for (const action of uses) {
    assert.match(action, /^[^@\s]+@[0-9a-f]{40}$/);
  }
});
