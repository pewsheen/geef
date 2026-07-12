import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

test("paste returns to the last editor focused before the side panel", async () => {
  const source = await readFile(
    new URL("../src/content-script.ts", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const pastedEvents = [];
  const body = {
    isContentEditable: false,
    matches: () => false,
  };
  const editor = {
    isConnected: true,
    isContentEditable: true,
    matches: () => false,
    focus() {
      document.activeElement = editor;
    },
    dispatchEvent(event) {
      pastedEvents.push(event);
      return true;
    },
  };
  const document = {
    activeElement: body,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    querySelector: () => null,
  };
  let messageListener;

  class FakeDataTransfer {
    constructor() {
      this.items = { add: (file) => (this.file = file) };
    }
  }

  class FakeClipboardEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  class FakeFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }

  vm.runInNewContext(source, {
    Blob,
    ClipboardEvent: FakeClipboardEvent,
    DataTransfer: FakeDataTransfer,
    File: FakeFile,
    InputEvent: class {},
    chrome: {
      runtime: {
        id: "geef-test",
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
    },
    document,
    fetch: async () => ({ blob: async () => new Blob(["gif"]) }),
    globalThis: {},
  });

  listeners.get("focusin")({ target: editor });
  document.activeElement = body;

  const response = await new Promise((resolve) => {
    messageListener(
      {
        type: "GEEF_INSERT_GIF",
        filename: "reaction.gif",
        dataUrl: "data:image/gif;base64,R0lGODlh",
      },
      { id: "geef-test" },
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.pasted, true);
  assert.equal(document.activeElement, editor);
  assert.equal(pastedEvents.length, 1);
  assert.equal(pastedEvents[0].type, "paste");
  assert.equal(pastedEvents[0].clipboardData.file.name, "reaction.gif");
});
