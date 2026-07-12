# Geef Privacy Policy

Effective date: July 13, 2026

Geef is a Chrome extension that keeps a personal GIF library in the browser and
lets the user paste a selected GIF into an editable field on a website they
approve. This policy describes the data handled by the official Geef extension.

## Summary

- Geef does not use a developer-operated server.
- Geef does not require an account.
- Geef does not include analytics, advertising, or tracking.
- Geef does not sell user data or share it with data brokers or advertisers.
- GIF library data and media conversion stay on the user's device.
- A GIF leaves the extension only when the user explicitly pastes it into a
  website or exports it as a local backup.

## Data Geef handles

### User-provided media and library data

When the user imports a GIF, MP4, WebM, or Geef ZIP backup, the extension handles
that file on the user's device. It may store:

- the imported or converted GIF and a generated thumbnail;
- the filename, title, dimensions, and file size;
- the selected group and favorite status; and
- creation, update, last-used, and use-count metadata.

Geef also stores local appearance and library settings, including the group list,
grid cell width, and whether to show the Recently section.

### Current website and permission data

When the user opens Geef from the toolbar, the extension briefly reads the active
tab's URL. It uses the URL to show the website name and request optional access
to that exact HTTP or HTTPS origin. The launch URL may be held temporarily in
Chrome's session storage so the permission prompt still targets the tab from
which the user opened the side panel.

Chrome retains site permissions that the user grants. Geef may register its
packaged content script for an approved origin so paste remains available there
across browser sessions. The extension does not build or transmit a browsing
history.

### Interaction with approved pages

On a website the user has approved, Geef identifies the focused or available
editable field and dispatches the user-selected GIF to that field when the user
selects **Paste**. Geef does not read, record, or store existing field text,
messages, page content, browsing history, keystrokes, credentials, cookies, or
authentication data.

## How data is used

Geef uses the data above only to provide its user-facing features:

- display, search, organize, preview, and manage the local GIF library;
- convert user-selected videos to GIFs;
- create and restore user-requested local backups;
- remember local settings and recently used GIFs; and
- paste a selected GIF into a user-approved website.

## Storage, retention, and deletion

GIFs, thumbnails, metadata, and settings are stored in extension-owned browser
storage on the user's device. They remain there until the user removes an item,
deletes a group's GIFs from **Settings > Data**, selects **Remove all GIFs**,
clears the extension's site data, or uninstalls the extension.

Geef uses Chrome's normal IndexedDB storage quota by default and asks Chrome to
make the library persistent when the user imports media or a backup. The Data
settings show Chrome's estimated usage and quota. When capacity is insufficient,
Geef directs the user to review and remove local library data. Physical disk
limits and browser quota changes can still cause storage errors.

ZIP exports are ordinary, unencrypted local files created at the user's request.
Geef cannot delete exported copies; the user controls and should protect those
files.

The user can revoke a website permission at any time through Chrome's extension
site-access controls. Removing a site permission prevents Geef from pasting into
that site until access is granted again.

## Transmission and sharing

Geef does not transmit library data, website addresses, or usage data to the
developer or to a developer-operated service. It does not use analytics or
advertising services.

When the user explicitly selects **Paste**, the selected GIF is provided to the
approved website through that page's editable field. The destination website may
then upload or otherwise process the GIF according to its own terms and privacy
policy. When the user exports a backup, the browser saves the ZIP file to a
location chosen or configured by the user. These are user-directed transfers and
are the only ways Geef sends library media outside its extension storage.

## Security

All executable code is packaged with the extension; Geef does not download or
execute remote code. Local data is protected by the security of the Chrome
profile, browser, and operating system. Geef does not separately encrypt its
IndexedDB data or exported ZIP backups.

## Limited Use

Geef uses information obtained through Chrome extension APIs only to provide or
improve its disclosed, user-facing GIF library and paste features. It does not
use or transfer user data for advertising, profiling, creditworthiness, or any
purpose unrelated to those features. The developer cannot access locally stored
user data and does not permit humans to read it. Geef's use of information
received from Google APIs complies with the Chrome Web Store User Data Policy,
including its Limited Use requirements.

## Changes to this policy

If Geef's data practices change, this policy and the Chrome Web Store disclosures
will be updated before the changed practices are released. The effective date at
the top of this document will identify the latest revision.

## Contact

For privacy questions or requests, open an issue in the
[Geef GitHub repository](https://github.com/pewsheen/geef/issues).
