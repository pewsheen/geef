chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !chrome.sidePanel?.open) return;

  // Capture the activeTab launch context before the side panel moves focus
  // away from the page. The side panel uses this only to request access to
  // the exact site the user launched Geef from.
  const storeLaunchContext = chrome.storage.session.set({
    siteAccessLaunch: {
      tabId: tab.id,
      url: tab.url || "",
    },
  });
  const openSidePanel = chrome.sidePanel.open({ tabId: tab.id });
  await Promise.allSettled([storeLaunchContext, openSidePanel]);
});
