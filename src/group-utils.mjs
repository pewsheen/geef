export function pruneEmptyGroups(groups, gifs, options = {}) {
  const fallbackGroup = cleanGroupName(options.fallbackGroup) || 'General';
  const reservedLabels = new Set(Array.from(options.reservedLabels || []).map((group) => cleanGroupName(group).toLowerCase()));
  const usedGroups = new Set((gifs || [])
    .map((gif) => cleanGroupName(gif?.group) || fallbackGroup)
    .filter((group) => group && !reservedLabels.has(group.toLowerCase())));

  return normalizeGroups(groups)
    .filter((group) => usedGroups.has(group) && !reservedLabels.has(group.toLowerCase()));
}

function normalizeGroups(groups) {
  return [...new Set((groups || []).map(cleanGroupName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function cleanGroupName(value) {
  return (value || '').trim().slice(0, 32);
}

