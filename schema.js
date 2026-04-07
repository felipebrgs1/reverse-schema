// ── PII patterns ───────────────────────────────────────────────────
const PII_RULES = [
  { id: "cpf",       label: "CPF",          re: /^\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}$/ },
  { id: "cnpj",      label: "CNPJ",         re: /^\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\.\s]?\d{4}[-\.\s]?\d{2}$/ },
  { id: "phone",     label: "Telefone",     re: /^(\+55\s?)?(\(?\d{2}\)?\s?)[\s\-]?(\d{4,5})[\s\-]?(\d{4})$/ },
  { id: "email",     label: "E-mail",       re: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/ },
  { id: "cep",       label: "CEP",          re: /^\d{5}-?\d{3}$/ },
  { id: "ip",        label: "IP",           re: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/ },
  { id: "jwt",       label: "JWT",          re: /^eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*$/ },
  { id: "bearer",    label: "Bearer",       re: /^Bearer\s+\S+$/ },
  { id: "isodate",   label: "ISO Date",     re: /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/ },
  { id: "uuid",      label: "UUID",         re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i },
  { id: "card",      label: "Cartão",       re: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/ },
  { id: "url",       label: "URL",          re: /^https?:\/\/.+/ },
];

function detectFormat(val) {
  if (typeof val !== "string") return null;
  for (const r of PII_RULES) {
    if (r.re.test(val.trim())) return r.label;
  }
  return null;
}

// ── Core inferrer ──────────────────────────────────────────────────
const ENUM_MAX_CARDINALITY = 12; // max distinct values to show as enum
const ENUM_SAMPLE_THRESHOLD = 0.8; // if distinct/total < this, it's probably an enum

function inferField(values) {
  // values = array of all collected samples for this field path
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const hasNull = nonNull.length < values.length;

  if (nonNull.length === 0) return { type: "null" };

  const types = [...new Set(nonNull.map((v) => {
    if (Array.isArray(v)) return "array";
    if (v === null) return "null";
    return typeof v;
  }))];

  const type = types.length === 1 ? types[0] : types.join(" | ");

  const info = { type, nullable: hasNull, count: values.length };

  if (type === "number") {
    info.min = Math.min(...nonNull);
    info.max = Math.max(...nonNull);
    info.example = nonNull[0];
    const allInts = nonNull.every((v) => Number.isInteger(v));
    if (allInts) info.integer = true;
  }

  if (type === "string") {
    const distinct = [...new Set(nonNull)];
    const fmt = detectFormat(nonNull[0]);
    if (fmt) {
      info.format = fmt;
      info.example = nonNull[0];
    } else if (distinct.length <= ENUM_MAX_CARDINALITY && (distinct.length / nonNull.length) <= ENUM_SAMPLE_THRESHOLD) {
      info.enum = distinct.slice(0, ENUM_MAX_CARDINALITY);
    } else {
      info.example = nonNull[0];
      info.minLen = Math.min(...nonNull.map((v) => v.length));
      info.maxLen = Math.max(...nonNull.map((v) => v.length));
    }
  }

  if (type === "boolean") {
    info.trueRatio = Math.round((nonNull.filter(Boolean).length / nonNull.length) * 100);
  }

  if (type === "array") {
    const itemSamples = nonNull.flat().slice(0, 200);
    if (itemSamples.length > 0) {
      info.items = inferField(itemSamples);
      info.minLen = Math.min(...nonNull.map((v) => v.length));
      info.maxLen = Math.max(...nonNull.map((v) => v.length));
    }
  }

  return info;
}

