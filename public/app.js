import maplibregl from "https://esm.sh/maplibre-gl@3.6.2";
import { Protocol } from "https://cdn.jsdelivr.net/npm/pmtiles@3.0.6/+esm";
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

const elements = {
  datasetDate: document.getElementById("dataset-date"),
  datasetCount: document.getElementById("dataset-count"),
  shareState: document.getElementById("share-state"),
  mapSnapshot: document.getElementById("map-snapshot"),
  modeFilter: document.getElementById("mode-filter"),
  operatorFilter: document.getElementById("operator-filter"),
  bboxFilter: document.getElementById("bbox-filter"),
  advancedToggle: document.getElementById("advanced-toggle"),
  advancedToggleIcon: document.getElementById("advanced-toggle-icon"),
  advancedPanel: document.getElementById("advanced-panel"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  clearAll: document.getElementById("clear-all"),
  scopeChips: document.getElementById("scope-chips"),
  serviceSearch: document.getElementById("service-search"),
  serviceSearchResults: document.getElementById("service-search-results"),
  loadSample: document.getElementById("load-sample"),
  downloadGeojson: document.getElementById("download-geojson"),
  downloadCsv: document.getElementById("download-csv"),
  exportCsvTable: document.getElementById("export-csv-table"),
  colorByOperator: document.getElementById("color-by-operator"),
  statsGrid: document.getElementById("stats-grid"),
  statsModes: document.getElementById("stats-modes"),
  statsDirections: document.getElementById("stats-directions"),
  statsHint: document.getElementById("stats-hint"),
  selectionDetails: document.getElementById("selection-details"),
  clearSelection: document.getElementById("clear-selection"),
  status: document.getElementById("status"),
  previewCount: document.getElementById("preview-count"),
  dataTableHead: document.getElementById("data-table-head"),
  dataTableBody: document.getElementById("data-table-body"),
  dataTableEmpty: document.getElementById("data-table-empty"),
  tableMeta: document.getElementById("table-meta"),
  evidenceLeft: document.getElementById("evidence-left"),
  evidenceRight: document.getElementById("evidence-right"),
  legendItems: document.getElementById("legend-items"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  sidebar: document.getElementById("sidebar"),
  dataInspector: document.getElementById("data-inspector"),
  dataInspectorFilter: document.getElementById("data-inspector-filter"),
  dataInspectorExpand: document.getElementById("data-inspector-expand"),
  placeSearch: document.getElementById("place-search"),
  placeSearchResults: document.getElementById("place-search-results")
};

const NONE_OPTION_VALUE = "__NONE__";

const state = {
  config: null,
  metadata: null,
  map: null,
  overlay: null,
  deck: null,
  db: null,
  conn: null,
  spatialReady: false,
  geometryField: "geometry",
  geojsonField: "",
  bboxFields: null,
  bboxReady: false,
  pendingGeojson: null,
  baseLayerId: "routes-line",
  selectedLayerId: "routes-selected",
  baseLayerPaint: { opacity: 0.65, width: 1.2 },
  baseLayerFiltered: false,
  overlayVersion: 0,
  colorByOperator: false,
  operatorColorMap: new Map(),
  selectedFeatureKey: null,
  selectedFeature: null,
  lastPreviewGeojson: null,
  columns: [],
  modeField: "mode",
  operatorFields: ["operatorCode", "operatorName", "operator"],
  lastQuery: null,
  tileFields: {
    serviceId: "",
    serviceName: "",
    mode: "",
    operatorCode: "",
    operatorName: ""
  },
  tableRows: [],
  tableLimit: 250,
  pendingPreviewGeojson: null
};

const ROUTE_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 5, 0.9, 8, 1.3, 11, 2.2, 14, 3.6];
const SELECTED_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 5, 2.2, 8, 3.0, 11, 4.4, 14, 6.2];
const DEFAULT_ROUTE_COLOR = "#d6603b";
const PREVIEW_ROUTE_COLOR = "#165570";
const SELECTED_ROUTE_COLOR = "#f59e0b";

const escapeSql = (value) => String(value).replace(/'/g, "''");
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const joinUrl = (base, path) => {
  if (!base) {
    return path;
  }
  if (typeof path === "string" && (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/"))) {
    return path;
  }
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

const toAbsoluteUrl = (value) => {
  if (!value || typeof window === "undefined") {
    return value;
  }
  try {
    return new URL(value, window.location.href).toString();
  } catch (error) {
    return value;
  }
};

const getFeatureFlag = (config, name, defaultValue = false) => {
  const features = config?.features || config?.ui?.features || {};
  if (Object.prototype.hasOwnProperty.call(features, name)) {
    return Boolean(features[name]);
  }
  return Boolean(defaultValue);
};

const getFilename = (value) => {
  if (!value) {
    return value;
  }
  const trimmed = String(value).split("?")[0];
  return trimmed.split("/").pop();
};

const rebaseBundle = (bundle, baseUrl) => {
  if (!bundle || !baseUrl) {
    return bundle;
  }
  const rebased = { ...bundle };
  Object.keys(rebased).forEach((key) => {
    const value = rebased[key];
    if (typeof value === "string") {
      const filename = getFilename(value);
      if (filename) {
        rebased[key] = toAbsoluteUrl(joinUrl(baseUrl, filename));
      }
    }
  });
  return rebased;
};

const rebaseBundles = (bundles, baseUrl) => {
  if (!baseUrl) {
    return bundles;
  }
  const rebased = {};
  Object.entries(bundles).forEach(([key, bundle]) => {
    rebased[key] = rebaseBundle(bundle, baseUrl);
  });
  return rebased;
};

const setStatus = (message) => {
  elements.status.textContent = message;
};

const setPreview = (message) => {
  elements.previewCount.textContent = message;
};

const applyFeatureFlags = (config) => {
  const nodes = Array.from(document.querySelectorAll("[data-feature]"));
  nodes.forEach((node) => {
    const name = node.getAttribute("data-feature");
    if (!name) {
      return;
    }
    const enabled = getFeatureFlag(config, name, false);
    node.hidden = !enabled;
  });

  // Keep action buttons consistent with feature-gated visibility.
  const exportCsvEnabled = getFeatureFlag(config, "exportCsv", true);
  if (elements.downloadCsv) {
    elements.downloadCsv.hidden = !exportCsvEnabled;
  }
  if (elements.exportCsvTable) {
    elements.exportCsvTable.hidden = !exportCsvEnabled;
  }
};

const showDropdown = (element) => {
  if (!element) return;
  element.classList.remove("hidden");
};

const hideDropdown = (element) => {
  if (!element) return;
  element.classList.add("hidden");
  element.innerHTML = "";
};

const dropdownState = new WeakMap();

const renderDropdownItems = (container, items, onPick) => {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    hideDropdown(container);
    return;
  }
  container.setAttribute("role", "listbox");
  dropdownState.set(container, { items, active: -1, onPick });
  items.forEach((item, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-border last:border-b-0";
    row.innerHTML = item.html;
    row.setAttribute("role", "option");
    row.dataset.index = String(idx);
    row.addEventListener("click", () => onPick(item, idx));
    container.appendChild(row);
  });
  showDropdown(container);
};

const setDropdownActive = (container, nextIndex) => {
  if (!container) return;
  const state = dropdownState.get(container);
  if (!state || !state.items.length) return;
  const items = Array.from(container.querySelectorAll("[data-index]"));
  const max = items.length - 1;
  const idx = Math.max(0, Math.min(max, nextIndex));
  state.active = idx;
  dropdownState.set(container, state);
  items.forEach((node) => {
    const isActive = Number(node.dataset.index) === idx;
    node.classList.toggle("bg-slate-50", isActive);
  });
  const activeEl = items[idx];
  if (activeEl && typeof activeEl.scrollIntoView === "function") {
    activeEl.scrollIntoView({ block: "nearest" });
  }
};

const handleDropdownKeyNav = (event, inputEl, dropdownEl) => {
  if (!dropdownEl || dropdownEl.classList.contains("hidden")) {
    return false;
  }
  const state = dropdownState.get(dropdownEl);
  if (!state || !state.items.length) {
    return false;
  }
  if (event.key === "Escape") {
    hideDropdown(dropdownEl);
    return true;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setDropdownActive(dropdownEl, (state.active ?? -1) + 1);
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setDropdownActive(dropdownEl, (state.active ?? 0) - 1);
    return true;
  }
  if (event.key === "Enter") {
    const idx = state.active;
    if (idx >= 0 && idx < state.items.length) {
      event.preventDefault();
      const item = state.items[idx];
      state.onPick?.(item, idx);
      hideDropdown(dropdownEl);
      inputEl?.blur?.();
      return true;
    }
  }
  return false;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const tokenizeQuery = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w\-]/g, ""))
    .filter(Boolean)
    .slice(0, 6);

const queryServiceSuggestions = async (query, limit = 12) => {
  if (!state.conn) {
    return [];
  }
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    return [];
  }

  const likeClauses = tokens.map((token) => {
    const q = escapeSql(token.toLowerCase());
    const like = `'%${q}%'`;
    const parts = [];
    if ((state.columns || []).includes("serviceName")) {
      parts.push(`LOWER(CAST(${quoteIdentifier("serviceName")} AS VARCHAR)) LIKE ${like}`);
    }
    if ((state.columns || []).includes("serviceId")) {
      parts.push(`LOWER(CAST(${quoteIdentifier("serviceId")} AS VARCHAR)) LIKE ${like}`);
    }
    if ((state.columns || []).includes("operatorName")) {
      parts.push(`LOWER(CAST(${quoteIdentifier("operatorName")} AS VARCHAR)) LIKE ${like}`);
    }
    return parts.length ? `(${parts.join(" OR ")})` : "TRUE";
  });

  const where = likeClauses.length ? `WHERE ${likeClauses.join(" AND ")}` : "";
  const q0 = escapeSql(tokens[0].toLowerCase());
  const exactId = (state.columns || []).includes("serviceId")
    ? `CASE WHEN LOWER(CAST(${quoteIdentifier("serviceId")} AS VARCHAR)) = '${q0}' THEN 3 ELSE 0 END`
    : "0";
  const prefixName = (state.columns || []).includes("serviceName")
    ? `CASE WHEN LOWER(CAST(${quoteIdentifier("serviceName")} AS VARCHAR)) LIKE '${q0}%' THEN 2 ELSE 0 END`
    : "0";
  const containsName = (state.columns || []).includes("serviceName")
    ? `CASE WHEN LOWER(CAST(${quoteIdentifier("serviceName")} AS VARCHAR)) LIKE '%${q0}%' THEN 1 ELSE 0 END`
    : "0";

  const score = `(${exactId} + ${prefixName} + ${containsName})`;
  const querySql = `
    SELECT
      ${score} AS _score,
      ${state.columns.includes("serviceId") ? quoteIdentifier("serviceId") : "NULL"} AS serviceId,
      ${state.columns.includes("serviceName") ? quoteIdentifier("serviceName") : "NULL"} AS serviceName,
      ${state.columns.includes("operatorName") ? quoteIdentifier("operatorName") : "NULL"} AS operatorName,
      ${state.columns.includes("mode") ? quoteIdentifier("mode") : "NULL"} AS mode
    FROM read_parquet('routes.parquet')
    ${where}
    ORDER BY _score DESC, serviceName ASC
    LIMIT ${Math.max(1, Math.min(limit, 25))}
  `;

  const result = await state.conn.query(querySql);
  return result.toArray().map((row) => ({
    serviceId: row.serviceId ?? "",
    serviceName: row.serviceName ?? "",
    operatorName: row.operatorName ?? "",
    mode: row.mode ?? ""
  }));
};

const getLayerVisible = (map, layerId) => {
  if (!map || !layerId || !map.getLayer(layerId)) {
    return false;
  }
  const visibility = map.getLayoutProperty(layerId, "visibility");
  return visibility !== "none";
};

