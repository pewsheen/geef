# Geef

A Manifest V3 Chrome extension prototype for keeping a personal GIF wall in the browser and pasting GIFs into editable web inputs.

## What it does

- Opens as a Chrome side panel from the extension toolbar button.
- Stores GIF metadata and GIF blobs in extension-owned IndexedDB.
- Requests persistent browser storage and uses the `unlimitedStorage` permission.
- Imports existing `.gif` files.
- Converts local MP4/WebM/QuickTime videos into animated GIFs in the browser.
- Keeps a group bar at the top for browsing GIF groups.
- Pins favorites above the main library.
- Imports and exports whole GIF groups as ZIP archives with `metadata.json` plus the GIF files.
- Orders GIFs by recently used by default, with recently added and name sort options.
- Lets the user rename, regroup, favorite, paste/send, and remove GIFs.
- Sends GIFs to the active tab by dispatching a paste event with a real `image/gif` File.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder: `D:\Codes\geef`.
5. Open any web app with an editable message/input area, focus the input, then open the extension side panel.

## Storage decision

Use extension-owned IndexedDB for the GIF library. It is better than `chrome.storage.local` for blobs and large files, and it keeps GIFs private to the extension rather than tied to a page origin. The extension also asks Chrome for persistent storage so browser cleanup is less likely to evict the GIF wall.

For a future shared GIF library, keep local IndexedDB as a cache and sync metadata/blob URLs against a server or workspace API.

## Page integration point

The generic page bridge is `src/content-script.js`. It finds the active editable input and dispatches a synthetic paste event containing an `image/gif` File. Many chat and messaging apps handle pasted files this way.

The current generic selectors live in:

- `EDITABLE_INPUT_SELECTORS`
- `SEND_BUTTON_SELECTORS`

If a target app exposes an official plugin/API or upload endpoint, add a small adapter for that app and keep the generic paste path as a manual fallback.

## MP4 conversion note

The converter is intentionally local and dependency-free. It samples video frames into a canvas, scales to a small GIF-friendly size, builds an adaptive 256-color palette from the actual clip, applies optional Floyd-Steinberg dithering, and writes GIF89a bytes. Quality is suitable for a prototype; production can still swap in ffmpeg.wasm or a stronger quantizer if file size and visual quality need more tuning.

## Dev preview

Run a static server from this folder and open `src/sidepanel.html?preview=1` to inspect the side panel with seeded mock GIFs. This preview mode does not paste into the active page; Paste and Send are simulated so UI changes can be judged quickly.

In preview mode, click `Inspect UI`, hover the interface, then click an element to copy a stable target such as `data-ui="gif-card-actions"`. Send that target when asking for UI adjustments.
