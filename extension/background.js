// extension/background.ts
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "OPEN_SIDEPANEL") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});
