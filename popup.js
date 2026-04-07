// ── State ────────────────────────────────────────────────────────
let allEntries = [];
let selectedGroup = null; // { key, entries[] }
let currentDTab = "schema";

// Group entries by method+pathname (same endpoint = same group)
function groupKey(entry) {
  try {
    const u = new URL(entry.url);
    return `${entry.method}::${u.pathname}`;
  } catch {
    return `${entry.method}::${entry.url}`;
  }
}

function getGroups(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = groupKey(e);
    if (!map.has(k)) map.set(k, { key: k, entries: [] });
    map.get(k).entries.push(e);
  }
  return [...map.values()];
}

function friendlyUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, path: u.pathname, qs: u.search };
  } catch {
    return { host: "", path: url, qs: "" };
  }
}

function statusClass(s) {
  if (s >= 500) return "s5xx";
  if (s >= 400) return "s4xx";
  if (s >= 300) return "s3xx";
  return "s2xx";
}

// ── Render list ───────────────────────────────────────────────────
function renderList(filter = "") {
  const list = document.getElementById("reqList");
  const empty = document.getElementById("emptyState");
  const q = filter.toLowerCase();

  const groups = getGroups(allEntries).filter((g) => {
    const e = g.entries[0];
    return !q || e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q);
  });

  if (groups.length === 0) {
    empty.style.display = "flex";
    list.querySelectorAll(".req-item").forEach((el) => el.remove());
    return;
  }
  empty.style.display = "none";

  // diff render — rebuild for simplicity at this scale
  list.querySelectorAll(".req-item").forEach((el) => el.remove());

  for (const g of groups) {
    const e = g.entries[0];
    const { path, qs } = friendlyUrl(e.url);
    const sc = statusClass(e.status);
    const ms = e.entries ? `${e.entries.reduce((a, x) => a + x.duration, 0) / e.entries.length | 0}ms` : `${e.duration}ms`;
    const methodCls = ["GET","POST","PUT","PATCH","DELETE"].includes(e.method) ? e.method : "GET";

    const el = document.createElement("div");
    el.className = "req-item";
    el.dataset.key = g.key;
    el.innerHTML = `
      <span class="method ${methodCls}">${e.method}</span>
      <span class="req-url"><em>${path}</em>${qs ? `<span style="color:var(--text2)">${qs.slice(0,40)}</span>` : ""}</span>
      <div class="req-meta">
        ${g.entries.length > 1 ? `<span class="badge-count">×${g.entries.length}</span>` : ""}
        <span class="status ${sc}">${e.status || "—"}</span>
        <span class="duration">${ms}</span>
      </div>
    `;
    el.addEventListener("click", () => openDetail(g));
    list.appendChild(el);
  }
}

// ── Detail ────────────────────────────────────────────────────────
function openDetail(group) {
  selectedGroup = group;
  const e = group.entries[0];
  const { path } = friendlyUrl(e.url);
  const methodCls = ["GET","POST","PUT","PATCH","DELETE"].includes(e.method) ? e.method : "GET";

  document.getElementById("detailMethod").className = `method ${methodCls}`;
  document.getElementById("detailMethod").textContent = e.method;
  document.getElementById("detailUrl").textContent = path;
  document.getElementById("detailStatus").textContent = e.status;
  document.getElementById("detailStatus").className = `status ${statusClass(e.status)}`;

  switchPane("detail");
  document.getElementById("detailTab").style.display = "";
  renderDetailTab(currentDTab);
}

function renderDetailTab(tab) {
  currentDTab = tab;
  document.querySelectorAll(".detail-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.dtab === tab);
  });

  const body = document.getElementById("detailBody");
  const bodies = selectedGroup.entries.map((e) => e.body).filter(Boolean);

  if (tab === "schema") renderSchema(body, bodies);
  else if (tab === "scrub") renderScrub(body, bodies[0]);
  else if (tab === "compact") renderCompact(body, bodies[0]);
  else renderRaw(body, bodies[0]);
}

