import test from "node:test";
import assert from "node:assert/strict";

import {
  detectMediaMimeType,
  hasGifSignature,
} from "../src/media-signature.ts";

const ascii = (value) => new TextEncoder().encode(value);

test("detects supported image signatures", () => {
  assert.equal(hasGifSignature(ascii("GIF89a")), true);
  assert.equal(detectMediaMimeType(ascii("GIF87a")), "image/gif");
  assert.equal(
    detectMediaMimeType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectMediaMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg",
  );
  assert.equal(detectMediaMimeType(ascii("RIFF0000WEBP")), "image/webp");
});

test("detects supported video signatures and rejects unknown data", () => {
  assert.equal(detectMediaMimeType(ascii("0000ftypisom")), "video/mp4");
  assert.equal(
    detectMediaMimeType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])),
    "video/webm",
  );
  assert.equal(detectMediaMimeType(ascii("plain text")), "");
});
