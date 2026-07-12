import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesSiteAccessTarget,
  sitePermissionPattern,
} from "../src/site-access.ts";

test("matches the active tab and site captured for a permission request", () => {
  const target = {
    tabId: 17,
    pattern: "https://chat.synology.com/*",
  };

  assert.equal(
    matchesSiteAccessTarget(
      target,
      { id: 17 },
      "https://chat.synology.com/#/app/chat/19678",
    ),
    true,
  );
});

test("rejects permission when the user switches tabs", () => {
  assert.equal(
    matchesSiteAccessTarget(
      { tabId: 17, pattern: "https://chat.synology.com/*" },
      { id: 23 },
      "https://chat.synology.com/#/app/chat/19678",
    ),
    false,
  );
});

test("rejects permission when the original tab navigates to another site", () => {
  assert.equal(
    matchesSiteAccessTarget(
      { tabId: 17, pattern: "https://chat.synology.com/*" },
      { id: 17 },
      "https://example.com/",
    ),
    false,
  );
});

test("builds host permission patterns only for web pages", () => {
  assert.equal(
    sitePermissionPattern("https://chat.synology.com/path"),
    "https://chat.synology.com/*",
  );
  assert.equal(sitePermissionPattern("chrome://extensions"), null);
});