// ── Path collector ─────────────────────────────────────────────────
function collectPaths(obj, acc = {}, prefix = "") {
  if (Array.isArray(obj)) {
    if (!acc[prefix]) acc[prefix] = [];
    // peek into array items as schema, not raw values
    obj.forEach((item) => {
      if (item !== null && typeof item === "object") {
        collectPaths(item, acc, prefix + "[]");
      } else {
        if (!acc[prefix + "[]"]) acc[prefix + "[]"] = [];
        acc[prefix + "[]"].push(item);
      }
    });
    return acc;
  }

  if (obj !== null && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (!acc[path]) acc[path] = [];

      if (Array.isArray(v)) {
        if (!acc[path + "[]"]) acc[path + "[]"] = [];
        v.forEach((item) => {
          if (item !== null && typeof item === "object") {
            collectPaths(item, acc, path + "[]");
          } else {
            acc[path + "[]"].push(item);
          }
        });
        acc[path].push(v); // keep array ref for length stats
      } else if (v !== null && typeof v === "object") {
        collectPaths(v, acc, path);
        acc[path].push(v); // keep object ref
      } else {
        acc[path].push(v);
      }
    }
    return acc;
  }

  // primitive at root
  if (!acc[prefix]) acc[prefix] = [];
  acc[prefix].push(obj);
  return acc;
}

// ── Public API ─────────────────────────────────────────────────────
function inferSchema(bodies) {
  // bodies = array of parsed JSON bodies (same endpoint, multiple calls)
  const pathAcc = {};

  for (const body of bodies) {
    collectPaths(body, pathAcc, "");
  }

  const schema = {};
  for (const [path, values] of Object.entries(pathAcc)) {
    if (path === "") continue;
    // skip object-type paths (they're parents, not leaf values worth showing)
    const leafValues = values.filter((v) => v === null || typeof v !== "object" || Array.isArray(v));
    if (leafValues.length === 0 && values.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) continue;
    schema[path] = inferField(values);
  }

  return schema;
}

// ── JSON Compressor — extract common values from arrays ────────────
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function compressJson(body) {
  const result = JSON.parse(JSON.stringify(body));
  _compressNode(result);
  return result;
}

function _compressNode(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      _compressNode(node[i]);
    }
  } else if (node !== null && typeof node === "object") {
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (Array.isArray(val) && val.length > 1) {
        const allObj = val.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));
        if (allObj) {
          _compressArray(val);
        } else {
          _compressNode(val);
        }
      } else {
        _compressNode(val);
      }
    }
  }
}

function _compressArray(items) {
  if (items.length < 2) return;

  const allKeys = new Set();
  for (const item of items) {
    for (const k of Object.keys(item)) allKeys.add(k);
  }

  const defaults = {};
  for (const key of allKeys) {
    const hasInAll = items.every((item) => key in item);
    if (!hasInAll) continue;

    const firstVal = items[0][key];
    const allSame = items.every((item) => deepEqual(item[key], firstVal));
    if (allSame) {
      defaults[key] = firstVal;
    }
  }

  const defaultKeys = Object.keys(defaults);
  if (defaultKeys.length < 3) return;

  for (const item of items) {
    for (const key of defaultKeys) {
      delete item[key];
    }
  }

  items.unshift({ _comum: defaults });
}

// ── PII Scrubber for full JSON ──────────────────────────────────────
const SCRUB_RULES = [
  { re: /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/g, tag: "[CPF]" },
  { re: /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\.\s]?\d{4}[-\.\s]?\d{2}/g, tag: "[CNPJ]" },
  { re: /(\+55\s?)?(\(?\d{2}\)?\s?)[\s\-]?(\d{4,5})[\s\-]?(\d{4})/g, tag: "[TEL]" },
  { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, tag: "[EMAIL]" },
  { re: /\d{5}-?\d{3}/g, tag: "[CEP]" },
  { re: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g, tag: "[JWT]" },
  { re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, tag: "Bearer [TOKEN]" },
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, tag: "[IP]" },
  { re: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, tag: "[CARTAO]" },
];

function scrubJson(body) {
  let text = JSON.stringify(body, null, 2);
  const hits = {};
  for (const rule of SCRUB_RULES) {
    const matches = text.match(new RegExp(rule.re.source, rule.re.flags));
    if (matches) {
      hits[rule.tag] = (hits[rule.tag] || 0) + matches.length;
      text = text.replace(new RegExp(rule.re.source, rule.re.flags), rule.tag);
    }
  }
  return { text, hits };
}
