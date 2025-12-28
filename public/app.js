import maplibregl from "https://esm.sh/maplibre-gl@3.6.2";
import { Protocol } from "https://cdn.jsdelivr.net/npm/pmtiles@3.0.6/+esm";
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm";

// Module imports - Phase 3 Integration
// Constants
import { COLORS, LAYER_IDS, ROUTE_LINE_WIDTH, SELECTED_LINE_WIDTH, NONE_OPTION_VALUE, TIME_BAND_OPTIONS, FIELD_CANDIDATES, TABLE_CONFIG, EXPORT_LIMITS } from "./js/config/constants.js";

// State management
import { state, setConfig, setMap, setDuckDBConnection, setSpatialReady, setSelectedFeature, clearSelectedFeature, setTableRows, setColumns, setSpatialMatchSet, clearSpatialMatchSet, setSpatialPoint, setSpatialPickingPoint } from "./js/state/manager.js";

// Utilities
import { escapeSql, quoteIdentifier, buildInClause, escapeLikePattern } from "./js/utils/sql.js";
import { generateColor, rgbaToHex, hslToRgb, hashString } from "./js/utils/colors.js";
import { clearElement, escapeHtml, getProp, getSelectedValues, getSelectedValue, formatCount, toNumber } from "./js/utils/dom.js";
import { joinUrl, toAbsoluteUrl, addCacheBuster } from "./js/utils/url.js";
import { getGeometryCoordinates, getFeaturesBbox, isValidBbox, createCirclePolygon } from "./js/utils/geometry.js";

// Domain modules
import { initDuckDb, executeQuery, countRows, detectSchemaFields } from "./js/duckdb/client.js";
import { buildWhere, buildCombinedWhere, hasAttributeFilters, getSelectedOperators, getSelectedTimeBands, getServiceSearchValue } from "./js/filters/builder.js";
import { fitMapToBbox, fitMapToScope, buildMapFilter, detectTileFieldsFromRendered } from "./js/map/utils.js";
import { renderTable, renderTableHead, getTableColumns, fetchTablePage, ensureTablePageFor, queryTable } from "./js/table/renderer.js";
import { queryCsv, queryGeoJson, downloadFile, confirmLargeExport, onDownloadCsv, onDownloadGeojson } from "./js/exports/handlers.js";
import { initSpatialLogicBuilder } from "./js/spatial/builder.js";
import { getSpatialLogicEvidencePart } from "./js/spatial/evidence.js";
import { loadSpatialLogicRunner } from "./js/spatial/runner.js";
import { applySpatialLogic } from "./js/spatial/execute.js";

const elements = {
  datasetDate: document.getElementById("dataset-date"),
  datasetCount: document.getElementById("dataset-count"),
  shareState: document.getElementById("share-state"),
  mapSnapshot: document.getElementById("map-snapshot"),
  modeFilter: document.getElementById("mode-filter"),
  operatorFilter: document.getElementById("operator-filter"),
  timeBandFilter: document.getElementById("time-band-filter"),
  timeBandHint: document.getElementById("time-band-hint"),
  laFilter: document.getElementById("la-filter"),
  rptFilter: document.getElementById("rpt-filter"),
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
  dataTableScroll: document.getElementById("data-table-scroll"),
  dataTableEmpty: document.getElementById("data-table-empty"),
  tableMeta: document.getElementById("table-meta"),
  evidenceLeft: document.getElementById("evidence-left"),
  evidenceRight: document.getElementById("evidence-right"),
  legendItems: document.getElementById("legend-items"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  sidebar: document.getElementById("sidebar"),
  sidebarFullscreen: document.getElementById("sidebar-fullscreen"),
  mapFullscreen: document.getElementById("map-fullscreen"),
  dataInspector: document.getElementById("data-inspector"),
  dataInspectorFilter: document.getElementById("data-inspector-filter"),
  dataInspectorExpand: document.getElementById("data-inspector-expand"),
  placeSearch: document.getElementById("place-search"),
  placeSearchResults: document.getElementById("place-search-results"),
  spatialLogicTool: document.getElementById("spatial-logic-tool"),
  spatialLogicPickPoint: document.querySelector("[data-slb-pick-point]"),
  spatialLogicPointLabel: document.querySelector("[data-slb-point-label]")
};

let geocoderMarker = null;

// NONE_OPTION_VALUE, state, constants, and utilities now imported from modules

// Duplicate constants removed - now imported from ./js/config/constants.js:
// - ROUTE_LINE_WIDTH, SELECTED_LINE_WIDTH, TIME_BAND_OPTIONS
// - COLORS.DEFAULT_ROUTE, COLORS.PREVIEW_ROUTE, COLORS.SELECTED_ROUTE

// Duplicate SQL utils removed - now imported from ./js/utils/sql.js:
// - escapeSql, quoteIdentifier, buildInClause

// Duplicate URL utils removed - now imported from ./js/utils/url.js:
// - joinUrl, toAbsoluteUrl, addCacheBuster

// Helper function to gather current filter state from UI
const getCurrentFilters = () => ({
  modes: getSelectedValues(elements.modeFilter),
  operators: getSelectedOperators(elements.operatorFilter),
  timeBands: getSelectedTimeBands(elements.timeBandFilter),
  serviceSearch: getServiceSearchValue(elements.serviceSearch),
  laValue: getSelectedValue(elements.laFilter),
  rptValue: getSelectedValue(elements.rptFilter),
  serviceIds: state.spatialQuery?.serviceIds || [],
  serviceIdsActive: Boolean(state.spatialQuery?.active),
  bbox: Boolean(elements.bboxFilter?.checked)
});

const getTimeBandLabel = (key) => TIME_BAND_OPTIONS.find((option) => option.key === key)?.label || key;

const formatPointLabel = (point) => {
  if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
    return "Not set";
  }
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
};

const updateSpatialPointLabel = () => {
  if (!elements.spatialLogicPointLabel) {
    return;
  }
  elements.spatialLogicPointLabel.textContent = formatPointLabel(state.spatialQuery?.point);
};

const getSpatialRadiusFromCompiled = (compiled) => {
  const blocks = compiled?.blocks || [];
  const match = blocks.find((block) =>
    block?.relation === "within" && (block?.target === "selected_point" || block?.find === "selected_point")
  );
  if (!match) {
    return null;
  }
  const distance = Number(match.distance);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
};

const updateSpatialPointOverlay = () => {
  const map = state.map;
  if (!map) {
    return;
  }
  const pointSource = map.getSource(LAYER_IDS.SPATIAL_POINT);
  const radiusSource = map.getSource(LAYER_IDS.SPATIAL_RADIUS);
  if (!pointSource || !radiusSource) {
    return;
  }
  const point = state.spatialQuery?.point;
  const radius = getSpatialRadiusFromCompiled(state.spatialBuilder?.compiled);

  const pointFeature = point
    ? {
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lng, point.lat] }
      }
    : null;
  pointSource.setData({
    type: "FeatureCollection",
    features: pointFeature ? [pointFeature] : []
  });

  const circle = point && radius ? createCirclePolygon(point, radius) : null;
  radiusSource.setData({
    type: "FeatureCollection",
    features: circle ? [{ type: "Feature", geometry: circle }] : []
  });
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

