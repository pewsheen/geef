export const STORAGE_HEADROOM_BYTES = 5 * 1024 ** 2;

export function hasStorageCapacity(
  estimate,
  additionalBytes,
  headroomBytes = STORAGE_HEADROOM_BYTES,
) {
  const usage = finiteNonNegative(estimate?.usage);
  const quota = finiteNonNegative(estimate?.quota);
  const additional = finiteNonNegative(additionalBytes);
  const headroom = finiteNonNegative(headroomBytes);

  if (!quota) return true;
  return usage + additional + Math.min(headroom, quota) <= quota;
}

export function remainingStorageBytes(estimate) {
  const usage = finiteNonNegative(estimate?.usage);
  const quota = finiteNonNegative(estimate?.quota);
  return Math.max(0, quota - usage);
}

export function isStorageCapacityError(error) {
  return Boolean(
    error &&
    (error.name === "GeefStorageCapacityError" ||
      error.name === "QuotaExceededError" ||
      error.code === 22),
  );
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
