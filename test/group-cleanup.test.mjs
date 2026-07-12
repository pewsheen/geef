import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  cleanGroupName,
  normalizeGroups,
  pruneEmptyGroups,
} from "../src/group-utils.mjs";

test("removes groups that no longer have GIFs", () => {
  const groups = ["Team", "Work", "Reactions"];
  const gifs = [{ group: "Work" }, { group: "Reactions" }];

  assert.deepEqual(pruneEmptyGroups(groups, gifs), ["Reactions", "Work"]);
});

test("normalizes group input before it is persisted", () => {
  assert.deepEqual(normalizeGroups([" Work ", "Team", "Work", "", null]), [
    "Team",
    "Work",
  ]);
  assert.equal(cleanGroupName(123), "123");
});

test("keeps reserved labels out of a pruned group list", () => {
  const groups = ["All", "Favorites", "Work"];
  const gifs = [{ group: "Work" }, { group: "All" }];

  assert.deepEqual(
    pruneEmptyGroups(groups, gifs, { reservedLabels: ["all", "favorites"] }),
    ["Work"],
  );
});

test("main add control only offers GIF and MP4 imports", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../src/sidepanel.html", import.meta.url), "utf8"),
    readFile(new URL("../src/sidepanel.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /accept="image\/gif,video\/mp4,\.gif,\.mp4"/);
  assert.match(
    script,
    /function isVideoFile\(file\) \{\s+return file\.type === 'video\/mp4' \|\| \/\\\.mp4\$\/i\.test\(file\.name\);/,
  );
  assert.doesNotMatch(script, /function isGroupArchiveFile/);
});

test("library scrolling suppresses hover playback and scroll anchoring", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../src/sidepanel.js", import.meta.url), "utf8"),
    readFile(new URL("../src/sidepanel.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    script,
    /libraryScroll\.addEventListener\('scroll', beginLibraryScroll/,
  );
  assert.match(
    script,
    /function playGridGif\(id, image\) \{\s+if \(libraryIsScrolling\) return;/,
  );
  assert.match(css, /\.section-list \{[^}]*overflow-anchor: none;/s);
});
