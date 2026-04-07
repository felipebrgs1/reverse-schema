// Runs in ISOLATED world — bridges page CustomEvents → chrome.runtime
window.addEventListener("__apiscope_capture__", (e) => {
  try {
    chrome.runtime.sendMessage({ type: "CAPTURE", entry: e.detail });
  } catch (_) {
    // extension context invalidated (page reload etc)
  }
});