// ── Schema renderer ───────────────────────────────────────────────
function typeClass(type) {
  if (!type) return "t-null";
  if (type.includes("|")) return "t-mixed";
  if (type === "string") return "t-string";
  if (type === "number") return "t-number";
  if (type === "boolean") return "t-boolean";
  if (type === "array") return "t-array";
  if (type === "object") return "t-object";
  return "t-null";
}

function renderPath(path) {
  const parts = path.split(/(?=\.|\[\])/);
  return parts.map((p, i) => {
    const isArr = p === "[]" || p.endsWith("[]");
    const isLast = i === parts.length - 1;
    const cls = isArr ? "path-array" : isLast ? "path-leaf" : "path-depth";
    return `<span class="${cls}">${p}</span>`;
  }).join("");
}

function renderInfoCell(info) {
  let html = "";

  if (info.format) {
    html += `<span class="format-badge">${info.format}</span>`;
    if (info.example) html += ` <span class="example-val">${escHtml(String(info.example))}</span>`;
    return html;
  }

  if (info.enum) {
    html += `<div class="enum-list">`;
    html += info.enum.map((v) => `<span class="enum-val">${escHtml(String(v))}</span>`).join("");
    html += `</div>`;
    return html;
  }

  if (info.type === "number") {
    if (info.min !== undefined && info.max !== undefined) {
      html += `<span class="range-info">min: ${info.min} · max: ${info.max}</span>`;
      if (info.integer) html += ` <span class="format-badge" style="color:var(--teal);background:rgba(61,217,214,.1);border-color:rgba(61,217,214,.2)">int</span>`;
    }
    return html;
  }

  if (info.type === "boolean") {
    const t = info.trueRatio ?? 50;
    html += `<span class="range-info">true: ${t}% · false: ${100-t}%</span>`;
    return html;
  }

  if (info.type === "string" && info.example !== undefined) {
    html += `<span class="example-val">${escHtml(String(info.example))}</span>`;
    if (info.minLen !== undefined && info.minLen !== info.maxLen) {
      html += ` <span class="range-info" style="margin-left:4px">len ${info.minLen}–${info.maxLen}</span>`;
    }
    return html;
  }

  if (info.type === "array") {
    if (info.minLen !== undefined) {
      html += `<span class="range-info">[${info.minLen}–${info.maxLen} items]</span>`;
    }
    return html;
  }

  return html || `<span class="example-val">—</span>`;
}

function renderSchema(container, bodies) {
  if (!bodies.length) {
    container.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:20px 0">Sem body JSON disponível.</div>`;
    return;
  }

  const schema = inferSchema(bodies);
  const paths = Object.keys(schema);

  if (paths.length === 0) {
    container.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:20px 0">Schema vazio.</div>`;
    return;
  }

  const callCount = bodies.length;
  let html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:11px;color:var(--text2)">${paths.length} campos</span>
      ${callCount > 1 ? `<span style="font-size:11px;color:var(--teal)">inferido de ${callCount} chamadas</span>` : ""}
    </div>
    <table class="schema-table">
      <thead><tr>
        <th>Campo</th>
        <th>Tipo</th>
        <th>Valores / Info</th>
        <th style="text-align:right">n</th>
      </tr></thead>
      <tbody>
  `;

  for (const path of paths) {
    const info = schema[path];
    const rawType = info.type || "null";
    const tCls = typeClass(rawType);
    const nullDot = info.nullable ? `<span class="nullable-dot" title="nullable"></span>` : "";

    html += `<tr>
      <td class="path-cell">${renderPath(path)}</td>
      <td><span class="type-pill ${tCls}">${rawType}</span>${nullDot}</td>
      <td>${renderInfoCell(info)}</td>
      <td style="text-align:right;color:var(--text2);font-size:10px">${info.count}</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ── Scrub renderer ────────────────────────────────────────────────
function renderScrub(container, body) {
  if (!body) {
    container.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:20px 0">Sem body JSON disponível.</div>`;
    return;
  }

  const { text, hits } = scrubJson(body);
  const hitEntries = Object.entries(hits);

  let html = `<div class="scrub-actions">
    <button class="btn-sm btn-accent" id="copyScrubBtn">Copiar JSON limpo</button>
    <button class="btn-sm" id="copyRawBtn">Copiar original</button>
  </div>`;

  if (hitEntries.length) {
    html += `<div class="scrub-hits">`;
    html += hitEntries.map(([tag, count]) =>
      `<span class="hit-chip">${tag.replace(/[\[\]]/g,"")} ×${count}</span>`
    ).join("");
    html += `</div>`;
  } else {
    html += `<div style="font-size:11px;color:var(--green);margin-bottom:10px">✓ Nenhum PII detectado</div>`;
  }

  html += `<div class="raw-block">${escHtml(text)}</div>`;
  container.innerHTML = html;

  document.getElementById("copyScrubBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!"));
  });
  document.getElementById("copyRawBtn").addEventListener("click", () => {
    const raw = JSON.stringify(body, null, 2);
    navigator.clipboard.writeText(raw).then(() => showToast("Original copiado!"));
  });
}

