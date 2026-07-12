import assert from "node:assert/strict";
import test from "node:test";

import {
  hasStorageCapacity,
  isStorageCapacityError,
  remainingStorageBytes,
} from "../src/storage-capacity.ts";

test("reserves headroom when checking an IndexedDB write", () => {
  const estimate = { usage: 80, quota: 100 };

  assert.equal(hasStorageCapacity(estimate, 10, 5), true);
  assert.equal(hasStorageCapacity(estimate, 16, 5), false);
});

test("allows writes when Chrome cannot report a quota", () => {
  assert.equal(hasStorageCapacity(null, 100), true);
  assert.equal(hasStorageCapacity({ usage: 50, quota: 0 }, 100), true);
});

test("reports remaining quota without returning negative values", () => {
  assert.equal(remainingStorageBytes({ usage: 25, quota: 100 }), 75);
  assert.equal(remainingStorageBytes({ usage: 125, quota: 100 }), 0);
});

test("recognizes preflight and browser quota errors", () => {
  assert.equal(
    isStorageCapacityError({ name: "GeefStorageCapacityError" }),
    true,
  );
  assert.equal(isStorageCapacityError({ name: "QuotaExceededError" }), true);
  assert.equal(isStorageCapacityError({ code: 22 }), true);
  assert.equal(isStorageCapacityError(new Error("unrelated")), false);
});
