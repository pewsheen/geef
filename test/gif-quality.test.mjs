import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  GIF_QUALITY_FPS,
  gifFrameDelayCentiseconds,
  gifOptionsForQuality,
  normalizeGifQuality,
} from "../src/gif-encoder.ts";

test("GIF quality uses 8, 15, and 25 FPS with medium as the default", () => {
  assert.deepEqual(GIF_QUALITY_FPS, { low: 8, medium: 15, high: 25 });
  assert.deepEqual(gifOptionsForQuality("low"), { fps: 8 });
  assert.deepEqual(gifOptionsForQuality("medium"), { fps: 15 });
  assert.deepEqual(gifOptionsForQuality("high"), { fps: 25 });
  assert.equal(normalizeGifQuality("unknown"), "medium");
  assert.deepEqual(gifOptionsForQuality(null), { fps: 15 });
});

test("GIF frame delays average to the selected rate", () => {
  for (const fps of Object.values(GIF_QUALITY_FPS)) {
    const delays = Array.from({ length: fps }, (_, index) =>
      gifFrameDelayCentiseconds(fps, index),
    );
    assert.ok(delays.every((delay) => delay >= 2));
    assert.equal(
      delays.reduce((total, delay) => total + delay, 0),
      100,
    );
  }
});

test("settings and import dialog offer the same quality choices", async () => {
  const html = await readFile(
    new URL("../src/sidepanel.html", import.meta.url),
    "utf8",
  );
  for (const id of ["defaultGifQualityInput", "mediaImportQuality"]) {
    const select = html.match(
      new RegExp(
        String.raw`<select\b[^>]*\bid="${id}"[^>]*>([\s\S]*?)<\/select>`,
      ),
    );
    assert.ok(select, `Missing ${id}`);
    for (const [quality, fps] of Object.entries(GIF_QUALITY_FPS)) {
      assert.match(
        select[1],
        new RegExp(`value="${quality}"[^>]*>[^<]*${fps} FPS`),
      );
    }
  }
});
