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

  const SEND_BUTTON_SELECTORS = [
    '[data-testid*="send" i]',
    '[aria-label*="send" i]',
    'button[type="submit"]',
    'button[title*="send" i]',
  ];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GEEF_INSERT_GIF") return false;

    insertGif(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));

    return true;
  });

  async function insertGif(message) {
    const target = findEditableInput();
    if (!target)
      return { ok: false, reason: "No focused editable input was found." };

    target.focus();

    const file = await dataUrlToFile(
      message.dataUrl,
      message.filename || "geef.gif",
    );
    const pasted = pasteFile(target, file);

    if (!pasted) {
      insertTextFallback(target, message.dataUrl);
    }

    if (message.submit) {
      await wait(80);
      clickSendButton() || pressEnter(target);
    }

    return {
      ok: true,
      pasted,
      submitted: Boolean(message.submit),
    };
  }

  function findEditableInput() {
    const active = document.activeElement;
    if (isEditable(active)) return active;

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

  function clickSendButton() {
    for (const selector of SEND_BUTTON_SELECTORS) {
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement && !button.disabled) {
        button.click();
        return true;
      }
    }

    return false;
  }

  function pressEnter(target) {
    const init = {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
    };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
