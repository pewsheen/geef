import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("extension requests site access per origin", async () => {
  const [manifestText, background, sidepanel, sidepanelHtml] =
    await Promise.all([
      readFile(new URL("../manifest.json", import.meta.url), "utf8"),
      readFile(new URL("../src/background.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/sidepanel.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/sidepanel.html", import.meta.url), "utf8"),
    ]);
  const manifest = JSON.parse(manifestText);

  assert.ok(manifest.permissions.includes("activeTab"));
  assert.equal(manifest.permissions.includes("unlimitedStorage"), false);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, [
    "http://*/*",
    "https://*/*",
  ]);
  assert.equal(manifest.content_scripts, undefined);
  assert.doesNotMatch(manifestText, /<all_urls>/);
  assert.match(background, /chrome\.action\.onClicked/);
  assert.match(background, /openPanelOnActionClick: false/);
  assert.match(background, /chrome\.storage\.session\.set/);
  assert.doesNotMatch(background, /chrome\.scripting/);
  assert.match(sidepanel, /chrome\.permissions\.request/);
  assert.match(sidepanel, /chrome\.permissions\.contains/);
  assert.doesNotMatch(sidepanel, /unlimitedStorage/);
  assert.match(sidepanel, /requestPersistentStorage/);
  assert.match(sidepanel, /estimateStorage/);
  assert.match(sidepanel, /chrome\.scripting\.registerContentScripts/);
  assert.match(sidepanel, /chrome\.storage\.session\.get/);
  assert.match(sidepanelHtml, /grant-site-access-button/);
  assert.doesNotMatch(sidepanelHtml, /data-enable-larger-button/);
});