const activityLog = [];
const logEvent = (level, message, detail = null) => {
  const entry = {
    at: new Date().toISOString(),
    level,
    message,
    detail: detail || null
  };
  activityLog.push(entry);
  if (activityLog.length > 400) {
    activityLog.shift();
  }
  const logger = console[level] || console.log;
  if (detail) {
    logger(`[NetworkView] ${message}`, detail);
  } else {
    logger(`[NetworkView] ${message}`);
  }
};

const logAction = (action, detail = null) => {
  logEvent("info", action, detail);
};

if (typeof window !== "undefined") {
  window.__NV_LOG = activityLog;
}

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

const ADMIN_FEATURE_KEY = "networkview-feature-overrides";

const isAdminMode = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const path = window.location.pathname || "";
  const search = new URLSearchParams(window.location.search);
  if (search.has("admin")) {
    return true;
  }
  return /\/admin\/?$/.test(path) || /\/config\/?$/.test(path);
};

const loadFeatureOverrides = () => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_FEATURE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    logEvent("warn", "Failed to read feature overrides.", { error: error.message });
    return {};
  }
};

const saveFeatureOverrides = (overrides) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ADMIN_FEATURE_KEY, JSON.stringify(overrides || {}));
  } catch (error) {
    logEvent("warn", "Failed to save feature overrides.", { error: error.message });
  }
};

const applyFeatureOverrides = (config) => {
  const overrides = loadFeatureOverrides();
  const base = { ...(config.features || {}) };
  const merged = { ...base, ...overrides };
  config.features = merged;
  return { base, overrides, merged };
};

