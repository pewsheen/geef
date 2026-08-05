# Geef

Geef is a Manifest V3 Chrome extension for keeping a personal picture, GIF, and
short-video library in the browser side panel and pasting selected media into
compatible editable web inputs.

Library storage, video conversion, thumbnail generation, search, and backup
processing all happen locally in the browser. Geef has no account system,
analytics, ads, developer-operated backend, or remotely hosted code.

## Features

- Open the media library from Chrome's extension toolbar in a side panel.
- Import pictures, animated media, and short videos by picker or drag and drop.
- Choose a destination group when importing a batch, including a new group that
  acts as a sticker pack.
- Keep short video clips in their efficient original format or optionally
  convert them to animated images for messenger autoplay compatibility.
- Search the library and organize mixed media into groups and favorites.
- Deduplicate added and restored media by a locally calculated SHA-256 checksum.
- Keep recently used media easy to reach, with an option to hide the Recently
  section.
- Rename, regroup, favorite, preview, paste, and remove individual items.
- Select multiple media items to move them to another group or delete them in
  one batch.
- Adjust the minimum grid cell width.
- Export a group or the complete library as a ZIP backup, then selectively
  restore groups and favorites.
- Inspect storage usage by group and remove individual groups or the complete
  library.
- Review Chrome's current storage capacity before removing local data when space
  runs low.
- Request page access for only the current website, and only after the user
  selects **Grant access**.

## Privacy and site access

Media, thumbnails, metadata, groups, and settings are kept in extension-owned
IndexedDB on the user's device. Geef briefly uses the active tab URL to identify
the exact website for a permission request. It does not read existing input
text, messages, page content, credentials, or cookies.

Geef uses Chrome's normal IndexedDB quota by default and asks the browser to
protect imported library data from automatic eviction. If the current quota is
not enough, **Settings > Data** lets the user review usage and remove local data.
Available physical disk space always applies.

When the user selects **Paste**, Geef dispatches the selected media file to an
editable field on the approved website. That website handles the pasted file
under its own terms and privacy policy. See the full [privacy policy](PRIVACY.md)
for data retention, deletion, and permission details.

## Requirements

- Chrome 116 or newer
- Node.js 22
- pnpm 11

## Install from source

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Build the extension:

   ```sh
   pnpm build
   ```

3. Open `chrome://extensions`, enable **Developer mode**, and select **Load
   unpacked**.
4. Select the generated `dist` directory.
5. Open a normal HTTP or HTTPS page with an editable field and select Geef from
   the extension toolbar.
6. Select **Grant access** to approve that website, focus the destination field,
   and select an item in Geef to paste it.

Chrome internal pages such as `chrome://extensions` do not allow extension page
injection.

## Development

```sh
pnpm dev           # start the Vite development server
pnpm test          # run the test suite
pnpm typecheck     # check TypeScript without emitting files
pnpm format:check  # verify repository formatting
pnpm build         # create the unpacked extension in dist/
```

For a UI-only preview, run `pnpm dev` and open
`src/sidepanel.html?preview=1`. Preview mode seeds a mock library and simulates
paste actions; it does not request access to a page.

In preview mode, select **Inspect UI**, hover the interface, and select an
element to copy a stable target such as `data-ui="gif-card-actions"`.

## Package a release

Run:

```sh
pnpm pack:extension
```

This performs a clean build and creates:

- `release/geef-<version>.zip`, with `manifest.json` at the archive root
- `release/geef-<version>.zip.sha256`

The packager verifies that `manifest.json` and `package.json` have matching
versions and that every manifest-referenced file exists. `pnpm pack` runs the
same extension packaging through pnpm's package lifecycle and is what the
GitHub Actions packaging workflow uses.

## Architecture

- `src/background.ts` captures the toolbar launch context and opens the side
  panel.
- `src/sidepanel.ts` implements the library UI, media import/conversion, backup,
  storage controls, site permission flow, and paste command.
- `src/content-script.ts` locates an editable field on an approved site and
  dispatches a paste event containing the selected file with its original media
  type.
- `src/store.ts` owns the IndexedDB library and settings data.
- `src/gif-encoder.ts` performs local video frame sampling, palette generation,
  dithering, transparency handling, and GIF89a encoding.

The extension requests host access as an optional permission. Although the
manifest allows HTTP and HTTPS origins so Geef can work on user-selected sites,
the UI requests one exact origin at a time. No site content script is registered
until the user grants that origin.

## Chrome Web Store

Store listing copy, the single-purpose statement, permission justifications,
privacy-practice answers, reviewer test instructions, and the release checklist
are maintained in [docs/chrome-web-store.md](docs/chrome-web-store.md).

## License

[MIT](LICENSE)
