(() => {
  if (globalThis.__geefLoaded) return;
  globalThis.__geefLoaded = true;

  const EDITABLE_INPUT_SELECTORS = [
    '[data-testid*="message" i][contenteditable="true"]',
    '[data-testid*="chat" i][contenteditable="true"]',
    '[aria-label*="message" i][contenteditable="true"]',
    '[aria-label*="chat" i][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]',
    "textarea",
    'input[type="text"]',
  ];

  const MAX_DATA_URL_LENGTH = 70 * 1024 ** 2;
  let lastEditableInput = isEditable(document.activeElement)
    ? document.activeElement
    : null;

  document.addEventListener(
    "focusin",
    (event) => {
      if (isEditable(event.target)) lastEditableInput = event.target;
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.type !== "GEEF_INSERT_GIF"
    ) {
      return false;
    }

    insertGif(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));

    return true;
  });

  async function insertGif(message) {
    if (
      typeof message.dataUrl !== "string" ||
      !message.dataUrl.startsWith("data:image/gif;base64,") ||
      message.dataUrl.length > MAX_DATA_URL_LENGTH
    ) {
      return { ok: false, reason: "The GIF payload is invalid or too large." };
    }

    const target = findEditableInput();
    if (!target)
      return { ok: false, reason: "No focused editable input was found." };

    target.focus();

    const file = await dataUrlToFile(
      message.dataUrl,
      safeGifFilename(message.filename),
    );
    const pasted = pasteFile(target, file);

    if (!pasted) {
      insertTextFallback(target, message.dataUrl);
    }

    return {
      ok: true,
      pasted,
    };
  }

  function findEditableInput() {
    const active = document.activeElement;
    if (isEditable(active)) return active;

    if (lastEditableInput?.isConnected && isEditable(lastEditableInput)) {
      return lastEditableInput;
    }

    for (const selector of EDITABLE_INPUT_SELECTORS) {
      const found = document.querySelector(selector);
      if (isEditable(found)) return found;
    }

    return null;
  }

  function isEditable(element) {
    if (!element) return false;
    if (element.matches?.('textarea,input[type="text"]')) return true;
    return element.isContentEditable;
  }

  async function dataUrlToFile(dataUrl, filename) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, {
      type: "image/gif",
      lastModified: Date.now(),
    });
  }

  function pasteFile(target, file) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);

      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      });

      if (!event.clipboardData) {
        Object.defineProperty(event, "clipboardData", { value: transfer });
      }

      target.dispatchEvent(event);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function insertTextFallback(target, text) {
    if (target.matches?.('textarea,input[type="text"]')) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      target.value = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
      return;
    }

    document.execCommand("insertText", false, text);
  }

  function safeGifFilename(value) {
    const filename = String(value || "geef.gif")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .slice(0, 120);
    return /\.gif$/i.test(filename) ? filename : `${filename}.gif`;
  }
})();
