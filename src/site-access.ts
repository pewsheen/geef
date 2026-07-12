export function sitePermissionPattern(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch (_error) {
    return null;
  }
}

export function matchesSiteAccessTarget(target, activeTab, activeUrl) {
  return Boolean(
    target?.tabId &&
    activeTab?.id === target.tabId &&
    target.pattern &&
    sitePermissionPattern(activeUrl) === target.pattern,
  );
}
