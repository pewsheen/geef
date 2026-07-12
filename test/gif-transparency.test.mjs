import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { encodeRgbaFramesToGif } from "../src/gif-encoder.ts";

test("clears the canvas before drawing each decoded video frame", async () => {
  const source = await readFile(
    new URL("../src/gif-encoder.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /context\.clearRect\(0, 0, size\.width, size\.height\);\s+context\.drawImage/,
  );
});

test("encodes transparent pixels and restores the background between frames", () => {
  const bytes = encodeRgbaFramesToGif(
    2,
    1,
    [
      {
        rgba: new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]),
        delay: 10,
      },
    ],
    { dither: false, paletteSize: 256 },
  );
  const graphicControl = findSequence(bytes, [0x21, 0xf9, 0x04]);

  assert.notEqual(graphicControl, -1);
  assert.equal(bytes[graphicControl + 3], 0x09);
  assert.equal(bytes[graphicControl + 6], 0x00);

  const imageDescriptor = findSequence(bytes, [0x2c], graphicControl + 8);
  const imageData = readSubBlocks(bytes, imageDescriptor + 11);
  const codes = readNineBitCodes(imageData);

  assert.deepEqual(codes.slice(0, 4), [256, 0, 1, 257]);
});

test("keeps opaque GIF frames non-transparent", () => {
  const bytes = encodeRgbaFramesToGif(
    1,
    1,
    [{ rgba: new Uint8ClampedArray([255, 0, 0, 255]), delay: 10 }],
    { dither: false },
  );
  const graphicControl = findSequence(bytes, [0x21, 0xf9, 0x04]);

  assert.equal(bytes[graphicControl + 3], 0x04);
});

function findSequence(bytes, sequence, start = 0) {
  for (let index = start; index <= bytes.length - sequence.length; index += 1) {
    if (sequence.every((byte, offset) => bytes[index + offset] === byte)) {
      return index;
    }
  }

  return -1;
}

function readSubBlocks(bytes, offset) {
  const result = [];
  let cursor = offset;

  while (bytes[cursor] !== 0) {
    const length = bytes[cursor];
    result.push(...bytes.slice(cursor + 1, cursor + 1 + length));
    cursor += length + 1;
  }

  return result;
}

function readNineBitCodes(bytes) {
  const codes = [];
  let bitBuffer = 0;
  let bitCount = 0;

  for (const byte of bytes) {
    bitBuffer |= byte << bitCount;
    bitCount += 8;

    while (bitCount >= 9) {
      codes.push(bitBuffer & 0x1ff);
      bitBuffer >>= 9;
      bitCount -= 9;
    }
  }

  return codes;
}