const renderLegend = () => {
  if (!elements.legendItems) {
    return;
  }
  const map = state.map;
  const items = [];

  if (getLayerVisible(map, "routes-line")) {
    const colorMode = state.colorByOperator ? "Operator" : "Default";
    items.push({
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${DEFAULT_ROUTE_COLOR}"></span>`,
      label: `Route lines (${colorMode})`
    });
  }

  if (getLayerVisible(map, "routes-preview-line")) {
    items.push({
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${PREVIEW_ROUTE_COLOR}"></span>`,
      label: "GeoJSON preview"
    });
  }

  if (state.selectedFeature) {
    items.push({
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${SELECTED_ROUTE_COLOR}"></span>`,
      label: "Selected route"
    });
  }

  if (!items.length) {
    elements.legendItems.innerHTML = '<div class="text-[11px] text-text-tertiary">No layers loaded.</div>';
    return;
  }

  elements.legendItems.innerHTML = items
    .map((item) => `<div class="flex items-center gap-2">${item.swatch}${item.label}</div>`)
    .join("");
};

const updateZoomButtons = () => {
  const map = state.map;
  if (!map || !elements.zoomIn || !elements.zoomOut) {
    return;
  }
  const zoom = map.getZoom();
  const minZoom = typeof map.getMinZoom === "function" ? map.getMinZoom() : 0;
  const maxZoom = typeof map.getMaxZoom === "function" ? map.getMaxZoom() : 24;
  elements.zoomOut.disabled = zoom <= minZoom + 1e-6;
  elements.zoomIn.disabled = zoom >= maxZoom - 1e-6;
  elements.zoomOut.classList.toggle("opacity-50", elements.zoomOut.disabled);
  elements.zoomIn.classList.toggle("opacity-50", elements.zoomIn.disabled);
};

const fitMapToBbox = (bbox, reason) => {
  const map = state.map;
  if (!map || !Array.isArray(bbox) || bbox.length !== 4) {
    return;
  }
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) {
    return;
  }
  try {
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat]
      ],
      { padding: 40, duration: 450 }
    );
    if (reason) {
      setStatus(reason);
    }
  } catch (error) {
    // Ignore invalid bounds.
  }
};

const getGeometryCoordinates = (geometry) => {
  if (!geometry) {
    return [];
  }
  const type = geometry.type;
  if (type === "LineString") {
    return geometry.coordinates || [];
  }
  if (type === "MultiLineString") {
    return (geometry.coordinates || []).flat();
  }
  if (type === "Point") {
    return [geometry.coordinates];
  }
  if (type === "MultiPoint") {
    return geometry.coordinates || [];
  }
  if (type === "Polygon") {
    return (geometry.coordinates || []).flat();
  }
  if (type === "MultiPolygon") {
    return (geometry.coordinates || []).flat(2);
  }
  return [];
};

const getFeaturesBbox = (features) => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  (features || []).forEach((feature) => {
    const coords = getGeometryCoordinates(feature?.geometry);
    coords.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) {
        return;
      }
      const lon = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return;
      }
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
  });

  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (minLon === maxLon && minLat === maxLat) {
    // Avoid zero-area bounds.
    const pad = 0.01;
    return [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad];
  }
  return [minLon, minLat, maxLon, maxLat];
};

const fitMapToScope = (reason) => {
  const map = state.map;
  if (!map || !getFeatureFlag(state.config, "autoFitScope", true)) {
    return;
  }

  // If bbox-filter is active, the scope is explicitly the viewport; don't override.
  if (elements.bboxFilter?.checked) {
    return;
  }

  // Prefer GeoJSON preview bounds when present (accurate for preview scope).
  if (state.lastPreviewGeojson?.features?.length) {
    const bbox = getFeaturesBbox(state.lastPreviewGeojson.features);
    if (bbox) {
      fitMapToBbox(bbox, reason || "Fitting to preview scope...");
      return;
    }
  }

  // Best-effort for PMTiles/GeoJSON sources: fit to currently rendered features.
  // This is viewport-dependent (tiles outside view aren't sampled), but still useful.
  try {
    const rendered = map.queryRenderedFeatures(undefined, { layers: ["routes-line"] });
    const bbox = getFeaturesBbox(rendered);
    if (bbox) {
      fitMapToBbox(bbox, reason || "Fitting to scope...");
    }
  } catch (error) {
    // Ignore.
  }
};

const copyText = async (value) => {
  const text = String(value ?? "");
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for non-secure contexts.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
};

const withTimeout = (promise, ms, message) => {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
};

const toggleActionButtons = (enabled) => {
  elements.applyFilters.disabled = !enabled;
  elements.clearFilters.disabled = !enabled;
  const duckdbReady = enabled && Boolean(state.conn);
  const geojsonAvailable = duckdbReady && (state.geojsonField || (state.spatialReady && state.geometryField));
  elements.downloadGeojson.disabled = !geojsonAvailable;
  elements.downloadCsv.disabled = !duckdbReady;
  if (elements.exportCsvTable) {
    elements.exportCsvTable.disabled = !duckdbReady;
  }
};

const setAdvancedOpen = (open) => {
  if (!elements.advancedToggle || !elements.advancedPanel) {
    return;
  }
  elements.advancedToggle.setAttribute("aria-expanded", open ? "true" : "false");
  elements.advancedPanel.classList.toggle("hidden", !open);
  if (elements.advancedToggleIcon) {
    elements.advancedToggleIcon.textContent = open ? "expand_less" : "expand_more";
  }
  try {
    localStorage.setItem("advancedOpen", open ? "1" : "0");
  } catch (error) {
    // ignore
  }
};

const formatCount = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return value.toLocaleString();
};

const formatBytes = (bytes) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let idx = -1;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
};

const getResultColumns = (result) => {
  const fields = result?.schema?.fields;
  if (Array.isArray(fields)) {
    return fields.map((field) => field.name);
  }
  return [];
};

const EXCLUDED_CSV_COLUMNS = new Set(["geometry", "geom", "geojson"]);

const getCsvColumns = () =>
  (state.columns || []).filter((column) => !EXCLUDED_CSV_COLUMNS.has(column));

const toNumber = (value) => {
  if (typeof value === "bigint") {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (value > max) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (value < BigInt(-Number.MAX_SAFE_INTEGER)) {
      return -Number.MAX_SAFE_INTEGER;
    }
    return Number(value);
  }
  return typeof value === "number" ? value : Number(value);
};

const estimateExportBytes = (count, format) => {
  const perRow = format === "geojson" ? 900 : 220;
  return toNumber(count) * perRow;
};

const confirmLargeExport = async (count, format) => {
  const estimate = estimateExportBytes(count, format);
  const threshold = 5 * 1024 * 1024;
  if (estimate <= threshold) {
    return true;
  }
  return window.confirm(
    `This export is estimated at ~${formatBytes(estimate)} for ${formatCount(count)} rows. Continue?`
  );
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDecimal = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return Number(value).toFixed(digits);
};

const clearElement = (element) => {
  if (!element) {
    return;
  }
  element.innerHTML = "";
};

const setStatsHint = (message) => {
  if (!elements.statsHint) {
    return;
  }
  elements.statsHint.textContent = message;
};

const getProp = (props, name) => {
  if (!props) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(props, name)) {
    return props[name];
  }
  const lower = String(name).toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]/g, "");
  for (const key of Object.keys(props)) {
    const keyLower = String(key).toLowerCase();
    if (keyLower === lower) {
      return props[key];
    }
    if (keyLower.replace(/[^a-z0-9]/g, "") === normalized) {
      return props[key];
    }
  }
  return undefined;
};

const getFeatureKey = (feature, fallback = "") => {
  const props = feature?.properties || {};
  const candidates = ["serviceId", "tripId", "routeId", "id", "serviceName", "name"];
  for (const candidate of candidates) {
    const value = getProp(props, candidate);
    if (value !== undefined && value !== null && value !== "") {
      return `${candidate}:${value}`;
    }
  }
  return fallback;
};

const getServiceSearchValue = () => {
  const value = elements.serviceSearch?.value ?? "";
  return String(value).trim();
};

const uniqueStrings = (items) => Array.from(new Set((items || []).map((v) => String(v)).filter(Boolean)));

const coalesceGet = (keys, fallback = "") => {
  const parts = (keys || []).map((key) => ["get", key]);
  return ["coalesce", ...parts, fallback];
};

const mapCandidateKeys = (preferred, candidates) =>
  uniqueStrings([preferred, ...(candidates || [])].filter(Boolean));

const getSelectedServiceId = () => {
  if (!state.selectedFeature) {
    return null;
  }
  const props = state.selectedFeature.properties || {};
  const candidates = [state.tileFields.serviceId, "serviceId", "service_id", "id"];
  for (const key of candidates) {
    if (!key) continue;
    const value = getProp(props, key);
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return null;
};

const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp >= 1 && hp < 2) {
    r = x;
    g = c;
  } else if (hp >= 2 && hp < 3) {
    g = c;
    b = x;
  } else if (hp >= 3 && hp < 4) {
    g = x;
    b = c;
  } else if (hp >= 4 && hp < 5) {
    r = x;
    b = c;
  } else if (hp >= 5 && hp < 6) {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
};

const hashString = (value) => {
  let hash = 0;
  const str = String(value);
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const rgbaToHex = (rgba) => {
  const [r, g, b] = rgba || [0, 0, 0];
  const toHex = (n) => {
    const v = Math.max(0, Math.min(255, Number(n) || 0));
    return v.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const buildOperatorColorExpression = () => {
  const map = state.map;
  if (!map || !map.getLayer("routes-line")) {
    return null;
  }
  const operators = state.metadata?.operators || [];
  if (!Array.isArray(operators) || !operators.length) {
    return null;
  }

  const operatorKeys = mapCandidateKeys(state.tileFields.operatorCode, [
    "operatorCode",
    "operator_code",
    "operatorName",
    "operator_name",
    "operator"
  ]);
  const valueExpr = coalesceGet(operatorKeys, "Unknown");
  const match = ["match", valueExpr];

  operators.forEach((op) => {
    const code = typeof op === "string" ? op : op.code;
    const name = typeof op === "string" ? op : op.name;
    const base = code || name;
    if (!base) return;
    const color = rgbaToHex(getOperatorColor(base));
    if (code) {
      match.push(code, color);
    }
    if (name && name !== code) {
      match.push(name, color);
    }
  });

  match.push(DEFAULT_ROUTE_COLOR);
  return match;
};

const applyRouteColorMode = () => {
  const map = state.map;
  if (!map || !map.getLayer("routes-line")) {
    return;
  }
  if (state.colorByOperator) {
    const expr = buildOperatorColorExpression();
    if (expr) {
      map.setPaintProperty("routes-line", "line-color", expr);
    } else {
      map.setPaintProperty("routes-line", "line-color", DEFAULT_ROUTE_COLOR);
    }
  } else {
    map.setPaintProperty("routes-line", "line-color", DEFAULT_ROUTE_COLOR);
  }
  renderLegend();
};

const getOperatorValue = (props) => {
  if (!props) {
    return null;
  }
  if (state.operatorFields.length) {
    for (const field of state.operatorFields) {
      const value = getProp(props, field);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  const fallbackFields = ["operatorCode", "operatorName", "operator"];
  for (const field of fallbackFields) {
    const value = getProp(props, field);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
};

const getOperatorColor = (value) => {
  if (!value) {
    return [22, 85, 112, 180];
  }
  if (state.operatorColorMap.has(value)) {
    return state.operatorColorMap.get(value);
  }
  const hue = hashString(value) % 360;
  const [r, g, b] = hslToRgb(hue, 0.6, 0.45);
  const color = [r, g, b, 185];
  state.operatorColorMap.set(value, color);
  return color;
};

const renderStatsGrid = (items) => {
  if (!elements.statsGrid) {
    return;
  }
  clearElement(elements.statsGrid);
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "stats-card";
    const label = document.createElement("div");
    label.className = "stats-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "stats-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    elements.statsGrid.appendChild(card);
  });
};

const renderStatsList = (element, items, emptyLabel) => {
  if (!element) {
    return;
  }
  clearElement(element);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "stats-empty";
    empty.textContent = emptyLabel;
    element.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "stats-row";
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("span");
    value.textContent = item.value;
    row.appendChild(label);
    row.appendChild(value);
    element.appendChild(row);
  });
};

const renderSelection = (feature) => {
  if (!elements.selectionDetails) {
    return;
  }
  elements.selectionDetails.innerHTML = "";
  if (!feature) {
    const empty = document.createElement("div");
    empty.className = "selection-empty";
    empty.textContent = "Click a route in the filtered preview.";
    elements.selectionDetails.appendChild(empty);
    return;
  }
  const props = feature.properties || {};
  const fields = [
    { key: "serviceId", label: "Service ID" },
    { key: "serviceName", label: "Service name" },
    { key: "operatorName", label: "Operator" },
    { key: "operatorCode", label: "Operator code" },
    { key: "mode", label: "Mode" },
    { key: "direction", label: "Direction" },
    { key: "tripId", label: "Trip ID" }
  ];
  const rows = fields
    .map((field) => ({ label: field.label, value: getProp(props, field.key) }))
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== "");
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "selection-empty";
    empty.textContent = "Selected route has no metadata to display.";
    elements.selectionDetails.appendChild(empty);
    return;
  }
  rows.forEach((row) => {
    const wrapper = document.createElement("div");
    wrapper.className = "selection-row";
    const label = document.createElement("span");
    label.className = "selection-label";
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "inline-flex items-center gap-2";
    const text = document.createElement("span");
    text.textContent = row.value;
    value.appendChild(text);

    if (row.label === "Service ID" || row.label === "Operator code") {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "h-5 w-5 inline-flex items-center justify-center rounded border border-border bg-white text-text-secondary hover:bg-surface-alt";
      button.title = `Copy ${row.label}`;
      button.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">content_copy</span>';
      button.addEventListener("click", async () => {
        const ok = await copyText(row.value);
        setStatus(ok ? `${row.label} copied.` : `Copy failed.`);
      });
      value.appendChild(button);
    }
    wrapper.appendChild(label);
    wrapper.appendChild(value);
    elements.selectionDetails.appendChild(wrapper);
  });
};