function renderCompact(container, body) {
  if (!body) {
    container.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:20px 0">Sem body JSON disponível.</div>`;
    return;
  }
  const compressed = compressJson(body);
  const raw = JSON.stringify(body, null, 2);
  const compact = JSON.stringify(compressed, null, 2);
  const pct = raw.length > 0 ? Math.round((1 - compact.length / raw.length) * 100) : 0;

  container.innerHTML = `
    <div class="scrub-actions">
      <button class="btn-sm btn-accent" id="copyCompactBtn">Copiar compactado</button>
      <button class="btn-sm" id="copyCompactOrigBtn">Copiar original</button>
      <span style="font-size:10px;color:var(--text2);margin-left:auto">${raw.length} → ${compact.length} chars (${pct > 0 ? "-" : ""}${Math.abs(pct)}%)</span>
    </div>
    <div class="raw-block">${escHtml(compact)}</div>
  `;
  document.getElementById("copyCompactBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(compact).then(() => showToast("Compactado copiado!"));
  });
  document.getElementById("copyCompactOrigBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(raw).then(() => showToast("Original copiado!"));
  });
}

function renderRaw(container, body) {
  if (!body) {
    container.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:20px 0">Sem body JSON disponível.</div>`;
    return;
  }
  const text = JSON.stringify(body, null, 2);
  container.innerHTML = `
    <div style="margin-bottom:8px">
      <button class="btn-sm btn-accent" id="copyRawBtn2">Copiar</button>
    </div>
    <div class="raw-block">${escHtml(text)}</div>
  `;
  document.getElementById("copyRawBtn2").addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!"));
  });
}

// ── Utils ─────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function showToast(msg) {
  const t = document.getElementById("copyToast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.style.display = "none"), 2000);
}

function switchPane(name) {
  document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"));
  document.getElementById(`pane-${name}`).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
}

// ── Init ──────────────────────────────────────────────────────────
async function loadEntries() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_ENTRIES" }, (r) => resolve(r?.entries || []));
  });
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  allEntries = await loadEntries();
  renderList(document.getElementById("filterInput").value);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_ENTRIES" }, () => {
    allEntries = [];
    renderList();
  });
});

document.getElementById("filterInput").addEventListener("input", (e) => {
  renderList(e.target.value);
});

document.getElementById("backBtn").addEventListener("click", () => {
  switchPane("requests");
  document.getElementById("detailTab").style.display = "none";
});

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchPane(t.dataset.tab));
});

document.querySelectorAll(".detail-tab").forEach((t) => {
  t.addEventListener("click", () => renderDetailTab(t.dataset.dtab));
});

(async () => {
  allEntries = await loadEntries();
  renderList();
})();
