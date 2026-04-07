const MAX_PER_TAB = 200;
const store = {}; // tabId → Entry[]

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== "CAPTURE") return;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (!store[tabId]) store[tabId] = [];
  store[tabId].unshift(msg.entry); // newest first
  if (store[tabId].length > MAX_PER_TAB) store[tabId].length = MAX_PER_TAB;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete store[tabId];
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_ENTRIES") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      sendResponse({ entries: store[tabId] || [] });
    });
    return true;
  }

  if (msg.type === "CLEAR_ENTRIES") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) store[tabId] = [];
      sendResponse({ ok: true });
    });
    return true;
  }
});