const setSelection = (feature, fallbackKey = "") => {
  if (!feature) {
    state.selectedFeature = null;
    state.selectedFeatureKey = null;
    renderSelection(null);
    return;
  }
  state.selectedFeature = feature;
  state.selectedFeatureKey = getFeatureKey(feature, fallbackKey);
  renderSelection(feature);
  renderLegend();
};

const clearSelection = () => {
  state.selectedFeature = null;
  state.selectedFeatureKey = null;
  renderSelection(null);
  syncSelectedLayer();
  renderTable();
  renderLegend();
};

const normalizeModes = (raw) => {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === "string" ? item : item.value || item.mode)).filter(Boolean);
  }
  return [];
};

const normalizeOperators = (raw) => {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") {
          return { code: item, label: item };
        }
        const code = item.code || item.operatorCode || item.id;
        const label = item.name || item.operatorName || item.operator || code;
        return label ? { code, label } : null;
      })
      .filter(Boolean);
  }
  return [];
};

const fillSelect = (select, options, formatter, includeNone = true) => {
  select.innerHTML = "";
  if (includeNone) {
    const noneOption = document.createElement("option");
    noneOption.value = NONE_OPTION_VALUE;
    noneOption.textContent = "(none)";
    select.appendChild(noneOption);
  }
  options.forEach((option) => {
    const opt = document.createElement("option");
    const formatted = formatter(option);
    opt.value = formatted.value;
    opt.textContent = formatted.label;
    if (formatted.field) {
      opt.dataset.field = formatted.field;
    }
    select.appendChild(opt);
  });
};

const resolveOperatorOption = (operator) => {
  const fields = state.operatorFields;
  if (operator.code && fields.includes("operatorCode")) {
    return { value: operator.code, label: operator.label, field: "operatorCode" };
  }
  if (fields.includes("operatorName")) {
    return { value: operator.label, label: operator.label, field: "operatorName" };
  }
  if (fields.includes("operator")) {
    return { value: operator.label, label: operator.label, field: "operator" };
  }
  const fallbackField = fields[0] || "operatorCode";
  return { value: operator.code || operator.label, label: operator.label, field: fallbackField };
};

const populateFilters = () => {
  if (!state.metadata) {
    return;
  }
  state.operatorColorMap.clear();
  const modes = normalizeModes(state.metadata.modes);
  const operators = normalizeOperators(state.metadata.operators);
  fillSelect(elements.modeFilter, modes, (mode) => ({ value: mode, label: mode }), true);
  fillSelect(elements.operatorFilter, operators, resolveOperatorOption, true);
};

const loadDeck = async () => {
  if (state.deck) {
    return state.deck;
  }
  if (typeof window !== "undefined" && window.mapboxgl === undefined) {
    window.mapboxgl = maplibregl;
  }
  const [mapboxModule, layersModule] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/@deck.gl/mapbox@8.9.33/+esm"),
    import("https://cdn.jsdelivr.net/npm/@deck.gl/layers@8.9.33/+esm")
  ]);
  state.deck = {
    MapboxOverlay: mapboxModule.MapboxOverlay,
    PathLayer: layersModule.PathLayer
  };
  return state.deck;
};

