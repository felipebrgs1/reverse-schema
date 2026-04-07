// Runs in page's MAIN world — has direct access to fetch/XMLHttpRequest
(function () {
  const MAX_BODY_KB = 512;
  const MAX_ENTRIES = 200;

  function postCapture(entry) {
    window.dispatchEvent(new CustomEvent("__apiscope_capture__", { detail: entry }));
  }

  // ── Fetch patch ────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const req = new Request(...args);
    const url = req.url;
    const method = req.method;
    const t0 = performance.now();

    let res;
    try {
      res = await _fetch(...args);
    } catch (err) {
      postCapture({ url, method, status: 0, error: String(err), duration: Math.round(performance.now() - t0), ts: Date.now(), source: "fetch" });
      throw err;
    }

    const clone = res.clone();
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("json")) {
      clone.text().then((text) => {
        if (text.length > MAX_BODY_KB * 1024) return;
        try {
          const body = JSON.parse(text);
          postCapture({ url, method, status: res.status, body, duration: Math.round(performance.now() - t0), ts: Date.now(), source: "fetch" });
        } catch (_) {}
      });
    }

    return res;
  };

  // ── XHR patch ──────────────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__apiscope__ = { method, url };
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const meta = this.__apiscope__;
    if (!meta) return _send.apply(this, args);

    const t0 = performance.now();

    this.addEventListener("load", function () {
      const ct = this.getResponseHeader("content-type") || "";
      if (!ct.includes("json")) return;
      if ((this.responseText || "").length > MAX_BODY_KB * 1024) return;
      try {
        const body = JSON.parse(this.responseText);
        postCapture({
          url: meta.url,
          method: meta.method,
          status: this.status,
          body,
          duration: Math.round(performance.now() - t0),
          ts: Date.now(),
          source: "xhr",
        });
      } catch (_) {}
    });

    return _send.apply(this, args);
  };
})();
