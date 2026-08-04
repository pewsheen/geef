import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("media grid exposes an accessible multi-select batch toolbar", async () => {
  const [html, script, styles] = await Promise.all([
    read("../src/sidepanel.html"),
    read("../src/sidepanel.ts"),
    read("../src/sidepanel.css"),
  ]);

  assert.match(html, /id="selectMediaButton"[^>]*aria-pressed="false"/s);
  assert.match(html, /id="batchGroupSelect"/);
  assert.match(html, /id="batchMoveButton"/);
  assert.match(html, /id="batchDeleteButton"/);
  assert.match(script, /selectedIds: new Set\(\)/);
  assert.match(
    script,
    /tile\.setAttribute\("aria-pressed", String\(isSelected\)\)/,
  );
  assert.match(styles, /\.gif-card\.is-selected/);
});

test("batch group moves and deletes use single store transactions", async () => {
  const store = await read("../src/store.ts");

  assert.match(store, /export async function moveMediaToGroup/);
  assert.match(store, /export async function deleteMediaItems/);
  assert.match(store, /transaction\(db, \["gifs", "settings"\], "readwrite"/);
  assert.match(
    store,
    /\["gifs", "blobs", "thumbnails", "settings"\][\s\S]*"readwrite"/,
  );
});