const initMap = (config) => {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const map = new maplibregl.Map({
    container: "map",
    style: config.basemapStyle || "https://demotiles.maplibre.org/style.json",
    center: config.defaultView?.center || [-3.5, 56.2],
    zoom: config.defaultView?.zoom || 6.2
  });

  // We render custom zoom buttons in the UI; avoid duplicate MapLibre controls.

  map.on("error", (event) => {
    const message = event?.error?.message;
    if (!message) {
      return;
    }
    // Avoid spamming status for harmless errors; surface likely load failures.
    if (message.toLowerCase().includes("failed") || message.toLowerCase().includes("error")) {
      setStatus(`Map error: ${message}`);
    }
  });

  // Track whether the user has intentionally moved the map (avoid fighting them with fitBounds).
  let userMoved = false;
  const markUserMoved = () => {
    userMoved = true;
  };
  map.on("dragstart", markUserMoved);
  map.on("zoomstart", markUserMoved);
  map.on("rotatestart", markUserMoved);

  let viewportRefreshTimer = null;
  const maybeRefreshViewportScope = () => {
    if (!state.conn) {
      return;
    }
    if (!elements.bboxFilter?.checked) {
      return;
    }
    if (!getFeatureFlag(state.config, "viewportAutoRefresh", true)) {
      return;
    }
    if (viewportRefreshTimer) {
      window.clearTimeout(viewportRefreshTimer);
    }
    viewportRefreshTimer = window.setTimeout(() => {
      viewportRefreshTimer = null;
      onApplyFilters();
    }, 350);
  };

  let overlay = null;
  loadDeck()
    .then(({ MapboxOverlay }) => {
      overlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      });
      map.addControl(overlay);
      state.overlay = overlay;
      if (state.pendingGeojson) {
        const pending = state.pendingGeojson;
        state.pendingGeojson = null;
        updateOverlay(pending);
      }
    })
    .catch((error) => {
      setStatus(`Deck.gl overlay failed: ${error.message}`);
    });

  map.on("load", () => {
    if (config.pmtilesFile) {
      const pmtilesUrl = toAbsoluteUrl(joinUrl(config.dataBaseUrl, config.pmtilesFile));
      setStatus("Loading route tiles...");
      map.addSource("routes", {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`
      });

      const buildVectorLayers = (sourceLayer) => {
        if (map.getLayer("routes-line")) {
          map.removeLayer("routes-line");
        }
        if (map.getLayer(state.selectedLayerId)) {
          map.removeLayer(state.selectedLayerId);
        }

        map.addLayer({
          id: "routes-line",
          type: "line",
          source: "routes",
          "source-layer": sourceLayer,
          paint: {
            "line-color": "#d6603b",
            "line-width": ROUTE_LINE_WIDTH,
            "line-opacity": 0.78
          }
        });

        map.addLayer({
          id: state.selectedLayerId,
          type: "line",
          source: "routes",
          "source-layer": sourceLayer,
          filter: ["==", ["get", "__never__"], "__never__"],
          paint: {
            "line-color": "#f59e0b",
            "line-width": SELECTED_LINE_WIDTH,
            "line-opacity": 0.95
          }
        });
      };

      const configured = config.vectorLayer || "routes";
      buildVectorLayers(configured);

      // Diagnose common PMTiles failures (404 / no Range support) and missing rendering.
      const pmtilesProbe = async () => {
        try {
          const response = await fetch(pmtilesUrl, { headers: { Range: "bytes=0-15" } });
          if (!response.ok) {
            throw new Error(`PMTiles fetch failed (${response.status})`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const magic = String.fromCharCode(...bytes.slice(0, 7));
          if (magic !== "PMTiles") {
            throw new Error("PMTiles header mismatch (not a PMTiles file).");
          }
          // If the server ignores Range, it may return 200; PMTiles still often works but can be slow.
          const rangeOk = response.status === 206 || response.headers.get("accept-ranges") === "bytes";
          if (!rangeOk) {
            setStatus("PMTiles loaded, but server may not support Range requests (may not render). Use tools/dev_server.");
          }
        } catch (error) {
          setStatus(`Routes layer not loaded: ${error.message}`);
        }
      };
      pmtilesProbe();

      map.on("sourcedata", (event) => {
        if (!event) return;
        const id = event.sourceId || event.source?.id;
        if (id !== "routes") return;
        // When the first source data arrives, consider fitting to metadata bounds if provided.
        if (!userMoved && state.metadata?.bbox && getFeatureFlag(state.config, "autoFitBounds", true)) {
          fitMapToBbox(state.metadata.bbox, "Fitting to dataset bounds...");
        }
      });

      // Auto-detect the PMTiles source-layer name if the configured one yields no features.
      const detectSourceLayer = () => {
        if (!map.getSource("routes") || !map.isStyleLoaded()) {
          return;
        }
        const candidates = Array.from(
          new Set([configured, "routes", "scotlandbusroutes", "route_lines", "lines"].filter(Boolean))
        );
        for (const candidate of candidates) {
          try {
            const features = map.querySourceFeatures("routes", { sourceLayer: candidate });
            if (features && features.length) {
              if (candidate !== configured) {
                setStatus(`Detected PMTiles layer '${candidate}'.`);
                buildVectorLayers(candidate);
                detectTileFieldsFromRendered();
                applyMapFilters();
                syncSelectedLayer();
              }
              return;
            }
          } catch (error) {
            // Ignore until tiles are loaded.
          }
        }
      };

      map.once("idle", detectSourceLayer);
      map.on("idle", () => {
        // queryRenderedFeatures expects (geometry?, options). Passing the options object
        // as geometry breaks detection and can mask rendering issues.
        const rendered = map.queryRenderedFeatures(undefined, { layers: ["routes-line"] });
        if (!rendered.length) {
          detectSourceLayer();
        }
      });

      // If nothing renders after a short delay, surface a helpful hint.
      window.setTimeout(() => {
        const rendered = map.queryRenderedFeatures(undefined, { layers: ["routes-line"] });
        if (!rendered.length) {
          setStatus("No routes are rendering yet. Check vectorLayer/source-layer, file path, and Range support. Try GeoJSON preview.");
        } else {
          setStatus("Routes rendered.");
          if (!userMoved) {
            // Fit once when we first see data.
            fitMapToScope("Fitting to dataset scope...");
          }
        }
      }, 3500);
    } else if (config.geojsonFile) {
      const geoUrl = toAbsoluteUrl(joinUrl(config.dataBaseUrl, config.geojsonFile));
      map.addSource("routes-geojson", {
        type: "geojson",
        data: geoUrl
      });

      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes-geojson",
        paint: {
          "line-color": "#165570",
          "line-width": ROUTE_LINE_WIDTH,
          "line-opacity": 0.88
        }
      });

      map.addLayer({
        id: state.selectedLayerId,
        type: "line",
        source: "routes-geojson",
        filter: ["==", ["get", "__never__"], "__never__"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": SELECTED_LINE_WIDTH,
          "line-opacity": 0.95
        }
      });
    } else {
      setStatus("No routes data configured (pmtilesFile/geojsonFile). Map will show basemap only.");
      return;
    }

    map.on("click", "routes-line", (event) => {
      const features = event.features || [];
      const feature = features[0];
      if (!feature) {
        clearSelection();
        return;
      }
      setSelection(feature, getFeatureKey(feature));
      syncSelectedLayer();
      renderTable();
    });

    map.on("mouseenter", "routes-line", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "routes-line", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["routes-line", "routes-preview-line"] });
      if (!features.length) {
        clearSelection();
      }
    });

    // Try to infer tile field names from rendered features for reliable filters.
    const tryDetect = () => {
      detectTileFieldsFromRendered();
      applyMapFilters();
    };
    map.once("idle", tryDetect);
    map.on("idle", () => {
      if (!state.tileFields.serviceId || !state.tileFields.mode || !state.tileFields.operatorCode) {
        tryDetect();
      }
    });

    if (state.pendingPreviewGeojson) {
      const pending = state.pendingPreviewGeojson;
      state.pendingPreviewGeojson = null;
      showGeojsonOnMap(pending);
    }

    applyRouteColorMode();
    renderLegend();
    updateZoomButtons();
  });

  map.on("zoom", updateZoomButtons);
  map.on("moveend", () => {
    updateEvidence();
    maybeRefreshViewportScope();
  });
  map.on("idle", renderLegend);
  state.map = map;
};

const setBaseLayerFocus = (filtered) => {
  state.baseLayerFiltered = filtered;
  const map = state.map;
  const layerId = state.baseLayerId;
  if (!map || !layerId || !map.getLayer(layerId)) {
    return;
  }
  // MapLibre layer filters now do the heavy lifting; keep base paint stable.
  const opacity = state.baseLayerPaint.opacity;
  const width = state.baseLayerPaint.width;
  map.setPaintProperty(layerId, "line-opacity", opacity);
  map.setPaintProperty(layerId, "line-width", width);
};

const detectTileFieldsFromRendered = () => {
  const map = state.map;
  if (!map || !map.getLayer(state.baseLayerId)) {
    return;
  }
  const candidates = [];
  const canvas = map.getCanvas();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const points = [
    [w * 0.5, h * 0.5],
    [w * 0.25, h * 0.5],
    [w * 0.75, h * 0.5],
    [w * 0.5, h * 0.25],
    [w * 0.5, h * 0.75]
  ];
  points.forEach(([x, y]) => {
    const features = map.queryRenderedFeatures(
      [
        [x - 6, y - 6],
        [x + 6, y + 6]
      ],
      { layers: [state.baseLayerId] }
    );
    if (features && features.length) {
      candidates.push(...features.slice(0, 3));
    }
  });
  if (!candidates.length) {
    return;
  }

  const keys = new Map();
  candidates.forEach((feature) => {
    const props = feature?.properties || {};
    Object.keys(props).forEach((key) => {
      keys.set(String(key).toLowerCase(), key);
    });
  });

  const resolve = (names) => {
    for (const name of names) {
      const hit = keys.get(String(name).toLowerCase());
      if (hit) return hit;
    }
    return "";
  };

  state.tileFields.serviceId = state.tileFields.serviceId || resolve(["serviceId", "service_id", "service"]);
  state.tileFields.serviceName = state.tileFields.serviceName || resolve(["serviceName", "service_name", "name"]);
  state.tileFields.mode = state.tileFields.mode || resolve(["mode", "serviceMode"]);
  state.tileFields.operatorCode = state.tileFields.operatorCode || resolve(["operatorCode", "operator_code"]);
  state.tileFields.operatorName = state.tileFields.operatorName || resolve(["operatorName", "operator_name", "operator"]);
};

const detectSchemaFields = (columns) => {
  const columnLookup = new Map(columns.map((name) => [String(name).toLowerCase(), name]));
  const columnSet = new Set(columnLookup.keys());
  const findColumn = (candidates) => {
    for (const candidate of candidates) {
      const key = candidate.toLowerCase();
      if (columnSet.has(key)) {
        return columnLookup.get(key);
      }
    }
    return "";
  };
  const modeCandidates = ["mode", "serviceMode"];
  const operatorCandidates = ["operatorCode", "operatorName", "operator"];
  const bboxCandidates = {
    minx: ["bbox_minx", "minx", "xmin", "min_lon", "min_lng"],
    miny: ["bbox_miny", "miny", "ymin", "min_lat"],
    maxx: ["bbox_maxx", "maxx", "xmax", "max_lon", "max_lng"],
    maxy: ["bbox_maxy", "maxy", "ymax", "max_lat"]
  };

  state.modeField = findColumn(modeCandidates);
  state.operatorFields = operatorCandidates.map((name) => findColumn([name])).filter(Boolean);
  state.geojsonField = findColumn(["geojson"]);
  const bboxFields = {
    minx: findColumn(bboxCandidates.minx),
    miny: findColumn(bboxCandidates.miny),
    maxx: findColumn(bboxCandidates.maxx),
    maxy: findColumn(bboxCandidates.maxy)
  };
  state.bboxFields = bboxFields;
  state.bboxReady = Boolean(bboxFields.minx && bboxFields.miny && bboxFields.maxx && bboxFields.maxy);
};

const initDuckDb = async (config) => {
  setStatus("Initializing DuckDB...");
  const baseUrl = config.duckdbBaseUrl || "";
  const pickBundle = async (bundles) => {
    if (config.duckdbBundle && bundles[config.duckdbBundle]) {
      return bundles[config.duckdbBundle];
    }
    if (typeof window !== "undefined" && !window.crossOriginIsolated && bundles.mvp) {
      return bundles.mvp;
    }
    return duckdb.selectBundle(bundles);
  };

  const rebasedBundles = rebaseBundles(duckdb.getJsDelivrBundles(), baseUrl);
  let bundle = await pickBundle(rebasedBundles);
  const createDb = async (selected) => {
    setStatus("Loading DuckDB worker...");
    let worker = null;
    if (config.duckdbWorkerMode !== "blob") {
      try {
        worker = new Worker(selected.mainWorker, { type: "module" });
      } catch (error) {
        worker = null;
      }
    }
    if (!worker) {
      worker = await duckdb.createWorker(selected.mainWorker);
    }
    const workerError = new Promise((_, reject) => {
      const onError = (event) => {
        const message = event?.message || "DuckDB worker failed to start.";
        reject(new Error(message));
      };
      worker.addEventListener("error", onError, { once: true });
      worker.addEventListener("messageerror", onError, { once: true });
    });
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger("error"), worker);
    await withTimeout(
      Promise.race([
        db.instantiate(selected.mainModule, selected.pthreadWorker),
        workerError
      ]),
      15000,
      "DuckDB initialization timed out. Check duckdbBaseUrl assets."
    );
    return db;
  };

  const loadWithFallback = async () => {
    try {
      state.db = await createDb(bundle);
      return;
    } catch (error) {
      // If a local duckdbBaseUrl is configured but assets are missing, retry using CDN bundles.
      if (baseUrl) {
        setStatus("DuckDB local assets missing; retrying via CDN...");
        const cdnBundles = duckdb.getJsDelivrBundles();
        bundle = await pickBundle(cdnBundles);
        state.db = await createDb(bundle);
        return;
      }
      throw error;
    }
  };

  try {
    await loadWithFallback();
  } catch (error) {
    const hint = baseUrl
      ? `DuckDB worker failed to load from '${baseUrl}'. Add DuckDB assets under public/${baseUrl}/ or set duckdbBaseUrl:'' to use CDN.`
      : "DuckDB worker failed to load. If running locally, add DuckDB assets under public/duckdb (see README) or set duckdbBaseUrl:''.";
    throw new Error(`${hint}`);
  }

  const conn = await state.db.connect();
  // Note: do not force home/temp directories. Some DuckDB-WASM builds do not have
  // a '/' directory, and setting it can break initialization.

  let spatialReady = false;
  try {
    await conn.query("INSTALL spatial");
    await conn.query("LOAD spatial");
    spatialReady = true;
  } catch (error) {
    spatialReady = false;
  }

  const parquetUrl = toAbsoluteUrl(joinUrl(config.dataBaseUrl, config.parquetFile));
  await state.db.registerFileURL("routes.parquet", parquetUrl);

  const describeParquet = async () => {
    const result = await conn.query("DESCRIBE SELECT * FROM read_parquet('routes.parquet')");
    const columns = result.toArray().map((row) => row.column_name || row.name || row[0]);
    state.columns = columns;
    detectSchemaFields(columns);
    const columnLookup = new Map(columns.map((name) => [String(name).toLowerCase(), name]));
    state.geometryField = columnLookup.get("geometry") || columnLookup.get("geom") || "";
    return columns;
  };

  try {
    await describeParquet();
  } catch (error) {
    const maxBufferMb = config.parquetBufferMaxMb ?? 200;
    let canBuffer = false;
    try {
      const head = await fetch(parquetUrl, { method: "HEAD" });
      const length = Number(head.headers.get("content-length") || 0);
      canBuffer = !length || length <= maxBufferMb * 1024 * 1024;
    } catch (headError) {
      canBuffer = false;
    }

    if (canBuffer) {
      setStatus("Parquet URL read failed. Downloading full file for local access...");
      try {
        await state.db.dropFile("routes.parquet");
      } catch (dropError) {
        // Ignore if not registered yet.
      }
      const response = await fetch(parquetUrl);
      if (!response.ok) {
        throw new Error(`Parquet download failed (${response.status})`);
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      await state.db.registerFileBuffer("routes.parquet", buffer);
      await describeParquet();
    } else {
      throw error;
    }
  }

  elements.modeFilter.disabled = !state.modeField;
  elements.operatorFilter.disabled = !state.operatorFields.length;

  state.conn = conn;
  state.spatialReady = spatialReady;

  const geojsonAvailable = Boolean(state.geojsonField || (state.spatialReady && state.geometryField));
  const bboxAvailable = state.spatialReady || state.bboxReady;

  if (!bboxAvailable) {
    elements.bboxFilter.checked = false;
    elements.bboxFilter.disabled = true;
  } else {
    elements.bboxFilter.disabled = false;
  }

  if (!state.spatialReady && !geojsonAvailable) {
    setStatus("DuckDB ready. Spatial extension unavailable; GeoJSON preview/export disabled.");
  } else if (state.spatialReady) {
    setStatus("DuckDB ready with spatial support.");
  } else {
    setStatus("DuckDB ready. Using precomputed GeoJSON for previews.");
  }
};

const getSelectedValues = (select) => Array.from(select.selectedOptions).map((opt) => opt.value);

const getSelectedOperators = () =>
  Array.from(elements.operatorFilter.selectedOptions).map((opt) => ({
    value: opt.value,
    field: opt.dataset.field || "operatorCode"
  }));

const hasAttributeFilters = () => {
  const modes = getSelectedValues(elements.modeFilter);
  const operators = getSelectedOperators();
  const serviceSearch = getServiceSearchValue();
  return modes.length > 0 || operators.length > 0 || Boolean(serviceSearch);
};

const buildWhere = () => {
  const clauses = [];
  const modes = getSelectedValues(elements.modeFilter);
  const operators = getSelectedOperators();
  const serviceSearch = getServiceSearchValue();

  if (modes.length) {
    const hasNone = modes.includes(NONE_OPTION_VALUE);
    const values = modes.filter((mode) => mode !== NONE_OPTION_VALUE);
    if (state.modeField) {
      const modeField = quoteIdentifier(state.modeField);
      const modeClauses = [];
      if (values.length) {
        const list = values.map((mode) => `'${escapeSql(mode)}'`).join(", ");
        modeClauses.push(`${modeField} IN (${list})`);
      }
      if (hasNone) {
        modeClauses.push(`(${modeField} IS NULL OR ${modeField} = '')`);
      }
      if (modeClauses.length) {
        clauses.push(modeClauses.length > 1 ? `(${modeClauses.join(" OR ")})` : modeClauses[0]);
      }
    }
  }

  if (operators.length) {
    const hasNone = operators.some((item) => item.value === NONE_OPTION_VALUE);
    const filteredOperators = operators.filter((item) => item.value !== NONE_OPTION_VALUE);
    const byField = filteredOperators.reduce((acc, item) => {
      const field = item.field || "operatorCode";
      acc[field] = acc[field] || [];
      acc[field].push(item.value);
      return acc;
    }, {});

    const fieldClauses = Object.entries(byField)
      .filter(([, values]) => values.length)
      .map(([field, values]) => {
        const list = values.map((value) => `'${escapeSql(value)}'`).join(", ");
        return `${quoteIdentifier(field)} IN (${list})`;
      });

    if (hasNone && state.operatorFields.length) {
      const noneClauses = state.operatorFields.map(
        (field) => `(${quoteIdentifier(field)} IS NULL OR ${quoteIdentifier(field)} = '')`
      );
      fieldClauses.push(noneClauses.length > 1 ? `(${noneClauses.join(" OR ")})` : noneClauses[0]);
    }

    if (fieldClauses.length) {
      clauses.push(fieldClauses.length > 1 ? `(${fieldClauses.join(" OR ")})` : fieldClauses[0]);
    }
  }

  if (serviceSearch) {
    const lowered = escapeSql(serviceSearch.toLowerCase());
    const like = `'%${lowered}%'`;
    const searchClauses = [];
    if ((state.columns || []).includes("serviceName")) {
      searchClauses.push(`LOWER(CAST(${quoteIdentifier("serviceName")} AS VARCHAR)) LIKE ${like}`);
    }
    if ((state.columns || []).includes("serviceId")) {
      searchClauses.push(`LOWER(CAST(${quoteIdentifier("serviceId")} AS VARCHAR)) LIKE ${like}`);
    }
    if (searchClauses.length) {
      clauses.push(searchClauses.length > 1 ? `(${searchClauses.join(" OR ")})` : searchClauses[0]);
    }
  }

  if (state.spatialReady && state.geometryField && elements.bboxFilter.checked && state.map) {
    const bounds = state.map.getBounds();
    const minx = bounds.getWest();
    const miny = bounds.getSouth();
    const maxx = bounds.getEast();
    const maxy = bounds.getNorth();
    clauses.push(
      `ST_Intersects(${quoteIdentifier(state.geometryField)}, ST_MakeEnvelope(${minx}, ${miny}, ${maxx}, ${maxy}))`
    );
  } else if (state.bboxReady && elements.bboxFilter.checked && state.map) {
    const bounds = state.map.getBounds();
    const minx = bounds.getWest();
    const miny = bounds.getSouth();
    const maxx = bounds.getEast();
    const maxy = bounds.getNorth();
    const { minx: fieldMinx, miny: fieldMiny, maxx: fieldMaxx, maxy: fieldMaxy } = state.bboxFields;
    clauses.push(
      `${quoteIdentifier(fieldMinx)} <= ${maxx} AND ${quoteIdentifier(fieldMaxx)} >= ${minx} AND ${quoteIdentifier(
        fieldMiny
      )} <= ${maxy} AND ${quoteIdentifier(fieldMaxy)} >= ${miny}`
    );
  }

  if (!clauses.length) {
    return "";
  }
  return `WHERE ${clauses.join(" AND ")}`;
};

const buildMapFilter = () => {
  const expressions = ["all"];

  const modeKeys = mapCandidateKeys(state.tileFields.mode, ["mode", "serviceMode", "service_mode"]);
  const operatorKeys = mapCandidateKeys(state.tileFields.operatorCode, [
    "operatorCode",
    "operator_code",
    "operatorName",
    "operator_name",
    "operator"
  ]);
  const serviceIdKeys = mapCandidateKeys(state.tileFields.serviceId, ["serviceId", "service_id", "id", "routeId"]);
  const serviceNameKeys = mapCandidateKeys(state.tileFields.serviceName, ["serviceName", "service_name", "name"]);

  const modes = getSelectedValues(elements.modeFilter).filter((m) => m !== NONE_OPTION_VALUE);
  if (modes.length && modeKeys.length) {
    const value = coalesceGet(modeKeys, "");
    expressions.push(["match", value, modes, true, false]);
  }

  const operators = getSelectedOperators()
    .map((item) => item.value)
    .filter((value) => value && value !== NONE_OPTION_VALUE);
  if (operators.length) {
    if (operatorKeys.length) {
      const value = coalesceGet(operatorKeys, "");
      expressions.push(["match", value, operators, true, false]);
    }
  }

  const search = getServiceSearchValue().toLowerCase();
  if (search) {
    const clauses = [];
    if (serviceNameKeys.length) {
      clauses.push(["in", search, ["downcase", ["to-string", coalesceGet(serviceNameKeys, "")]]]);
    }
    if (serviceIdKeys.length) {
      clauses.push(["in", search, ["downcase", ["to-string", coalesceGet(serviceIdKeys, "")]]]);
    }
    if (clauses.length === 1) {
      expressions.push(clauses[0]);
    } else if (clauses.length > 1) {
      expressions.push(["any", ...clauses]);
    }
  }

  return expressions.length === 1 ? null : expressions;
};

const applyMapFilters = () => {
  const map = state.map;
  if (!map || !map.getLayer(state.baseLayerId)) {
    return;
  }
  const filter = buildMapFilter();
  map.setFilter(state.baseLayerId, filter);
  syncSelectedLayer();
};

const syncSelectedLayer = () => {
  const map = state.map;
  if (!map || !map.getLayer(state.selectedLayerId)) {
    return;
  }
  const serviceIdKey = state.tileFields.serviceId;
  const serviceId =
    serviceIdKey && state.selectedFeature ? getProp(state.selectedFeature.properties || {}, serviceIdKey) : null;
  if (!serviceIdKey || !serviceId) {
    map.setFilter(state.selectedLayerId, ["==", ["get", "__never__"], "__never__"]);
    return;
  }

  const baseFilter = map.getFilter(state.baseLayerId);
  const selectedFilter = ["==", ["to-string", ["get", serviceIdKey]], String(serviceId)];
  map.setFilter(state.selectedLayerId, baseFilter ? ["all", baseFilter, selectedFilter] : selectedFilter);
};

const queryCount = async () => {
  const where = buildWhere();
  const result = await state.conn.query(
    `SELECT COUNT(*) AS count FROM read_parquet('routes.parquet') ${where}`
  );
  const rows = result.toArray();
  return rows[0]?.count ?? 0;
};

const queryStatsSummary = async (where) => {
  const columns = state.columns || [];
  const selectParts = ["COUNT(*) AS total"];
  if (columns.includes("serviceId")) {
    selectParts.push(`COUNT(DISTINCT ${quoteIdentifier("serviceId")}) AS services`);
  }
  const operatorField = state.operatorFields[0];
  if (operatorField) {
    selectParts.push(`COUNT(DISTINCT ${quoteIdentifier(operatorField)}) AS operators`);
  }
  if (columns.includes("busesPerHour")) {
    selectParts.push(`AVG(${quoteIdentifier("busesPerHour")}) AS avg_bph`);
  }
  if (columns.includes("busesPerHourAverage")) {
    selectParts.push(`AVG(${quoteIdentifier("busesPerHourAverage")}) AS avg_bph_avg`);
  }
  if (columns.includes("runsEveryday")) {
    selectParts.push(`SUM(CASE WHEN ${quoteIdentifier("runsEveryday")} THEN 1 ELSE 0 END) AS runs_everyday`);
  }
  const query = `SELECT ${selectParts.join(", ")} FROM read_parquet('routes.parquet') ${where}`;
  const result = await state.conn.query(query);
  return result.toArray()[0] || {};
};

const queryStatsBreakdown = async (column, where, limit = 6) => {
  const labelExpr = `COALESCE(CAST(${quoteIdentifier(column)} AS VARCHAR), 'Unknown')`;
  const result = await state.conn.query(
    `SELECT ${labelExpr} AS label, COUNT(*) AS count FROM read_parquet('routes.parquet') ${where} GROUP BY 1 ORDER BY count DESC LIMIT ${limit}`
  );
  return result
    .toArray()
    .map((row) => ({
      label: row.label || "Unknown",
      count: toNumber(row.count)
    }))
    .filter((row) => row.count > 0);
};

const resetStats = () => {
  renderStatsGrid([]);
  renderStatsList(elements.statsModes, [], "Apply filters to see mode stats.");
  renderStatsList(elements.statsDirections, [], "Apply filters to see direction stats.");
  setStatsHint("Apply filters to generate insight.");
};

const updateStats = async (countOverride) => {
  if (!state.conn || !elements.statsGrid) {
    return;
  }
  const where = buildWhere();
  setStatsHint("Updating stats...");
  try {
    const summary = await queryStatsSummary(where);
    const total = toNumber(summary.total ?? countOverride ?? 0);
    const services = summary.services !== undefined ? toNumber(summary.services) : null;
    const operators = summary.operators !== undefined ? toNumber(summary.operators) : null;
    const avgBph = summary.avg_bph !== undefined && summary.avg_bph !== null ? Number(summary.avg_bph) : null;
    const avgBphAvg =
      summary.avg_bph_avg !== undefined && summary.avg_bph_avg !== null ? Number(summary.avg_bph_avg) : null;
    const runsEveryday = summary.runs_everyday !== undefined ? toNumber(summary.runs_everyday) : null;
    const runsEverydayPct = runsEveryday !== null && total > 0 ? runsEveryday / total : null;

    const items = [
      { label: "Routes", value: formatCount(total) },
      { label: "Services", value: services !== null ? formatCount(services) : "n/a" },
      { label: "Operators", value: operators !== null ? formatCount(operators) : "n/a" },
      { label: "Avg buses/hr", value: avgBph !== null ? formatDecimal(avgBph) : "n/a" },
      { label: "Avg buses/hr (avg)", value: avgBphAvg !== null ? formatDecimal(avgBphAvg) : "n/a" },
      { label: "Runs everyday", value: runsEverydayPct !== null ? formatPercent(runsEverydayPct) : "n/a" }
    ];

    renderStatsGrid(items);

    if (total === 0) {
      renderStatsList(elements.statsModes, [], "No routes in selection.");
      renderStatsList(elements.statsDirections, [], "No routes in selection.");
      setStatsHint("No routes matched the current filters.");
      return;
    }

    if (state.modeField) {
      const modes = await queryStatsBreakdown(state.modeField, where, 6);
      renderStatsList(
        elements.statsModes,
        modes.map((item) => ({ label: item.label, value: formatCount(item.count) })),
        "No mode data in selection."
      );
    } else {
      renderStatsList(elements.statsModes, [], "Mode column unavailable.");
    }

    if ((state.columns || []).includes("direction")) {
      const directions = await queryStatsBreakdown("direction", where, 6);
      renderStatsList(
        elements.statsDirections,
        directions.map((item) => ({ label: item.label, value: formatCount(item.count) })),
        "No direction data in selection."
      );
    } else {
      renderStatsList(elements.statsDirections, [], "Direction column unavailable.");
    }

    setStatsHint(where ? "Filtered stats updated." : "Dataset stats updated.");
  } catch (error) {
    setStatsHint(`Stats failed: ${error.message}`);
  }
};

const validateFilters = () => {
  const modes = getSelectedValues(elements.modeFilter);
  if (modes.length && !state.modeField) {
    return "Mode filter unavailable: no mode column detected in dataset.";
  }
  const operators = getSelectedOperators();
  if (operators.length && !state.operatorFields.length) {
    return "Operator filter unavailable: no operator columns detected in dataset.";
  }
  if (elements.bboxFilter.checked && !state.spatialReady && !state.bboxReady) {
    return "BBox filter unavailable: no geometry/bbox columns detected.";
  }
  if (state.spatialReady && elements.bboxFilter.checked && !state.geometryField) {
    return "BBox filter unavailable: geometry column not found.";
  }
  if (!state.spatialReady && elements.bboxFilter.checked && !state.bboxReady) {
    return "BBox filter unavailable: no bbox columns detected.";
  }
  return "";
};

const queryGeoJson = async (limit = 20000) => {
  const where = buildWhere();
  let query = "";
  if (state.geojsonField) {
    query = `
      SELECT *, ${state.geojsonField} AS geojson
      FROM read_parquet('routes.parquet')
      ${where}
      LIMIT ${limit}
    `;
  } else if (state.geometryField && state.spatialReady) {
    query = `
      SELECT *, ST_AsGeoJSON(${state.geometryField}) AS geojson
      FROM read_parquet('routes.parquet')
      ${where}
      LIMIT ${limit}
    `;
  } else {
    throw new Error("GeoJSON preview unavailable (no geometry/geojson column).");
  }
  const result = await state.conn.query(query);
  const rows = result.toArray();
  const columns = getResultColumns(result);

  const features = rows.map((row) => {
    let geometry = null;
    if (row.geojson) {
      geometry = typeof row.geojson === "string" ? JSON.parse(row.geojson) : row.geojson;
    }
    const properties = {};
    columns.forEach((column) => {
      if (column === "geometry" || column === "geom" || column === "geojson") {
        return;
      }
      properties[column] = row[column];
    });
    return {
      type: "Feature",
      geometry,
      properties
    };
  });

  return {
    type: "FeatureCollection",
    features
  };
};

const queryCsv = async (limit = 50000) => {
  const where = buildWhere();
  const columns = getCsvColumns();
  const selectList = columns.length ? columns.map(quoteIdentifier).join(", ") : "*";
  const query = `
    SELECT ${selectList}
    FROM read_parquet('routes.parquet')
    ${where}
    LIMIT ${limit}
  `;
  const result = await state.conn.query(query);
  const rows = result.toArray();
  if (!rows.length) {
    return "";
  }
  const headers = columns.length
    ? columns
    : getResultColumns(result).filter((column) => !EXCLUDED_CSV_COLUMNS.has(column));
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const values = headers.map((key) => {
      const value = row[key];
      if (value === null || value === undefined) {
        return "";
      }
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    });
    lines.push(values.join(","));
  });
  return lines.join("\n");
};

const getTableColumns = () => {
  const available = new Set(state.columns || []);
  const cols = [];
  if (available.has("serviceName")) cols.push({ key: "serviceName", label: "Service" });
  if (available.has("mode")) cols.push({ key: "mode", label: "Mode" });
  if (available.has("operatorName")) cols.push({ key: "operatorName", label: "Operator" });
  if (available.has("direction")) cols.push({ key: "direction", label: "Dir" });
  if (available.has("busesPerHour")) cols.push({ key: "busesPerHour", label: "BPH", align: "right" });
  if (available.has("serviceId")) cols.push({ key: "serviceId", label: "Service ID", mono: true });
  return cols;
};

const renderTableHead = () => {
  if (!elements.dataTableHead) {
    return;
  }
  clearElement(elements.dataTableHead);
  const cols = getTableColumns();
  cols.forEach((col) => {
    const th = document.createElement("th");
    th.className =
      "px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border" +
      (col.align === "right" ? " text-right" : "");
    th.textContent = col.label;
    elements.dataTableHead.appendChild(th);
  });
};

const renderTable = () => {
  if (!elements.dataTableBody || !elements.dataTableEmpty) {
    return;
  }
  renderTableHead();
  clearElement(elements.dataTableBody);

  const rows = state.tableRows || [];
  const cols = getTableColumns();
  elements.dataTableEmpty.style.display = rows.length ? "none" : "flex";

  const selectedServiceId = getSelectedServiceId();
  if (elements.tableMeta) {
    const total = state.lastQuery?.count ?? null;
    if (!rows.length) {
      elements.tableMeta.textContent = "No rows.";
    } else if (total !== null && total !== undefined && total > rows.length) {
      elements.tableMeta.textContent = `Showing ${formatCount(rows.length)} of ${formatCount(total)} (table capped at ${formatCount(
        state.tableLimit
      )}).`;
    } else {
      elements.tableMeta.textContent = `${formatCount(rows.length)} rows.`;
    }
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const rowServiceId = row.serviceId ?? null;
    const isSelected = selectedServiceId && rowServiceId && String(rowServiceId) === String(selectedServiceId);
    tr.className = isSelected
      ? "bg-blue-50/60 hover:bg-blue-50 transition-colors cursor-pointer"
      : "hover:bg-slate-50 transition-colors cursor-pointer";
    tr.addEventListener("click", () => {
      setSelection({ properties: row }, `serviceId:${rowServiceId ?? ""}`);
      syncSelectedLayer();
      renderTable();
    });

    cols.forEach((col) => {
      const td = document.createElement("td");
      td.className =
        "px-4 py-2.5 text-text-secondary" +
        (col.align === "right" ? " text-right font-mono" : "") +
        (col.key === "serviceName" ? " font-medium text-text-main" : "") +
        (col.mono ? " font-mono" : "");
      const value = row[col.key];
      td.textContent = value === null || value === undefined ? "" : String(value);
      tr.appendChild(td);
    });

    elements.dataTableBody.appendChild(tr);
  });
};

const normalizePreviewProps = (props) => {
  const source = props || {};
  const normalized = { ...source };
  const mappings = [
    ["service_id", "serviceId"],
    ["serviceid", "serviceId"],
    ["service_name", "serviceName"],
    ["servicename", "serviceName"],
    ["operator_code", "operatorCode"],
    ["operatorcode", "operatorCode"],
    ["operator_name", "operatorName"],
    ["operatorname", "operatorName"]
  ];
  mappings.forEach(([from, to]) => {
    if (normalized[to] !== undefined && normalized[to] !== null && normalized[to] !== "") {
      return;
    }
    const value = getProp(source, from);
    if (value !== undefined && value !== null && value !== "") {
      normalized[to] = value;
    }
  });
  return normalized;
};

const showGeojsonOnMap = (geojson) => {
  const map = state.map;
  if (!geojson) {
    return;
  }
  if (!map || !map.loaded()) {
    state.pendingPreviewGeojson = geojson;
    return;
  }
  const sourceId = "routes-preview";
  const layerId = "routes-preview-line";
  const selectedId = "routes-preview-selected";
  const bindKey = "_previewClickBound";

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: geojson });
  } else {
    const source = map.getSource(sourceId);
    if (source && typeof source.setData === "function") {
      source.setData(geojson);
    }
  }

  if (!map.getLayer(layerId)) {
    map.addLayer(
      {
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#165570",
          "line-width": ROUTE_LINE_WIDTH,
          "line-opacity": 0.9
        }
      },
      // If PMTiles layer exists, draw preview above it.
      map.getLayer(state.selectedLayerId) ? state.selectedLayerId : undefined
    );
  }

  if (!map.getLayer(selectedId)) {
    map.addLayer({
      id: selectedId,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "__never__"], "__never__"],
      paint: {
        "line-color": "#f59e0b",
        "line-width": SELECTED_LINE_WIDTH,
        "line-opacity": 0.95
      }
    });
  }

  if (!state[bindKey]) {
    state[bindKey] = true;
    map.on("click", layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        clearSelection();
        return;
      }
      setSelection(feature, getFeatureKey(feature));
      renderTable();
      // best-effort highlight by serviceId if available
      const serviceId = getSelectedServiceId();
      const serviceKey = state.tileFields.serviceId || "serviceId";
      if (serviceId) {
        map.setFilter(selectedId, ["==", ["to-string", ["get", serviceKey]], serviceId]);
      }
    });
  }

  renderLegend();
};

const queryTable = async (limit = 250) => {
  const where = buildWhere();
  const cols = getTableColumns().map((c) => c.key);
  const selectList = cols.length ? cols.map(quoteIdentifier).join(", ") : "*";
  const query = `
    SELECT ${selectList}
    FROM read_parquet('routes.parquet')
    ${where}
    ORDER BY ${state.columns.includes("serviceName") ? quoteIdentifier("serviceName") : "1"}
    LIMIT ${limit}
  `;
  const result = await state.conn.query(query);
  return result.toArray();
};

const updateScopeChips = () => {
  if (!elements.scopeChips) {
    return;
  }
  clearElement(elements.scopeChips);

  const chips = [];
  const modes = getSelectedValues(elements.modeFilter).filter((m) => m !== NONE_OPTION_VALUE);
  const operators = getSelectedOperators()
    .map((o) => o.value)
    .filter((o) => o && o !== NONE_OPTION_VALUE);
  const search = getServiceSearchValue();
  const bbox = elements.bboxFilter?.checked ? "Viewport" : "";

  if (modes.length) chips.push({ key: "modes", icon: "directions_bus", label: `Mode: ${modes.join(", ")}` });
  if (operators.length) chips.push({ key: "ops", icon: "apartment", label: `Operator: ${operators.join(", ")}` });
  if (search) chips.push({ key: "search", icon: "search", label: `Search: ${search}` });
  if (bbox) chips.push({ key: "bbox", icon: "crop_free", label: `Limit: ${bbox}` });

  if (!chips.length) {
    const empty = document.createElement("div");
    empty.className = "text-[11px] text-text-tertiary";
    empty.textContent = "No active scope.";
    elements.scopeChips.appendChild(empty);
    return;
  }

  const removeFor = (key) => {
    if (key === "modes") {
      Array.from(elements.modeFilter.options).forEach((opt) => {
        opt.selected = false;
      });
    } else if (key === "ops") {
      Array.from(elements.operatorFilter.options).forEach((opt) => {
        opt.selected = false;
      });
    } else if (key === "search") {
      if (elements.serviceSearch) elements.serviceSearch.value = "";
    } else if (key === "bbox") {
      if (elements.bboxFilter && !elements.bboxFilter.disabled) elements.bboxFilter.checked = false;
    }
    onApplyFilters();
  };

  chips.forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-slate-100 text-text-main border border-slate-200 rounded-full text-xs font-medium hover:bg-slate-200 transition-colors";
    button.innerHTML = `
      <span class="material-symbols-outlined text-[14px]">${chip.icon}</span>
      <span>${chip.label}</span>
      <span class="flex items-center justify-center h-4 w-4 rounded-full hover:bg-slate-300 ml-0.5" data-remove="1">
        <span class="material-symbols-outlined text-[12px]">close</span>
      </span>
    `;
    button.addEventListener("click", (event) => {
      const remove = event.target?.closest?.("[data-remove]");
      if (remove) {
        event.preventDefault();
        removeFor(chip.key);
      }
    });
    elements.scopeChips.appendChild(button);
  });
};

const updateEvidence = () => {
  if (!elements.evidenceLeft || !elements.evidenceRight) {
    return;
  }
  const meta = state.metadata || {};
  const generatedAt = meta.generatedAt || meta.lastUpdated || "Unknown";
  const total = meta.counts?.total ?? meta.total ?? null;
  const where = buildWhere();
  const hasFilters = Boolean(where);
  const hint = hasFilters ? "Filtered view" : "Full dataset";

  elements.evidenceLeft.innerHTML = "";
  const selectionCount = state.lastQuery?.count ?? null;
  const limitNote =
    selectionCount !== null && selectionCount !== undefined && selectionCount > state.tableLimit
      ? `Table shows first ${formatCount(state.tableLimit)}`
      : null;
  const leftParts = [
    `Scope: <strong class="font-semibold">${hint}</strong>`,
    total ? `Dataset rows: <strong class="font-semibold">${formatCount(total)}</strong>` : null,
    selectionCount !== null && selectionCount !== undefined
      ? `Selection: <strong class="font-semibold">${formatCount(selectionCount)}</strong>`
      : null,
    limitNote ? `Limit: <strong class="font-semibold">${limitNote}</strong>` : null,
    `Updated: <strong class="font-semibold">${generatedAt}</strong>`
  ].filter(Boolean);
  elements.evidenceLeft.innerHTML = leftParts.map((p) => `<span>${p}</span>`).join("");

  const map = state.map;
  const center = map ? map.getCenter() : null;
  const zoom = map ? map.getZoom() : null;
  const rightParts = [
    center ? `Lat: ${center.lat.toFixed(4)}, Lon: ${center.lng.toFixed(4)}` : null,
    zoom !== null ? `Zoom: ${zoom.toFixed(2)}` : null
  ].filter(Boolean);
  elements.evidenceRight.textContent = rightParts.join(" | ");
};

const updateOverlay = (geojson) => {
  if (!state.overlay || !state.deck) {
    state.pendingGeojson = geojson;
    return;
  }
  state.pendingGeojson = null;
  state.overlayVersion += 1;
  const selectedKey = state.selectedFeatureKey;
  const features = geojson.features || [];

  // Performance: Pre-calculate colors when coloring by operator to avoid expensive
  // lookups inside the Deck.gl render loop.
  if (state.colorByOperator) {
    features.forEach((feature) => {
      // It's safe to mutate feature properties here, as this geojson data is
      // transient and regenerated on each filter application.
      if (!feature.properties) feature.properties = {};
      const operator = getOperatorValue(feature.properties);
      feature.properties._operatorColor = getOperatorColor(operator || "Unknown");
    });
  }

  const selectedFeatures = selectedKey
    ? features.filter((feature, idx) => getFeatureKey(feature, String(idx)) === selectedKey)
    : [];
  if (selectedKey && !selectedFeatures.length) {
    state.selectedFeature = null;
    state.selectedFeatureKey = null;
    renderSelection(null);
  }

  const baseLayer = new state.deck.PathLayer({
    id: `filtered-routes-${state.overlayVersion}`,
    data: features,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 226, 145, 200],
    getPath: (feature) => feature.geometry?.coordinates || [],
    getColor: (feature) => {
      if (state.colorByOperator) {
        // Fallback color for safety, though _operatorColor should always be present.
        return (feature.properties || {})._operatorColor || [22, 85, 112, 180];
      }
      return [22, 85, 112, 180];
    },
    widthUnits: "pixels",
    getWidth: 2,
    opacity: 0.9,
    onClick: (info) => {
      if (!info?.object) {
        clearSelection();
        return;
      }
      const fallbackKey = info.index !== undefined ? String(info.index) : "";
      setSelection(info.object, fallbackKey);
      if (state.lastPreviewGeojson) {
        updateOverlay(state.lastPreviewGeojson);
      }
    }
  });

  const highlightLayer = selectedFeatures.length
    ? new state.deck.PathLayer({
        id: `filtered-routes-highlight-${state.overlayVersion}`,
        data: selectedFeatures,
        getPath: (feature) => feature.geometry?.coordinates || [],
        getColor: [255, 214, 102, 230],
        widthUnits: "pixels",
        getWidth: 5,
        opacity: 0.95
      })
    : null;

  state.overlay.setProps({ layers: highlightLayer ? [baseLayer, highlightLayer] : [baseLayer] });
};

const sampleGeojson = () => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { serviceId: "sample-1", operatorName: "Sample Rail", mode: "RAIL" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-3.3, 55.95],
          [-3.8, 55.95],
          [-4.2, 55.93],
          [-4.3, 55.86]
        ]
      }
    },
    {
      type: "Feature",
      properties: { serviceId: "sample-2", operatorName: "Sample Coach", mode: "COACH" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-3.1, 55.99],
          [-3.5, 56.12],
          [-3.9, 56.08],
          [-4.0, 55.98]
        ]
      }
    }
  ]
});

const downloadFile = (content, filename, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const loadGeojsonPreview = async () => {
  const config = state.config || {};
  const geojsonPath = config.geojsonFile;
  if (!geojsonPath) {
    setStatus("No geojsonFile configured.");
    return;
  }
  const url = toAbsoluteUrl(joinUrl(config.dataBaseUrl, geojsonPath));
  const limit = Math.max(1, Math.min(Number(config.geojsonPreviewLimit ?? 500), 5000));

  toggleActionButtons(false);
  setStatus(`Loading GeoJSON preview (first ${formatCount(limit)} features)...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoJSON fetch failed (${response.status})`);
  }
  if (!response.body) {
    // Fallback: full text (may be large).
    const full = await response.json();
    const features = Array.isArray(full.features) ? full.features.slice(0, limit) : [];
    return { type: "FeatureCollection", features };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let inFeatures = false;
  let depth = 0;
  let current = "";
  const features = [];

  const pushFeatureIfComplete = () => {
    if (!current.trim()) {
      return;
    }
    try {
      const feature = JSON.parse(current);
      if (feature && feature.type === "Feature") {
        features.push(feature);
      }
    } catch (error) {
      // Ignore partial parses; this is a best-effort preview loader.
    }
  };

  try {
    while (features.length < limit) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      // Find the "features" array start once.
      if (!inFeatures) {
        const idx = buffer.indexOf('"features"');
        if (idx === -1) {
          if (done) break;
          if (buffer.length > 1024 * 1024) {
            buffer = buffer.slice(-1024 * 16);
          }
          continue;
        }
        const arrIdx = buffer.indexOf("[", idx);
        if (arrIdx === -1) {
          if (done) break;
          continue;
        }
        buffer = buffer.slice(arrIdx + 1);
        inFeatures = true;
      }

      // Extract feature objects by tracking brace depth.
      for (let i = 0; i < buffer.length && features.length < limit; i += 1) {
        const ch = buffer[i];
        if (depth === 0) {
          if (ch === "{") {
            depth = 1;
            current = "{";
          } else if (ch === "]") {
            // End of features array.
            features.length = Math.min(features.length, limit);
            buffer = buffer.slice(i + 1);
            break;
          }
          continue;
        }

        current += ch;
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;

        if (depth === 0) {
          pushFeatureIfComplete();
          current = "";
        }
      }

      // Keep only unread tail when still streaming.
      if (depth === 0) {
        const lastBrace = buffer.lastIndexOf("}");
        buffer = lastBrace !== -1 ? buffer.slice(lastBrace + 1) : "";
      } else {
        // Keep current partial object + a small tail.
        buffer = current.length ? "" : buffer.slice(-1024 * 32);
      }

      if (done) break;
    }
  } finally {
    if (features.length >= limit) {
      try {
        await reader.cancel();
      } catch (error) {
        // Ignore.
      }
    }
  }

  return { type: "FeatureCollection", features };
};

const onApplyFilters = async () => {
  toggleActionButtons(false);
  setStatus("Applying filters...");

  try {
    const filtered = hasAttributeFilters();
    applyMapFilters();
    setBaseLayerFocus(filtered);
    updateScopeChips();
    updateEvidence();
    renderLegend();
    if (state.map) {
      state.map.once("idle", () => fitMapToScope("Fitting to filtered scope..."));
    }

    if (!state.conn) {
      setPreview("Filters applied to map. DuckDB is unavailable, so table/stats/exports are disabled.");
      renderTable();
      return;
    }

    const validation = validateFilters();
    if (validation) {
      setStatus(validation);
      return;
    }

    const count = await queryCount();
    const countNumber = toNumber(count);
    setPreview(`${formatCount(count)} routes in selection.`);

    if (countNumber === 0) {
      setStatus("No routes matched the current filters.");
      state.tableRows = [];
      renderTable();
    } else {
      setStatus("Filters applied. Table/stats updated.");
    }

    await updateStats(countNumber);
    state.tableRows = await queryTable(state.tableLimit);
    renderTable();
    updateEvidence();
    state.lastQuery = { count: countNumber };
  } catch (error) {
    setStatus(`Query failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};

const onClearFilters = () => {
  Array.from(elements.modeFilter.options).forEach((opt) => {
    opt.selected = false;
  });
  Array.from(elements.operatorFilter.options).forEach((opt) => {
    opt.selected = false;
  });
  if (elements.serviceSearch) {
    elements.serviceSearch.value = "";
  }
  setPreview("No filters applied.");
  if (state.overlay) {
    state.overlay.setProps({ layers: [] });
  }
  state.lastPreviewGeojson = null;
  state.tableRows = [];
  clearSelection();
  setBaseLayerFocus(false);
  applyMapFilters();
  updateScopeChips();
  renderTable();
  resetStats();
  updateEvidence();
  renderLegend();
  setStatus("Filters cleared.");
};

const onLoadSample = async () => {
  try {
    const geojson = await loadGeojsonPreview();
    state.lastPreviewGeojson = geojson;
    updateOverlay(geojson);
    showGeojsonOnMap(geojson);
    setPreview(`GeoJSON preview: ${formatCount(geojson.features.length)} routes (preview only).`);
    fitMapToScope("Fitting to preview scope...");

    // Populate a small table from the preview, even if DuckDB isn't running yet.
    state.tableRows = geojson.features
      .slice(0, state.tableLimit)
      .map((feature) => normalizePreviewProps(feature.properties || {}));
    renderTable();

    setStatsHint("GeoJSON preview loaded. Use DuckDB for full stats/exports when available.");
    setStatus("GeoJSON preview loaded.");
  } catch (error) {
    setStatus(`GeoJSON preview failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};

const onDownloadGeojson = async () => {
  if (!state.geojsonField && !state.spatialReady) {
    setStatus("GeoJSON export requires spatial extension or geojson column.");
    return;
  }
  if (!state.geojsonField && !state.geometryField) {
    setStatus("Geometry column not found in dataset.");
    return;
  }
  const validation = validateFilters();
  if (validation) {
    setStatus(validation);
    return;
  }
  toggleActionButtons(false);
  setStatus("Preparing GeoJSON download...");
  try {
    const count = await queryCount();
    const countNumber = toNumber(count);
    const ok = await confirmLargeExport(countNumber, "geojson");
    if (!ok) {
      setStatus("Export cancelled.");
      return;
    }
    const limit = countNumber > 50000 ? 50000 : countNumber;
    if (countNumber > 50000) {
      setStatus("Large export capped at 50,000 rows. Narrow filters for full export.");
    }
    const geojson = await queryGeoJson(limit || 50000);
    downloadFile(JSON.stringify(geojson), "routes-filtered.geojson", "application/json");
    setStatus("GeoJSON download ready.");
  } catch (error) {
    setStatus(`GeoJSON export failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};

const onDownloadCsv = async () => {
  const validation = validateFilters();
  if (validation) {
    setStatus(validation);
    return;
  }
  toggleActionButtons(false);
  setStatus("Preparing CSV download...");
  try {
    const count = await queryCount();
    const countNumber = toNumber(count);
    const ok = await confirmLargeExport(countNumber, "csv");
    if (!ok) {
      setStatus("Export cancelled.");
      return;
    }
    const limit = countNumber > 50000 ? 50000 : countNumber;
    if (countNumber > 50000) {
      setStatus("Large export capped at 50,000 rows. Narrow filters for full export.");
    }
    const csv = await queryCsv(limit || 50000);
    downloadFile(csv, "routes-filtered.csv", "text/csv");
    setStatus("CSV download ready.");
  } catch (error) {
    setStatus(`CSV export failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};

const loadMetadata = async (config) => {
  const metadataUrl = joinUrl(config.dataBaseUrl, config.metadataFile);
  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error(`Failed to load metadata (${response.status})`);
  }
  const metadata = await response.json();
  state.metadata = metadata;

  const dateValue = metadata.generatedAt || metadata.lastUpdated || "Unknown";
  const total = metadata.counts?.total ?? metadata.total ?? null;

  elements.datasetDate.textContent = `Updated: ${dateValue}`;
  elements.datasetCount.textContent = total ? `${formatCount(total)} routes` : "";
  populateFilters();
  updateEvidence();
  updateScopeChips();
  if (state.map && metadata?.bbox && getFeatureFlag(state.config, "autoFitBounds", true)) {
    fitMapToBbox(metadata.bbox, "Fitting to dataset bounds...");
  }
};

const initTabs = () => {
  const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  if (!buttons.length || !panels.length) {
    return;
  }
  const setActive = (name) => {
    buttons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tabButton === name);
    });
    panels.forEach((panel) => {
      const active = panel.dataset.tabPanel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => setActive(button.dataset.tabButton));
  });
  setActive("filters");
};

const applyUiConfig = (config) => {
  const ui = config.ui || {};

  if (ui.title) {
    document.title = ui.title;
  }

  if (ui.header) {
    const heading = document.querySelector("header h1");
    const subtitle = document.querySelector("header p");

    if (heading && ui.header.heading) {
      heading.textContent = ui.header.heading;
    }
    if (subtitle && ui.header.subtitle) {
      subtitle.textContent = ui.header.subtitle;
    }
  }

  if (ui.footer) {
    let footer = document.querySelector(".app-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className =
        "app-footer border-t border-border bg-surface px-4 py-2 text-[10px] text-text-secondary text-center";
      document.body.appendChild(footer);
    }
    footer.textContent = ui.footer;
  }
};

const init = async () => {
  try {
    toggleActionButtons(false);
    const params = new URLSearchParams(window.location.search);
    const configPath = params.get("config") || "config.json";
    const configResponse = await fetch(configPath, { cache: "no-store" });
    if (!configResponse.ok) {
      throw new Error(`Config load failed (${configResponse.status})`);
    }
    state.config = await configResponse.json();
    applyFeatureFlags(state.config);

    applyUiConfig(state.config);
    initMap(state.config);

    if (elements.advancedToggle) {
      let initial = false;
      try {
        initial = localStorage.getItem("advancedOpen") === "1";
      } catch (error) {
        initial = false;
      }
      setAdvancedOpen(initial);
      elements.advancedToggle.addEventListener("click", () => {
        const expanded = elements.advancedToggle.getAttribute("aria-expanded") === "true";
        setAdvancedOpen(!expanded);
      });
    }

    if (elements.zoomIn) {
      elements.zoomIn.addEventListener("click", () => {
        if (state.map) state.map.zoomIn({ duration: 200 });
      });
    }
    if (elements.zoomOut) {
      elements.zoomOut.addEventListener("click", () => {
        if (state.map) state.map.zoomOut({ duration: 200 });
      });
    }
    if (elements.dataInspectorFilter) {
      elements.dataInspectorFilter.addEventListener("click", () => {
        if (!elements.sidebar) {
          return;
        }
        const hidden = elements.sidebar.style.display === "none";
        elements.sidebar.style.display = hidden ? "" : "none";
        if (state.map) {
          state.map.resize();
        }
        setStatus(hidden ? "Filters panel shown." : "Filters panel hidden.");
      });
    }
    if (elements.dataInspectorExpand) {
      elements.dataInspectorExpand.addEventListener("click", () => {
        if (!elements.dataInspector) {
          return;
        }
        const expanded = elements.dataInspector.dataset.expanded === "true";
        elements.dataInspector.dataset.expanded = expanded ? "false" : "true";
        elements.dataInspector.style.height = expanded ? "" : "70vh";
        const icon = elements.dataInspectorExpand.querySelector(".material-symbols-outlined");
        if (icon) {
          icon.textContent = expanded ? "open_in_full" : "close_fullscreen";
        }
        if (state.map) {
          state.map.resize();
        }
      });
    }
    initTabs();
    resetStats();
    renderTable();
    try {
      await loadMetadata(state.config);
    } catch (error) {
      elements.datasetDate.textContent = "Metadata unavailable";
      elements.datasetCount.textContent = "";
      setStatus(`Metadata load failed: ${error.message}`);
    }

    // Enable map-scoped filtering even if DuckDB fails to start.
    toggleActionButtons(true);
    updateEvidence();
    updateScopeChips();

    try {
      await initDuckDb(state.config);
      populateFilters();

      const total = state.metadata?.counts?.total ?? state.metadata?.total ?? null;
      const countNumber = total !== null && total !== undefined ? toNumber(total) : null;
      if (countNumber !== null) {
        setPreview(`${formatCount(countNumber)} routes in dataset.`);
      } else {
        setPreview("Dataset loaded.");
      }
      state.tableRows = await queryTable(state.tableLimit);
      renderTable();
      await updateStats(countNumber);
      updateEvidence();
    } catch (duckdbError) {
      state.conn = null;
      state.db = null;
      elements.bboxFilter.checked = false;
      elements.bboxFilter.disabled = true;
      state.tableRows = [];
      renderTable();
      setPreview("Map ready. DuckDB failed to start, so table/stats/exports are disabled.");
      setStatus(duckdbError.message);
      if (state.config?.geojsonFile) {
        try {
          const geojson = await loadGeojsonPreview();
          state.lastPreviewGeojson = geojson;
          updateOverlay(geojson);
          state.tableRows = geojson.features.slice(0, state.tableLimit).map((feature) => feature.properties || {});
          renderTable();
          setPreview(`GeoJSON preview: ${formatCount(geojson.features.length)} routes (preview only).`);
          setStatus("DuckDB unavailable; using GeoJSON preview for table/selection.");
        } catch (previewError) {
          setStatus(`DuckDB unavailable; GeoJSON preview failed: ${previewError.message}`);
        }
      }
    }

    elements.applyFilters.addEventListener("click", onApplyFilters);
    elements.clearFilters.addEventListener("click", onClearFilters);
    if (elements.clearAll) {
      elements.clearAll.addEventListener("click", onClearFilters);
    }
    elements.loadSample.addEventListener("click", onLoadSample);
    elements.downloadGeojson.addEventListener("click", onDownloadGeojson);
    elements.downloadCsv.addEventListener("click", onDownloadCsv);
    if (elements.exportCsvTable) {
      elements.exportCsvTable.addEventListener("click", onDownloadCsv);
    }
    if (elements.serviceSearch) {
      let timer = null;
      elements.serviceSearch.addEventListener("keydown", (event) => {
        if (handleDropdownKeyNav(event, elements.serviceSearch, elements.serviceSearchResults)) {
          return;
        }
        if (event.key === "Enter") {
          if (timer) window.clearTimeout(timer);
          onApplyFilters();
          hideDropdown(elements.serviceSearchResults);
        }
      });
      elements.serviceSearch.addEventListener("input", () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          onApplyFilters();
        }, 350);
        // Also update suggestions as the user types.
        const value = getServiceSearchValue();
        if (value && state.conn) {
          queryServiceSuggestions(value).then((rows) => {
            const items = rows.map((row) => ({
              value: row.serviceId || row.serviceName,
              html: `<div class="font-semibold text-text-main">${escapeHtml(row.serviceName || row.serviceId)}</div>
<div class="text-[11px] text-text-secondary">${escapeHtml(row.serviceId)} • ${escapeHtml(row.operatorName)} • ${escapeHtml(row.mode)}</div>`
            }));
            renderDropdownItems(elements.serviceSearchResults, items, (item) => {
              elements.serviceSearch.value = item.value;
              hideDropdown(elements.serviceSearchResults);
              onApplyFilters();
            });
            setDropdownActive(elements.serviceSearchResults, 0);
          });
        } else {
          hideDropdown(elements.serviceSearchResults);
        }
      });
      elements.serviceSearch.addEventListener("focus", () => {
        const value = getServiceSearchValue();
        if (value && state.conn) {
          queryServiceSuggestions(value).then((rows) => {
            const items = rows.map((row) => ({
              value: row.serviceId || row.serviceName,
              html: `<div class="font-semibold text-text-main">${escapeHtml(row.serviceName || row.serviceId)}</div>
<div class="text-[11px] text-text-secondary">${escapeHtml(row.serviceId)} • ${escapeHtml(row.operatorName)} • ${escapeHtml(row.mode)}</div>`
            }));
            renderDropdownItems(elements.serviceSearchResults, items, (item) => {
              elements.serviceSearch.value = item.value;
              hideDropdown(elements.serviceSearchResults);
              onApplyFilters();
            });
            setDropdownActive(elements.serviceSearchResults, 0);
          });
        }
      });
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!target) return;
        const inSearch =
          target === elements.serviceSearch ||
          target === elements.serviceSearchResults ||
          elements.serviceSearchResults?.contains?.(target);
        if (!inSearch) {
          hideDropdown(elements.serviceSearchResults);
        }
      });
    }
    if (elements.bboxFilter) {
      elements.bboxFilter.addEventListener("change", () => onApplyFilters());
    }

    // Place search (feature-flagged geocoder).
    if (getFeatureFlag(state.config, "geocoder", false) && elements.placeSearch && elements.placeSearchResults) {
      let timer = null;
      const marker = new maplibregl.Marker({ color: "#2563eb" });
      const geocoder = state.config.geocoder || {};
      const endpoint = geocoder.endpoint || "https://nominatim.openstreetmap.org/search";
      const countryCodes = geocoder.countryCodes || "gb";
      const limit = Math.max(1, Math.min(Number(geocoder.limit ?? 6), 10));

      const runGeocode = async () => {
        const q = String(elements.placeSearch.value || "").trim();
        if (q.length < 3) {
          hideDropdown(elements.placeSearchResults);
          return;
        }
        const url = new URL(endpoint);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("q", q);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("countrycodes", countryCodes);
        url.searchParams.set("addressdetails", "1");

        const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Geocoder failed (${response.status})`);
        }
        const results = await response.json();
        const items = (results || []).map((r) => {
          const name = r.display_name || r.name || "";
          const lat = Number(r.lat);
          const lon = Number(r.lon);
          const bbox = Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null;
          return {
            name,
            lat,
            lon,
            bbox,
            html: `<div class="font-semibold text-text-main">${escapeHtml(name)}</div>
<div class="text-[11px] text-text-secondary">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>`
          };
        });

        renderDropdownItems(elements.placeSearchResults, items, (item) => {
          hideDropdown(elements.placeSearchResults);
          if (state.map) {
            if (item.bbox && item.bbox.length === 4) {
              // nominatim boundingbox: [south, north, west, east]
              const [south, north, west, east] = item.bbox;
              state.map.fitBounds(
                [
                  [west, south],
                  [east, north]
                ],
                { padding: 50, duration: 500 }
              );
            } else {
              state.map.flyTo({ center: [item.lon, item.lat], zoom: 12.5, duration: 500 });
            }
            marker.setLngLat([item.lon, item.lat]).addTo(state.map);
            updateEvidence();
          }
        });
        setDropdownActive(elements.placeSearchResults, 0);
      };

      elements.placeSearch.addEventListener("input", () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          runGeocode().catch((error) => setStatus(error.message));
        }, 350);
      });
      elements.placeSearch.addEventListener("keydown", (event) => {
        if (handleDropdownKeyNav(event, elements.placeSearch, elements.placeSearchResults)) {
          return;
        }
        if (event.key === "Enter") {
          if (timer) window.clearTimeout(timer);
          runGeocode().catch((error) => setStatus(error.message));
        }
        if (event.key === "Escape") {
          hideDropdown(elements.placeSearchResults);
        }
      });
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!target) return;
        const inSearch =
          target === elements.placeSearch ||
          target === elements.placeSearchResults ||
          elements.placeSearchResults?.contains?.(target);
        if (!inSearch) {
          hideDropdown(elements.placeSearchResults);
        }
      });
    }
    if (elements.colorByOperator) {
      elements.colorByOperator.addEventListener("change", () => {
        state.colorByOperator = Boolean(elements.colorByOperator.checked);
        applyRouteColorMode();
        if (state.lastPreviewGeojson) {
          updateOverlay(state.lastPreviewGeojson);
        }
      });
    }
    if (elements.clearSelection) {
      elements.clearSelection.addEventListener("click", clearSelection);
    }
    if (elements.mapSnapshot) {
      elements.mapSnapshot.addEventListener("click", () => {
        setStatus("Map Snapshot is planned for Phase 3 (report-ready PNG export).");
      });
    }
    if (elements.shareState) {
      elements.shareState.addEventListener("click", async () => {
        const map = state.map;
        const mapState = map
          ? { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() }
          : null;
        const payload = {
          version: 1,
          generatedAt: new Date().toISOString(),
          dataset: {
            generatedAt: state.metadata?.generatedAt ?? null,
            lastUpdated: state.metadata?.lastUpdated ?? null
          },
          map: mapState,
          filters: {
            modes: getSelectedValues(elements.modeFilter),
            operators: getSelectedOperators(),
            bbox: Boolean(elements.bboxFilter?.checked),
            serviceSearch: getServiceSearchValue(),
            colorByOperator: Boolean(elements.colorByOperator?.checked)
          },
          selection: state.selectedFeature ? { serviceId: getSelectedServiceId() } : null
        };
        const ok = await copyText(JSON.stringify(payload, null, 2));
        setStatus(ok ? "Share state copied to clipboard (JSON)." : "Share copy failed.");
      });
    }

    setStatus("Ready.");
    toggleActionButtons(true);
  } catch (error) {
    setStatus(`Startup failed: ${error.message}`);
  }
};

init();
