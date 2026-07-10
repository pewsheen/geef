const MAX_GROUP_NAME_LENGTH = 32;

export function pruneEmptyGroups(groups, gifs, options = {}) {
  const fallbackGroup = cleanGroupName(options.fallbackGroup) || 'General';
  const reservedLabels = new Set(
    Array.from(options.reservedLabels || [], (group) =>
      cleanGroupName(group).toLowerCase(),
    ),
  );
  const usedGroups = new Set(
    (gifs || [])
      .map((gif) => cleanGroupName(gif?.group) || fallbackGroup)
      .filter((group) => group && !reservedLabels.has(group.toLowerCase())),
  );

  return normalizeGroups(groups).filter(
    (group) =>
      usedGroups.has(group) && !reservedLabels.has(group.toLowerCase()),
  );
}

export function normalizeGroups(groups) {
  return [...new Set((groups || []).map(cleanGroupName).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function cleanGroupName(value) {
  return String(value || '')
    .trim()
    .slice(0, MAX_GROUP_NAME_LENGTH);
}