const ensureAdminPanel = () => {
  let panel = document.getElementById("admin-panel");
  if (panel) {
    return panel;
  }
  panel = document.createElement("div");
  panel.id = "admin-panel";
  panel.className =
    "fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6";
  panel.innerHTML = `
    <div class="bg-white rounded-xl shadow-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-text-main">Admin: Feature Flags</h2>
          <p class="text-xs text-text-tertiary">Overrides are stored in this browser only.</p>
        </div>
        <a href="/" class="text-xs text-primary hover:underline">Back to viewer</a>
      </div>
      <div class="px-5 py-4 overflow-auto" id="admin-feature-list"></div>
      <div class="px-5 py-4 border-t border-border flex items-center justify-between bg-slate-50/60">
        <div class="text-[11px] text-text-tertiary" id="admin-feature-summary"></div>
        <div class="flex gap-2">
          <button id="admin-reset" class="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-white">Reset overrides</button>
          <button id="admin-close" class="px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary-hover">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
};

const renderAdminPanel = (config) => {
  if (!isAdminMode()) {
    return;
  }
  const panel = ensureAdminPanel();
  const list = panel.querySelector("#admin-feature-list");
  const summary = panel.querySelector("#admin-feature-summary");
  const closeButton = panel.querySelector("#admin-close");
  const resetButton = panel.querySelector("#admin-reset");

  const baseFeatures = { ...(config.features || {}) };
  const overrides = loadFeatureOverrides();
  const merged = { ...baseFeatures, ...overrides };
  const names = Array.from(new Set([...Object.keys(baseFeatures), ...Object.keys(overrides)])).sort();

  if (!names.length) {
    list.innerHTML = `<div class="text-sm text-text-tertiary">No feature flags found in config.</div>`;
  } else {
    list.innerHTML = "";
    names.forEach((name) => {
      const row = document.createElement("label");
      row.className = "flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0";
      const left = document.createElement("div");
      left.innerHTML = `
        <div class="text-sm font-medium text-text-main">${name}</div>
        <div class="text-[11px] text-text-tertiary">
          Base: ${baseFeatures[name] ? "on" : "off"}
          ${Object.prototype.hasOwnProperty.call(overrides, name) ? "• overridden" : ""}
        </div>
      `;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.className = "h-4 w-4 text-primary";
      toggle.checked = Boolean(merged[name]);
      toggle.addEventListener("change", () => {
        overrides[name] = toggle.checked;
        saveFeatureOverrides(overrides);
        config.features = { ...baseFeatures, ...overrides };
        applyFeatureFlags(config);
        updateScopeChips();
        logEvent("info", "Feature flag toggled.", { name, value: toggle.checked });
        renderAdminPanel(config);
      });
      row.appendChild(left);
      row.appendChild(toggle);
      list.appendChild(row);
    });
  }

  if (summary) {
    summary.textContent = `${Object.keys(overrides).length} override(s) active.`;
  }
  if (closeButton) {
    closeButton.onclick = () => {
      panel.remove();
    };
  }
  if (resetButton) {
    resetButton.onclick = () => {
      saveFeatureOverrides({});
      applyFeatureOverrides(config);
      applyFeatureFlags(config);
      updateScopeChips();
      logEvent("info", "Feature overrides reset.");
      renderAdminPanel(config);
    };
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

const clearGeocoderSelection = () => {
  if (geocoderMarker) {
    geocoderMarker.remove();
    geocoderMarker = null;
  }
  if (elements.placeSearch) {
    elements.placeSearch.value = "";
  }
  hideDropdown(elements.placeSearchResults);
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

// escapeHtml removed - now imported from ./js/utils/dom.js

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
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${COLORS.DEFAULT_ROUTE}"></span>`,
      label: `Route lines (${colorMode})`
    });
  }

  if (getLayerVisible(map, "routes-preview-line")) {
    items.push({
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${COLORS.PREVIEW_ROUTE}"></span>`,
      label: "GeoJSON preview"
    });
  }

  if (state.selectedFeature) {
    items.push({
      swatch: `<span class="w-3 h-1 rounded-full" style="background:${COLORS.SELECTED_ROUTE}"></span>`,
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

const updateEvidence = () => {
  if (!elements.evidenceLeft || !elements.evidenceRight) {
    return;
  }
  const meta = state.metadata || {};
  const generatedAt = meta.generatedAt || meta.lastUpdated || "Unknown";
  const total = meta.counts?.total ?? meta.total ?? null;
  const where = getCombinedWhere();
  const hasFilters = Boolean(where);
  const hint = hasFilters ? "Filtered view" : "Full dataset";

  elements.evidenceLeft.innerHTML = "";
  const selectionCount = state.lastQuery?.count ?? null;
  const browseMax = state.tablePaging?.enabled ? state.tablePaging.browseMax : state.tableLimit;
  const limitNote =
    selectionCount !== null && selectionCount !== undefined && selectionCount > browseMax
      ? `Browsing capped at ${formatCount(browseMax)}`
      : selectionCount !== null && selectionCount !== undefined && selectionCount > state.tableLimit
        ? `Table shows first ${formatCount(state.tableLimit)}`
        : null;
  const leftParts = [
    `Scope: <strong class="font-semibold">${hint}</strong>`,
    total ? `Dataset rows: <strong class="font-semibold">${formatCount(total)}</strong>` : null,
    selectionCount !== null && selectionCount !== undefined
      ? `Selection: <strong class="font-semibold">${formatCount(selectionCount)}</strong>`
      : null,
    limitNote ? `Limit: <strong class="font-semibold">${limitNote}</strong>` : null,
    getSpatialLogicEvidencePart(),
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

// fitMapToBbox removed - now imported from ./js/map/utils.js

// Geometry utility functions removed - now imported from ./js/utils/geometry.js:
// - getGeometryCoordinates, getFeaturesBbox

// Map utility functions removed - now imported from ./js/map/utils.js:
// - fitMapToScope (32 lines)

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

// formatCount removed - now imported from ./js/utils/dom.js
// toNumber removed - now imported from ./js/utils/dom.js

// Export utility functions removed - now imported from ./js/exports/handlers.js:
// - formatBytes, getResultColumns, getCsvColumns, estimateExportBytes, confirmLargeExport

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

// clearElement removed - now imported from ./js/utils/dom.js

const setStatsHint = (message) => {
  if (!elements.statsHint) {
    return;
  }
  elements.statsHint.textContent = message;
};

// getProp removed - now imported from ./js/utils/dom.js

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

// getServiceSearchValue removed - now imported from ./js/filters/builder.js

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

// Color utility functions removed - now imported from ./js/utils/colors.js:
// - hslToRgb, hashString, rgbaToHex

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

  match.push(COLORS.DEFAULT_ROUTE);
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
      map.setPaintProperty("routes-line", "line-color", COLORS.DEFAULT_ROUTE);
    }
  } else {
    map.setPaintProperty("routes-line", "line-color", COLORS.DEFAULT_ROUTE);
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
    logAction("Selection cleared.");
    return;
  }
  state.selectedFeature = feature;
  state.selectedFeatureKey = getFeatureKey(feature, fallbackKey);
  renderSelection(feature);
  renderLegend();
  logAction("Selection updated.", { key: state.selectedFeatureKey || "" });
};

const clearSelection = () => {
  state.selectedFeature = null;
  state.selectedFeatureKey = null;
  renderSelection(null);
  syncSelectedLayer();
  renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
  renderLegend();
  logAction("Selection cleared.");
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
      if (state.spatialQuery?.pickingPoint) {
        return;
      }
      const feature = event.features?.[0];
      if (!feature) {
        clearSelection();
        return;
      }
      setSelection(feature, getFeatureKey(feature));
      focusTableRowByServiceId(getSelectedServiceId());
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

const updateScopeChips = () => {
  if (!elements.scopeChips) {
    return;
  }
  clearElement(elements.scopeChips);

  const chips = [];
  const modes = getSelectedValues(elements.modeFilter).filter((m) => m !== NONE_OPTION_VALUE);
  const operators = getSelectedOperators(elements.operatorFilter)
    .map((o) => o.value)
    .filter((o) => o && o !== NONE_OPTION_VALUE);
  const timeBands = getSelectedTimeBands(elements.timeBandFilter).filter((band) => band);
  const laSelection = getSelectedValue(elements.laFilter);
  const rptSelection = getSelectedValue(elements.rptFilter);
  const laLabel = elements.laFilter?.selectedOptions?.[0]?.textContent || "";
  const rptLabel = elements.rptFilter?.selectedOptions?.[0]?.textContent || "";
  const search = getServiceSearchValue(elements.serviceSearch);
  const bbox = elements.bboxFilter?.checked ? "Viewport" : "";

  if (modes.length) chips.push({ key: "modes", icon: "directions_bus", label: `Mode: ${modes.join(", ")}` });
  if (operators.length) chips.push({ key: "ops", icon: "apartment", label: `Operator: ${operators.join(", ")}` });
  if (timeBands.length) {
    chips.push({
      key: "time",
      icon: "schedule",
      label: `Time: ${timeBands.map(getTimeBandLabel).join(", ")}`
    });
  }
  if (laSelection) chips.push({ key: "la", icon: "place", label: `LA: ${laLabel || laSelection}` });
  if (rptSelection) chips.push({ key: "rpt", icon: "hub", label: `RTP: ${rptLabel || rptSelection}` });
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
    } else if (key === "time") {
      if (elements.timeBandFilter) {
        Array.from(elements.timeBandFilter.options).forEach((opt) => {
          opt.selected = false;
        });
      }
    } else if (key === "search") {
      if (elements.serviceSearch) elements.serviceSearch.value = "";
    } else if (key === "bbox") {
      if (elements.bboxFilter && !elements.bboxFilter.disabled) elements.bboxFilter.checked = false;
    } else if (key === "la") {
      if (elements.laFilter) elements.laFilter.value = "";
    } else if (key === "rpt") {
      if (elements.rptFilter) elements.rptFilter.value = "";
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
      focusTableRowByServiceId(getSelectedServiceId());
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

const onApplyFilters = async (options = {}) => {
  if (state.applyingFilters) {
    state.pendingFilterApply = true;
    return;
  }
  state.applyingFilters = true;
  toggleActionButtons(false);
  setStatus("Applying filters...");
  logAction("Filters applied.", {
    modes: getSelectedValues(elements.modeFilter),
    operators: getSelectedOperators(elements.operatorFilter).map((item) => item.value),
    timeBands: getSelectedTimeBands(elements.timeBandFilter),
    la: getSelectedValue(elements.laFilter),
    rpt: getSelectedValue(elements.rptFilter),
    search: getServiceSearchValue(elements.serviceSearch),
    bbox: elements.bboxFilter?.checked
  });

  try {
    const filters = getCurrentFilters();
    const filtered = hasAttributeFilters(filters);
    applyMapFilters();
    setBaseLayerFocus(filtered);
    updateScopeChips();
    updateEvidence();
    renderLegend();
    const shouldFit = options.autoFit === true;
    if (state.map && shouldFit) {
      state.map.once("idle", () => fitMapToScope(state.map, "Fitting to filtered scope...", setStatus, elements.bboxFilter?.checked || false));
    }

    if (!state.conn) {
      setPreview("Filters applied to map. DuckDB is unavailable, so table/stats/exports are disabled.");
      renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
      return;
    }

    const validation = validateFilters();
    if (validation) {
      logEvent("warn", "Filter validation failed.", { message: validation });
      setStatus(validation);
      return;
    }

    const count = await queryCount();
    const countNumber = toNumber(count);
    setPreview(`${formatCount(count)} routes in selection.`);
    state.lastQuery = { count: countNumber };
    state.tablePaging.enabled = true;
    state.tablePaging.queryKey = getFilterKey();
    state.tablePaging.offset = 0;
    state.tablePaging.rows = [];

    if (countNumber === 0) {
      setStatus("No routes matched the current filters.");
      state.tableRows = [];
      state.tablePaging.rows = [];
      renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    } else {
      setStatus("Filters applied. Table/stats updated.");
    }

    await updateStats(countNumber);
    // Paging mode: load first page; non-paging mode: use full tableRows.
    if (state.tablePaging.enabled) {
      renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
      ensureTablePageFor(0, setStatus, updateEvidence, null, getCurrentFilters());
    } else {
      state.tableRows = await queryTable(state.tableLimit, 0, getCurrentFilters());
      renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    }
    updateEvidence();
  } catch (error) {
    logEvent("error", "Filter query failed.", { error: error.message });
    setStatus(`Query failed: ${error.message}`);
  } finally {
    state.applyingFilters = false;
    toggleActionButtons(true);
    if (state.pendingFilterApply) {
      state.pendingFilterApply = false;
      window.setTimeout(() => {
        onApplyFilters(options);
      }, 0);
    }
  }
};

const updateBoundaryHighlight = () => {
  const map = state.map;
  if (!map) {
    return;
  }
  const update = (key, selectedValue) => {
    const info = state.boundaryLayers[key];
    if (!info || !map.getLayer(info.layerId)) {
      return;
    }
    if (!selectedValue) {
      map.setFilter(info.layerId, ["==", ["get", "__never__"], "__never__"]);
      return;
    }
    const field = info.codeField || "code";
    if (selectedValue === NONE_OPTION_VALUE) {
      map.setFilter(info.layerId, ["any", ["!", ["has", field]], ["==", ["to-string", ["get", field]], ""]]);
      return;
    }
    map.setFilter(info.layerId, ["==", ["to-string", ["get", field]], String(selectedValue)]);
  };

  update("la", getSelectedValue(elements.laFilter));
  update("rpt", getSelectedValue(elements.rptFilter));
};

const getTableLoadedRange = () => {
  if (state.conn && state.tablePaging.enabled) {
    const start = state.tablePaging.offset;
    const end = start + (state.tablePaging.rows?.length || 0);
    return { start, end };
  }
  return { start: 0, end: (state.tableRows || []).length };
};

const getTableRowAtIndex = (index) => {
  if (state.conn && state.tablePaging.enabled) {
    const range = getTableLoadedRange();
    if (index < range.start || index >= range.end) {
      return null;
    }
    return state.tablePaging.rows[index - range.start] || null;
  }
  return state.tableRows[index] || null;
};

const findTableRowIndexInMemory = (serviceId) => {
  if (!serviceId) {
    return null;
  }
  const rows = state.conn && state.tablePaging.enabled ? state.tablePaging.rows || [] : state.tableRows || [];
  const matchIndex = rows.findIndex((row) => String(row?.serviceId ?? row?.service_id ?? row?.id ?? "") === String(serviceId));
  if (matchIndex < 0) {
    return null;
  }
  return state.conn && state.tablePaging.enabled ? state.tablePaging.offset + matchIndex : matchIndex;
};

const findTableRowIndex = async (serviceId) => {
  const inMemory = findTableRowIndexInMemory(serviceId);
  if (inMemory !== null) {
    return inMemory;
  }
  if (!state.conn || !state.tablePaging.enabled) {
    return null;
  }
  const idField = state.serviceIdField || (state.columns.includes("serviceId") ? "serviceId" : "");
  if (!idField) {
    return null;
  }
  const baseWhere = getCombinedWhere();
  const idClause = `${quoteIdentifier(idField)} = '${escapeSql(serviceId)}'`;
  const where = baseWhere
    ? `WHERE (${baseWhere.replace(/^WHERE\\s+/i, "")}) AND ${idClause}`
    : `WHERE ${idClause}`;
  const order = state.columns.includes("serviceName") ? quoteIdentifier("serviceName") : "1";
  const query = `
    SELECT row_number() OVER (ORDER BY ${order}) - 1 AS idx
    FROM read_parquet('routes.parquet')
    ${where}
    LIMIT 1
  `;
  try {
    const result = await state.conn.query(query);
    const rows = result.toArray();
    const idx = rows[0]?.idx;
    return Number.isFinite(idx) ? idx : null;
  } catch (error) {
    logEvent("warn", "Failed to locate row index for selection.", { error: error.message, serviceId });
    return null;
  }
};

const focusTableRowByServiceId = async (serviceId) => {
  if (!elements.dataTableScroll) {
    renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    return false;
  }
  const index = await findTableRowIndex(serviceId);
  if (index === null) {
    renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    return false;
  }
  const rowHeight = state.tableVirtual.rowHeight || 34;
  const scrollTop = Math.max(0, index * rowHeight - rowHeight * 2);
  elements.dataTableScroll.scrollTop = scrollTop;
  renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
  return true;
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

const loadInitialDatasetView = async () => {
  if (!state.conn) {
    return;
  }
  setStatus("Loading initial table...");
  try {
    const count = await queryCount();
    const countNumber = toNumber(count);
    state.lastQuery = { count: countNumber };
    setPreview(`${formatCount(countNumber)} routes in selection.`);

    state.tablePaging.enabled = true;
    state.tablePaging.queryKey = getFilterKey();
    state.tablePaging.offset = 0;
    state.tablePaging.rows = [];
    renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    ensureTablePageFor(0, setStatus, updateEvidence, null, getCurrentFilters());

    await updateStats(countNumber);
    updateEvidence();
    setStatus("Ready.");
  } catch (error) {
    setStatus(`Initial load failed: ${error.message}`);
  }
};

const onClearFilters = () => {
  logAction("Filters cleared.");
  Array.from(elements.modeFilter.options).forEach((opt) => {
    opt.selected = false;
  });
  Array.from(elements.operatorFilter.options).forEach((opt) => {
    opt.selected = false;
  });
  if (elements.timeBandFilter) {
    Array.from(elements.timeBandFilter.options).forEach((opt) => {
      opt.selected = false;
    });
  }
  if (elements.laFilter) {
    elements.laFilter.value = "";
  }
  if (elements.rptFilter) {
    elements.rptFilter.value = "";
  }
  if (elements.serviceSearch) {
    elements.serviceSearch.value = "";
  }
  clearGeocoderSelection();
  clearSpatialMatchSet();
  setSpatialPoint(null);
  setSpatialPickingPoint(false);
  updateSpatialPointLabel();
  updateSpatialPointOverlay();
  setPreview("No filters applied.");
  if (state.overlay) {
    state.overlay.setProps({ layers: [] });
  }
  state.lastPreviewGeojson = null;
  state.tableRows = [];
  state.tablePaging.enabled = true;
  state.tablePaging.queryKey = getFilterKey();
  state.tablePaging.offset = 0;
  state.tablePaging.rows = [];
  state.lastQuery = null;
  clearSelection();

  // Reload full dataset selection (clearing should never leave the table empty when data exists).
  onApplyFilters({ autoFit: false });
};

const onLoadSample = async () => {
  logAction("GeoJSON preview requested.");
  try {
    const geojson = await loadGeojsonPreview();
    state.lastPreviewGeojson = geojson;
    updateOverlay(geojson);
    showGeojsonOnMap(geojson);
    setPreview(`GeoJSON preview: ${formatCount(geojson.features.length)} routes (preview only).`);
    fitMapToScope(state.map, "Fitting to preview scope...", setStatus, elements.bboxFilter?.checked || false);

    // Populate a small table from the preview, even if DuckDB isn't running yet.
    state.tablePaging.enabled = false;
    state.lastQuery = { count: geojson.features.length };
    state.tableRows = geojson.features
      .slice(0, state.tableLimit)
      .map((feature) => normalizePreviewProps(feature.properties || {}));
    renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    updateEvidence();

    setStatsHint("GeoJSON preview loaded. Use DuckDB for full stats/exports when available.");
    setStatus("GeoJSON preview loaded.");
  } catch (error) {
    logEvent("error", "GeoJSON preview failed.", { error: error.message });
    setStatus(`GeoJSON preview failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
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

  // Multi-selects default to their first option being selected, which unintentionally applies filters on load.
  // For our UX, "no selection" means "no filter", including when "(none)" is present as a selectable value.
  if (select.multiple) {
    Array.from(select.options).forEach((opt) => {
      opt.selected = false;
    });
    select.selectedIndex = -1;
  }
};

const fillSingleSelect = (select, options, formatter) => {
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All";
  select.appendChild(allOption);

  const noneOption = document.createElement("option");
  noneOption.value = NONE_OPTION_VALUE;
  noneOption.textContent = "(unknown)";
  select.appendChild(noneOption);

  options.forEach((option) => {
    const opt = document.createElement("option");
    const formatted = formatter(option);
    opt.value = formatted.value;
    opt.textContent = formatted.label;
    select.appendChild(opt);
  });
};

const setSelectPlaceholder = (select, label) => {
  select.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = label;
  select.appendChild(opt);
  select.disabled = true;
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

const refreshTimeBandFilter = () => {
  if (!elements.timeBandFilter) {
    return;
  }
  const available = TIME_BAND_OPTIONS.filter((option) => state.timeBandFields?.[option.key]);
  if (!available.length) {
    setSelectPlaceholder(elements.timeBandFilter, "Time band (coming soon)");
    setTimeBandHint("Time bands will unlock once timetable flags are available.");
    return;
  }
  fillSelect(elements.timeBandFilter, available, (option) => ({ value: option.key, label: option.label }), false);
  elements.timeBandFilter.disabled = false;
  setTimeBandHint("");
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
  refreshTimeBandFilter();
};

const queryBoundaryOptions = async (codeField, nameField) => {
  const query = `
    SELECT DISTINCT
      ${quoteIdentifier(codeField)} AS code,
      ${quoteIdentifier(nameField)} AS name
    FROM read_parquet('routes.parquet')
    WHERE ${quoteIdentifier(codeField)} IS NOT NULL OR ${quoteIdentifier(nameField)} IS NOT NULL
    ORDER BY name
  `;
  const rows = await state.conn.query(query);
  return rows.toArray();
};

const populateBoundaryFilters = async () => {
  if (!state.conn) {
    return;
  }
  if (!state.laField || !state.rptField) {
    try {
      const result = await state.conn.query("DESCRIBE SELECT * FROM read_parquet('routes.parquet')");
      const columns = result.toArray().map((row) => row.column_name || row.name || row[0]);
      if (columns.length) {
        state.columns = columns;
        detectSchemaFields(columns);
      }
    } catch (error) {
      // Ignore; fall through to placeholder state.
    }
  }
  const columnSet = new Set(state.columns.map((name) => String(name).toLowerCase()));
  const hasColumn = (name) => columnSet.has(String(name || "").toLowerCase());
  if (state.laField && !hasColumn(state.laField)) {
    state.laField = "";
    state.laNameField = "";
  }
  if (state.rptField && !hasColumn(state.rptField)) {
    state.rptField = "";
    state.rptNameField = "";
  }

  if (elements.laFilter) {
    let rows = [];
    if (state.laField) {
      const laNameField = state.laNameField || state.laField;
      try {
        rows = await queryBoundaryOptions(state.laField, laNameField);
      } catch (error) {
        rows = [];
      }
    } else {
      try {
        rows = await queryBoundaryOptions("la_code", "la_name");
        state.laField = "la_code";
        state.laNameField = "la_name";
      } catch (error) {
        try {
          rows = await queryBoundaryOptions("la_code", "local_authority");
          state.laField = "la_code";
          state.laNameField = "local_authority";
        } catch (innerError) {
          rows = [];
        }
      }
    }
    if (!rows.length) {
      setSelectPlaceholder(elements.laFilter, "Local Authority unavailable");
    } else {
      fillSingleSelect(elements.laFilter, rows, (row) => ({
        value: row.code ?? row.name ?? "",
        label: row.name ?? row.code ?? ""
      }));
      elements.laFilter.disabled = false;
    }
  }

  if (elements.rptFilter) {
    let rows = [];
    if (state.rptField) {
      const rptNameField = state.rptNameField || state.rptField;
      try {
        rows = await queryBoundaryOptions(state.rptField, rptNameField);
      } catch (error) {
        rows = [];
      }
    } else {
      try {
        rows = await queryBoundaryOptions("rpt_code", "rpt_name");
        state.rptField = "rpt_code";
        state.rptNameField = "rpt_name";
      } catch (error) {
        rows = [];
      }
    }
    if (!rows.length) {
      setSelectPlaceholder(elements.rptFilter, "RTP unavailable");
    } else {
      fillSingleSelect(elements.rptFilter, rows, (row) => ({
        value: row.code ?? row.name ?? "",
        label: row.name ?? row.code ?? ""
      }));
      elements.rptFilter.disabled = false;
    }
  }
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

  map.on("click", (event) => {
    if (!state.spatialQuery?.pickingPoint) {
      return;
    }
    setSpatialPickingPoint(false);
    map.getCanvas().style.cursor = "";
    const point = { lng: event.lngLat.lng, lat: event.lngLat.lat };
    setSpatialPoint(point);
    updateSpatialPointLabel();
    updateSpatialPointOverlay();
    if (state.spatialBuilder?.compiled) {
      applySpatialLogic(state.spatialBuilder.compiled, {
        setStatus,
        setMatchSet: setSpatialMatchSet,
        config: state.config
      }).then(() => {
        onApplyFilters({ autoFit: false });
      });
    }
    setStatus("Point selected.");
  });

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
    if (!map.getSource(LAYER_IDS.SPATIAL_POINT)) {
      map.addSource(LAYER_IDS.SPATIAL_POINT, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
    }
    if (!map.getLayer(LAYER_IDS.SPATIAL_POINT)) {
      map.addLayer({
        id: LAYER_IDS.SPATIAL_POINT,
        type: "circle",
        source: LAYER_IDS.SPATIAL_POINT,
        paint: {
          "circle-radius": 6,
          "circle-color": "#2563eb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
    }
    if (!map.getSource(LAYER_IDS.SPATIAL_RADIUS)) {
      map.addSource(LAYER_IDS.SPATIAL_RADIUS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
    }
    if (!map.getLayer(LAYER_IDS.SPATIAL_RADIUS)) {
      // Add fill layer first (renders below stroke)
      map.addLayer({
        id: `${LAYER_IDS.SPATIAL_RADIUS}-fill`,
        type: "fill",
        source: LAYER_IDS.SPATIAL_RADIUS,
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.1
        }
      });
      // Add stroke layer
      map.addLayer({
        id: LAYER_IDS.SPATIAL_RADIUS,
        type: "line",
        source: LAYER_IDS.SPATIAL_RADIUS,
        paint: {
          "line-color": "#2563eb",
          "line-width": 2,
          "line-opacity": 0.6
        }
      });
    }

    // Make spatial point draggable
    let isDraggingPoint = false;
    map.on("mouseenter", LAYER_IDS.SPATIAL_POINT, () => {
      map.getCanvas().style.cursor = "grab";
    });
    map.on("mouseleave", LAYER_IDS.SPATIAL_POINT, () => {
      if (!isDraggingPoint) {
        map.getCanvas().style.cursor = "";
      }
    });
    map.on("mousedown", LAYER_IDS.SPATIAL_POINT, (e) => {
      e.preventDefault();
      isDraggingPoint = true;
      map.getCanvas().style.cursor = "grabbing";
      map.dragPan.disable();
    });
    map.on("mousemove", (e) => {
      if (!isDraggingPoint) return;

      const newPoint = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setSpatialPoint(newPoint);
      updateSpatialPointLabel();
      updateSpatialPointOverlay();
    });
    map.on("mouseup", () => {
      if (!isDraggingPoint) return;

      isDraggingPoint = false;
      map.getCanvas().style.cursor = "";
      map.dragPan.enable();

      // Re-run query if builder state exists
      if (state.spatialBuilder?.compiled && state.spatialQuery?.point) {
        applySpatialLogic(state.spatialBuilder.compiled, {
          setStatus,
          setMatchSet: setSpatialMatchSet,
          config: state.config
        }).then(() => {
          onApplyFilters({ autoFit: false });
        });
      }
    });

    const addBoundaryLayer = (key, configKey, layerKey, color, codeField) => {
      const file = config[configKey];
      if (!file) {
        return;
      }
      const sourceId = `boundaries-${key}`;
      const layerId = `boundaries-${key}-outline`;
      const sourceLayer = config[layerKey] || key;
      const pmtilesUrl = addCacheBuster(
        toAbsoluteUrl(joinUrl(config.dataBaseUrl, file)),
        config.tileCacheVersion
      );
      map.addSource(sourceId, {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`
      });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        filter: ["==", ["get", "__never__"], "__never__"],
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.75
        }
      });
      state.boundaryLayers[key] = {
        sourceId,
        layerId,
        codeField: config[codeField] || "code"
      };
    };

    addBoundaryLayer("la", "boundariesLaPmtiles", "boundariesLaLayer", "#1d4ed8", "boundariesLaCodeField");
    addBoundaryLayer("rpt", "boundariesRptPmtiles", "boundariesRptLayer", "#15803d", "boundariesRptCodeField");

    if (config.pmtilesFile) {
      const pmtilesUrl = addCacheBuster(
        toAbsoluteUrl(joinUrl(config.dataBaseUrl, config.pmtilesFile)),
        config.tileCacheVersion
      );
      setStatus("Loading route tiles...");
      map.addSource("routes", {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`
      });

      const buildVectorLayers = (sourceLayer) => {
        console.log("[Map] Building vector layers with source-layer:", sourceLayer);
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
        console.log("[Map] routes-line layer added");

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

        Object.values(state.boundaryLayers).forEach((entry) => {
          if (entry?.layerId && map.getLayer(entry.layerId)) {
            map.moveLayer(entry.layerId);
          }
        });

        // Ensure spatial point overlays render above routes.
        if (map.getLayer(`${LAYER_IDS.SPATIAL_RADIUS}-fill`)) {
          map.moveLayer(`${LAYER_IDS.SPATIAL_RADIUS}-fill`, "routes-line");
        }
        if (map.getLayer(LAYER_IDS.SPATIAL_RADIUS)) {
          map.moveLayer(LAYER_IDS.SPATIAL_RADIUS, "routes-line");
        }
        if (map.getLayer(LAYER_IDS.SPATIAL_POINT)) {
          map.moveLayer(LAYER_IDS.SPATIAL_POINT);
        }
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
          fitMapToBbox(state.map, state.metadata.bbox, "Fitting to dataset bounds...", setStatus);
        }
      });

      // Auto-detect the PMTiles source-layer name if the configured one yields no features.
      const detectSourceLayer = () => {
        if (!map.getSource("routes") || !map.isStyleLoaded()) {
          console.log("[Map] Source layer detection skipped - source or style not ready");
          return;
        }
        const candidates = Array.from(
          new Set([configured, "routes", "scotlandbusroutes", "route_lines", "lines"].filter(Boolean))
        );
        console.log("[Map] Trying source-layer candidates:", candidates);
        for (const candidate of candidates) {
          try {
            const features = map.querySourceFeatures("routes", { sourceLayer: candidate });
            console.log(`[Map] Candidate '${candidate}': ${features?.length || 0} features`);
            if (features && features.length) {
              if (candidate !== configured) {
                setStatus(`Detected PMTiles layer '${candidate}'.`);
                buildVectorLayers(candidate);
                detectTileFieldsFromRendered(state.map, state.baseLayerId);
                applyMapFilters();
                syncSelectedLayer();
              }
              return;
            }
          } catch (error) {
            console.log(`[Map] Error checking candidate '${candidate}':`, error.message);
          }
        }
        console.log("[Map] No source-layer candidates returned features");
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
        const filter = map.getFilter("routes-line");
        console.log("[Map] Rendered features check:", rendered.length, "features found");
        console.log("[Map] Layer exists:", map.getLayer("routes-line") ? "yes" : "no");
        console.log("[Map] Source exists:", map.getSource("routes") ? "yes" : "no");
        console.log("[Map] Current zoom:", map.getZoom());
        console.log("[Map] Layer filter:", filter);
        if (!rendered.length) {
          setStatus("No routes are rendering yet. Check vectorLayer/source-layer, file path, and Range support. Try GeoJSON preview.");
        } else {
          setStatus(state.duckdbReady ? "Routes rendered. DuckDB ready." : "Routes rendered. DuckDB not ready.");
          if (!userMoved) {
            // Fit once when we first see data.
            fitMapToScope(state.map, "Fitting to dataset scope...", setStatus, elements.bboxFilter?.checked || false);
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

      Object.values(state.boundaryLayers).forEach((entry) => {
        if (entry?.layerId && map.getLayer(entry.layerId)) {
          map.moveLayer(entry.layerId);
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
      focusTableRowByServiceId(getSelectedServiceId());
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
      const detected = detectTileFieldsFromRendered(state.map, state.baseLayerId);
      if (detected && Object.keys(detected).length) {
        state.tileFields = { ...state.tileFields, ...detected };
      }
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

// detectTileFieldsFromRendered removed - now imported from ./js/map/utils.js (80 lines)

// getSelectedOperators and getSelectedTimeBands removed - now imported from ./js/filters/builder.js

const setTimeBandHint = (message) => {
  if (!elements.timeBandHint) {
    return;
  }
  elements.timeBandHint.textContent = message || "";
  elements.timeBandHint.classList.toggle("hidden", !message);
};

// Filter builder functions removed - now imported from ./js/filters/builder.js:
// - hasAttributeFilters, buildWhere (140+ lines)

const getViewportKey = () => {
  if (!elements.bboxFilter?.checked || !state.map) {
    return "";
  }
  try {
    const b = state.map.getBounds();
    return `bbox:${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`;
  } catch (error) {
    return "";
  }
};

const getFilterKey = () => {
  const where = getCombinedWhere();
  const viewport = getViewportKey();
  return `${where}|${viewport}`;
};

const getCombinedWhere = () => buildCombinedWhere(getCurrentFilters(), state.map, Boolean(elements.bboxFilter?.checked));

const buildBooleanTileMatch = (field) => [
  "any",
  ["==", ["get", field], true],
  ["==", ["get", field], 1],
  ["==", ["to-string", ["get", field]], "true"],
  ["==", ["to-string", ["get", field]], "1"]
];

// buildMapFilter removed - now imported from ./js/map/utils.js (146 lines)

const applyMapFilters = () => {
  const map = state.map;
  if (!map) {
    return;
  }
  if (map.getLayer(state.baseLayerId)) {
    const filters = getCurrentFilters();
    let filter = buildMapFilter(filters, state.tileFields);
    // If filters are set but we cannot build a tile filter yet, retry tile field detection from rendered features.
    if (!filter && hasAttributeFilters(filters)) {
      const detected = detectTileFieldsFromRendered(state.map, state.baseLayerId);
      if (detected && Object.keys(detected).length) {
        state.tileFields = { ...state.tileFields, ...detected };
      }
      filter = buildMapFilter(filters, state.tileFields);
    }
    if (!filter && hasAttributeFilters(filters)) {
      const warningKey = JSON.stringify({
        modes: getSelectedValues(elements.modeFilter),
        operators: getSelectedOperators(elements.operatorFilter).map((item) => item.value),
        timeBands: getSelectedTimeBands(elements.timeBandFilter),
        la: getSelectedValue(elements.laFilter),
        rpt: getSelectedValue(elements.rptFilter),
        search: getServiceSearchValue(elements.serviceSearch)
      });
      if (state.lastMapFilterWarningKey !== warningKey) {
        state.lastMapFilterWarningKey = warningKey;
        setStatus("Map filters could not be applied (tile attributes not detected). Try zooming in so features render, then re-apply.");
        logEvent("warn", "Map filter build returned null with active filters.", {
          tileFields: state.tileFields,
          selection: warningKey
        });
      }
    }
    map.setFilter(state.baseLayerId, filter);
    syncSelectedLayer();
  }
  updateBoundaryHighlight();
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
  const where = getCombinedWhere();
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
  const where = getCombinedWhere();
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
  const operators = getSelectedOperators(elements.operatorFilter);
  if (operators.length && !state.operatorFields.length) {
    return "Operator filter unavailable: no operator columns detected in dataset.";
  }
  const timeBands = getSelectedTimeBands(elements.timeBandFilter);
  if (timeBands.length && (!state.timeBandFields || !Object.keys(state.timeBandFields).length)) {
    return "Time band filter unavailable: no timetable flag columns detected in dataset.";
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

// Export functions removed - now imported from ./js/exports/handlers.js:
// - queryGeoJson (49 lines)
// - queryCsv (33 lines)

// Table rendering functions removed - now imported from ./js/table/renderer.js:
// - getTableColumns (12 lines)
// - renderTableHead (91 lines)
// - fetchTablePage (35 lines)
// - ensureTablePageFor (41 lines)
// - renderTable (184 lines)
// - queryTable (256 lines)

// Export handler functions removed - now imported from ./js/exports/handlers.js:
// - downloadFile (8 lines)
// - onDownloadGeojson (310 lines)
// - onDownloadCsv (32 lines)

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
    fitMapToBbox(state.map, metadata.bbox, "Fitting to dataset bounds...", setStatus);
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
    const { overrides } = applyFeatureOverrides(state.config);
    if (Object.keys(overrides).length) {
      logEvent("info", "Feature overrides applied.", overrides);
    }
    if (isAdminMode()) {
      logEvent("info", "Admin mode enabled.");
    }
    state.tableLimit = Math.max(100, Math.min(Number(state.config.tableLimit ?? 2000), 10000));
    state.tablePaging.pageSize = Math.max(100, Math.min(Number(state.config.tablePageSize ?? 500), 5000));
    state.tablePaging.browseMax = Math.max(state.tablePaging.pageSize, Math.min(Number(state.config.tableBrowseMax ?? 10000), 500000));
    applyFeatureFlags(state.config);

    applyUiConfig(state.config);
    initMap(state.config);
    renderAdminPanel(state.config);

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

    // Sidebar fullscreen toggle
    if (elements.sidebarFullscreen) {
      elements.sidebarFullscreen.addEventListener("click", () => {
        if (!elements.sidebar) {
          return;
        }
        const fullscreen = elements.sidebar.dataset.fullscreen === "true";
        elements.sidebar.dataset.fullscreen = fullscreen ? "false" : "true";

        if (!fullscreen) {
          // Enter fullscreen
          elements.sidebar.style.width = "100vw";
          elements.sidebar.style.maxWidth = "100vw";
          elements.sidebar.style.zIndex = "50";
        } else {
          // Exit fullscreen
          elements.sidebar.style.width = "";
          elements.sidebar.style.maxWidth = "";
          elements.sidebar.style.zIndex = "";
        }

        const icon = elements.sidebarFullscreen.querySelector(".material-symbols-outlined");
        if (icon) {
          icon.textContent = fullscreen ? "fullscreen" : "fullscreen_exit";
        }

        if (state.map) {
          state.map.resize();
        }
      });
    }

    // Map fullscreen toggle
    if (elements.mapFullscreen) {
      elements.mapFullscreen.addEventListener("click", () => {
        const main = document.querySelector("main");
        if (!main) {
          return;
        }
        const fullscreen = main.dataset.fullscreen === "true";
        main.dataset.fullscreen = fullscreen ? "false" : "true";

        if (!fullscreen) {
          // Enter fullscreen
          main.style.position = "fixed";
          main.style.inset = "0";
          main.style.zIndex = "50";
          if (elements.sidebar) {
            elements.sidebar.style.display = "none";
          }
        } else {
          // Exit fullscreen
          main.style.position = "";
          main.style.inset = "";
          main.style.zIndex = "";
          if (elements.sidebar) {
            elements.sidebar.style.display = "";
          }
        }

        const icon = elements.mapFullscreen.querySelector(".material-symbols-outlined");
        if (icon) {
          icon.textContent = fullscreen ? "fullscreen" : "fullscreen_exit";
        }

        if (state.map) {
          state.map.resize();
        }
      });
    }
    initTabs();
    let spatialLogicRunner = null;
    if (elements.spatialLogicTool && !elements.spatialLogicTool.hidden) {
      spatialLogicRunner = await loadSpatialLogicRunner(state.config, setStatus);
      initSpatialLogicBuilder(
        elements.spatialLogicTool,
        {
          onChange: async (compiled) => {
            await applySpatialLogic(compiled, {
              setStatus,
              setMatchSet: setSpatialMatchSet,
              config: state.config
            });
            updateEvidence();
            updateSpatialPointOverlay();
            onApplyFilters({ autoFit: false });
          },
          onRun: async (compiled) => {
            if (!spatialLogicRunner) {
              setStatus("Spatial query runner not initialized.");
              return;
            }

            if (!state.spatialQuery?.point) {
              setStatus("Please select a point on the map first.");
              return;
            }

            try {
              setStatus("Running spatial query...");
              const result = await spatialLogicRunner.run(
                compiled,
                state.spatialQuery.point,
                state.db
              );

              setSpatialMatchSet(new Set(result.serviceIds));
              setStatus(`Spatial query: ${result.count} routes found.`);
              updateEvidence();
              updateSpatialPointOverlay();
              onApplyFilters({ autoFit: true });
            } catch (err) {
              const message = err?.message || String(err);
              setStatus(`Spatial query failed: ${message}`);
              console.error("[App] Spatial query error:", err);
            }
          },
          onDistanceChange: (distance) => {
            // Update radius overlay when distance slider moves
            updateSpatialPointOverlay();
          }
        },
        spatialLogicRunner
      );
      updateSpatialPointLabel();
      if (elements.spatialLogicPickPoint) {
        elements.spatialLogicPickPoint.addEventListener("click", () => {
          setSpatialPickingPoint(true);
          if (state.map) {
            state.map.getCanvas().style.cursor = "crosshair";
          }
          setStatus("Click the map to set a point.");
        });
      }
    }
    resetStats();
    renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
    if (!state.tableEventsBound && elements.dataTableBody) {
      state.tableEventsBound = true;
      elements.dataTableBody.addEventListener("click", (event) => {
        const td = event.target?.closest?.("td");
        const tr = event.target?.closest?.("tr");
        const idx = tr?.dataset?.rowIndex;
        if (td && idx !== undefined) {
          const value = td.dataset.copyValue || "";
          if (value) {
            copyText(value).then((ok) => {
              setStatus(ok ? "Cell copied." : "Copy failed.");
            });
          }
        }
        if (idx === undefined) {
          return;
        }
        const row = getTableRowAtIndex(Number(idx));
        if (!row) {
          if (state.conn && state.tablePaging.enabled) {
            ensureTablePageFor(Number(idx), setStatus, updateEvidence, null, getCurrentFilters());
            setStatus("Loading row... click again.");
          }
          return;
        }
        const rowServiceId = row.serviceId ?? "";
        setSelection({ properties: row }, `serviceId:${rowServiceId}`);
        syncSelectedLayer();
        renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
      });
    }
    if (elements.dataTableScroll) {
      let timer = null;
      elements.dataTableScroll.addEventListener("scroll", () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
        }, 16);
      });
    }
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
      await initDuckDb(state.config, duckdb, setStatus);
      populateFilters();
      await populateBoundaryFilters();

      await loadInitialDatasetView();
    } catch (duckdbError) {
      state.conn = null;
      state.db = null;
      elements.bboxFilter.checked = false;
      elements.bboxFilter.disabled = true;
      state.tableRows = [];
      renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
      setPreview("Map ready. DuckDB failed to start, so table/stats/exports are disabled.");
      setStatus(duckdbError.message);
      if (state.config?.geojsonFile) {
        try {
          const geojson = await loadGeojsonPreview();
          state.lastPreviewGeojson = geojson;
          updateOverlay(geojson);
          state.tableRows = geojson.features.slice(0, state.tableLimit).map((feature) => feature.properties || {});
          renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, getCurrentFilters());
          setPreview(`GeoJSON preview: ${formatCount(geojson.features.length)} routes (preview only).`);
          setStatus("DuckDB unavailable; using GeoJSON preview for table/selection.");
        } catch (previewError) {
          setStatus(`DuckDB unavailable; GeoJSON preview failed: ${previewError.message}`);
        }
      }
    }

    elements.applyFilters.addEventListener("click", () => onApplyFilters({ autoFit: true }));
    elements.clearFilters.addEventListener("click", onClearFilters);
    if (elements.clearAll) {
      elements.clearAll.addEventListener("click", onClearFilters);
    }
    elements.loadSample.addEventListener("click", onLoadSample);
    elements.downloadGeojson.addEventListener("click", () =>
      onDownloadGeojson(setStatus, toggleActionButtons, validateFilters, queryCount, logAction, logEvent, getCurrentFilters)
    );
    elements.downloadCsv.addEventListener("click", () =>
      onDownloadCsv(setStatus, toggleActionButtons, validateFilters, queryCount, logAction, logEvent, getCurrentFilters)
    );
    if (elements.exportCsvTable) {
      elements.exportCsvTable.addEventListener("click", () =>
        onDownloadCsv(setStatus, toggleActionButtons, validateFilters, queryCount, logAction, logEvent, getCurrentFilters)
      );
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
        const value = getServiceSearchValue(elements.serviceSearch);
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
        const value = getServiceSearchValue(elements.serviceSearch);
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

    // Keep map + table in sync as filters change (multi-selects and dropdowns).
    // Apply remains as an explicit action, but the UX should feel "live".
    const makeDebounced = (fn, delayMs) => {
      let timer = null;
      return () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          fn();
        }, delayMs);
      };
    };
    const scheduleApplyFilters = makeDebounced(() => {
      onApplyFilters();
    }, 150);
    const bindFilterChange = (el) => {
      if (!el) return;
      el.addEventListener("change", scheduleApplyFilters);
    };
    bindFilterChange(elements.modeFilter);
    bindFilterChange(elements.operatorFilter);
    bindFilterChange(elements.timeBandFilter);
    bindFilterChange(elements.laFilter);
    bindFilterChange(elements.rptFilter);

    // Place search (feature-flagged geocoder).
    if (getFeatureFlag(state.config, "geocoder", false) && elements.placeSearch && elements.placeSearchResults) {
      let timer = null;
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
            if (!geocoderMarker) {
              geocoderMarker = new maplibregl.Marker({ color: "#2563eb" });
            }
            geocoderMarker.setLngLat([item.lon, item.lat]).addTo(state.map);
            setSpatialPoint({ lng: item.lon, lat: item.lat });
            updateSpatialPointLabel();
            updateSpatialPointOverlay();
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
            operators: getSelectedOperators(elements.operatorFilter),
            bbox: Boolean(elements.bboxFilter?.checked),
            serviceSearch: getServiceSearchValue(elements.serviceSearch),
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
