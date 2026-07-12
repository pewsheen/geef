import test from "node:test";
import assert from "node:assert/strict";

import {
  isGifFile,
  isImportableMediaFile,
  isVideoFile,
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

test("keeps GIF detection and rejects unrelated files", () => {
  assert.equal(isGifFile({ name: "reaction.gif", type: "" }), true);
  assert.equal(
    isImportableMediaFile({ name: "recording.webm", type: "video/webm" }),
    true,
  );
  assert.equal(
    isImportableMediaFile({ name: "notes.txt", type: "text/plain" }),
    false,
  );
});
