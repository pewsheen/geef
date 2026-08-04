import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureMediaFilename,
  isGifFile,
  isImageFile,
  isImportableMediaFile,
  isVideoFile,
  mediaKind,
  mediaMimeType,
} from "../src/media-utils.ts";

test("recognizes MP4 and WebM videos by MIME type or extension", () => {
  assert.equal(isVideoFile({ name: "clip", type: "video/mp4" }), true);
  assert.equal(isVideoFile({ name: "clip", type: "video/webm" }), true);
  assert.equal(
    isVideoFile({ name: "recording.WEBM", type: "application/octet-stream" }),
    true,
  );
  assert.equal(
    isVideoFile({ name: "clip.mov", type: "video/quicktime" }),
    false,
  );
});

test("recognizes supported static pictures and GIFs", () => {
  assert.equal(isGifFile({ name: "reaction.gif", type: "" }), true);
  assert.equal(isImageFile({ name: "sticker.PNG", type: "" }), true);
  assert.equal(isImageFile({ name: "photo", type: "image/jpeg" }), true);
  assert.equal(isImageFile({ name: "sticker.webp", type: "" }), true);
  assert.equal(mediaMimeType({ name: "photo.jpg", type: "" }), "image/jpeg");
  assert.equal(mediaKind({ name: "photo.jpg", type: "" }), "image");
});

test("normalizes media filenames and rejects unrelated files", () => {
  assert.equal(
    isImportableMediaFile({ name: "recording.webm", type: "video/webm" }),
    true,
  );
  assert.equal(
    isImportableMediaFile({ name: "notes.txt", type: "text/plain" }),
    false,
  );
  assert.equal(ensureMediaFilename("reaction", "image/png"), "reaction.png");
  assert.equal(
    ensureMediaFilename("unsafe/name.gif", "video/mp4"),
    "unsafe-name.mp4",
  );
});
