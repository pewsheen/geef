import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("GIF actions only paste and never submit the page", async () => {
  const [contentScript, sidepanelScript, sidepanelHtml] = await Promise.all([
    readFile(new URL("../src/content-script.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/sidepanel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/sidepanel.html", import.meta.url), "utf8"),
  ]);

  assert.match(contentScript, /const pasted = pasteFile\(target, file\)/);
  assert.match(contentScript, /lastEditableInput/);
  assert.match(contentScript, /document\.addEventListener\(\s*"focusin"/);
  assert.doesNotMatch(contentScript, /message\.submit/);
  assert.doesNotMatch(contentScript, /clickSendButton/);
  assert.doesNotMatch(contentScript, /pressEnter/);
  assert.doesNotMatch(sidepanelScript, /previewSend|Sent GIF|submit,/);
  assert.doesNotMatch(sidepanelHtml, /preview-send-button/);
  assert.match(sidepanelScript, /gif-card-paste-button/);
  assert.doesNotMatch(sidepanelScript, /gif-card-copy-button/);
  assert.doesNotMatch(sidepanelHtml, /preview-copy-button/);
});
