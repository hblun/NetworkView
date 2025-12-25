import maplibregl from "https://esm.sh/maplibre-gl@3.6.2";
import { Protocol } from "https://cdn.jsdelivr.net/npm/pmtiles@3.0.6/+esm";
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

const elements = {
  datasetDate: document.getElementById("dataset-date"),
  datasetCount: document.getElementById("dataset-count"),
  modeFilter: document.getElementById("mode-filter"),
  operatorFilter: document.getElementById("operator-filter"),
  bboxFilter: document.getElementById("bbox-filter"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  loadSample: document.getElementById("load-sample"),
  downloadGeojson: document.getElementById("download-geojson"),
  downloadCsv: document.getElementById("download-csv"),
  colorByOperator: document.getElementById("color-by-operator"),
  statsGrid: document.getElementById("stats-grid"),
  statsModes: document.getElementById("stats-modes"),
  statsDirections: document.getElementById("stats-directions"),
  statsHint: document.getElementById("stats-hint"),
  selectionDetails: document.getElementById("selection-details"),
  clearSelection: document.getElementById("clear-selection"),
  status: document.getElementById("status"),
  previewCount: document.getElementById("preview-count")
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
  lastQuery: null
};

const escapeSql = (value) => String(value).replace(/'/g, "''");
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const joinUrl = (base, path) => {
  if (!base) {
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
  const geojsonAvailable = state.geojsonField || (state.spatialReady && state.geometryField);
  elements.downloadGeojson.disabled = !enabled || !geojsonAvailable;
  elements.downloadCsv.disabled = !enabled;
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
  for (const key of Object.keys(props)) {
    if (String(key).toLowerCase() === lower) {
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
    value.textContent = row.value;
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
};

const clearSelection = () => {
  state.selectedFeature = null;
  state.selectedFeatureKey = null;
  renderSelection(null);
  if (state.lastPreviewGeojson) {
    updateOverlay(state.lastPreviewGeojson);
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

  map.addControl(new maplibregl.NavigationControl(), "top-right");

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
    if (!config.pmtilesFile) {
      setStatus("PMTiles disabled. Map will show basemap only.");
      return;
    }
    const pmtilesUrl = joinUrl(config.dataBaseUrl, config.pmtilesFile);
    map.addSource("routes", {
      type: "vector",
      url: `pmtiles://${pmtilesUrl}`
    });

    map.addLayer({
      id: "routes-line",
      type: "line",
      source: "routes",
      "source-layer": config.vectorLayer || "routes",
      paint: {
        "line-color": "#d6603b",
        "line-width": 1.2,
        "line-opacity": 0.65
      }
    });

    state.baseLayerPaint = { opacity: 0.65, width: 1.2 };
    setBaseLayerFocus(state.baseLayerFiltered);
  });

  state.map = map;
};

const setBaseLayerFocus = (filtered) => {
  state.baseLayerFiltered = filtered;
  const map = state.map;
  const layerId = state.baseLayerId;
  if (!map || !layerId || !map.getLayer(layerId)) {
    return;
  }
  const opacity = filtered ? 0.18 : state.baseLayerPaint.opacity;
  const width = filtered ? Math.max(0.8, state.baseLayerPaint.width - 0.4) : state.baseLayerPaint.width;
  map.setPaintProperty(layerId, "line-opacity", opacity);
  map.setPaintProperty(layerId, "line-width", width);
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
  const bundles = rebaseBundles(duckdb.getJsDelivrBundles(), baseUrl);
  let bundle = null;
  if (config.duckdbBundle && bundles[config.duckdbBundle]) {
    bundle = bundles[config.duckdbBundle];
  } else if (typeof window !== "undefined" && !window.crossOriginIsolated && bundles.mvp) {
    bundle = bundles.mvp;
  } else {
    bundle = await duckdb.selectBundle(bundles);
  }
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
  try {
    state.db = await createDb(bundle);
  } catch (error) {
    if (bundles.mvp) {
      setStatus("DuckDB fallback (mvp) in use.");
      bundle = bundles.mvp;
      try {
        state.db = await createDb(bundle);
      } catch (fallbackError) {
        const hint = baseUrl
          ? `Check that ${baseUrl}/duckdb-browser-mvp.worker.js is accessible.`
          : "Set duckdbBaseUrl to a local folder with DuckDB assets.";
        throw new Error(`DuckDB worker failed to load. ${hint}`);
      }
    } else {
      const hint = baseUrl
        ? `Check that ${baseUrl}/duckdb-browser-mvp.worker.js is accessible.`
        : "Set duckdbBaseUrl to a local folder with DuckDB assets.";
      throw new Error(`DuckDB worker failed to load. ${hint}`);
    }
  }

  const conn = await state.db.connect();
  try {
    await conn.query("SET home_directory='/'");
    await conn.query("SET temp_directory='/'");
  } catch (error) {
    // Ignore if settings are not supported in this build.
  }

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
  return modes.length > 0 || operators.length > 0;
};

const buildWhere = () => {
  const clauses = [];
  const modes = getSelectedValues(elements.modeFilter);
  const operators = getSelectedOperators();

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

const onApplyFilters = async () => {
  if (!state.conn) {
    return;
  }
  toggleActionButtons(false);
  setStatus("Querying filtered routes...");

  try {
    const validation = validateFilters();
    if (validation) {
      setStatus(validation);
      return;
    }
    const filtered = hasAttributeFilters();
    const count = await queryCount();
    const countNumber = toNumber(count);
    setPreview(`${formatCount(count)} routes in selection.`);
    if (countNumber === 0) {
      setStatus("No routes matched the current filters.");
      const empty = { type: "FeatureCollection", features: [] };
      state.lastPreviewGeojson = empty;
      updateOverlay(empty);
    } else if (state.spatialReady || state.geojsonField) {
      const geojson = await queryGeoJson();
      state.lastPreviewGeojson = geojson;
      updateOverlay(geojson);
      setStatus("Preview updated. Use download to export full selection.");
    } else {
      state.lastPreviewGeojson = null;
      setStatus("Filters applied. Spatial preview unavailable without spatial extension.");
    }
    setBaseLayerFocus(filtered);
    await updateStats(countNumber);
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
  setPreview("No filters applied.");
  if (state.overlay) {
    state.overlay.setProps({ layers: [] });
  }
  state.lastPreviewGeojson = null;
  clearSelection();
  setBaseLayerFocus(false);
  resetStats();
  setStatus("Filters cleared.");
};

const onLoadSample = () => {
  const geojson = sampleGeojson();
  state.lastPreviewGeojson = geojson;
  updateOverlay(geojson);
  setPreview(`Sample preview: ${geojson.features.length} routes.`);
  setBaseLayerFocus(true);
  setStatsHint("Sample preview loaded. Apply filters for real stats.");
  setStatus("Sample preview loaded. Apply real filters once data is ready.");
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
    const configResponse = await fetch("config.json");
    if (!configResponse.ok) {
      throw new Error(`Config load failed (${configResponse.status})`);
    }
    state.config = await configResponse.json();

    applyUiConfig(state.config);
    initMap(state.config);
    initTabs();
    resetStats();
    try {
      await loadMetadata(state.config);
    } catch (error) {
      elements.datasetDate.textContent = "Metadata unavailable";
      elements.datasetCount.textContent = "";
      setStatus(`Metadata load failed: ${error.message}`);
    }
    await initDuckDb(state.config);
    populateFilters();

    elements.applyFilters.addEventListener("click", onApplyFilters);
    elements.clearFilters.addEventListener("click", onClearFilters);
    elements.loadSample.addEventListener("click", onLoadSample);
    elements.downloadGeojson.addEventListener("click", onDownloadGeojson);
    elements.downloadCsv.addEventListener("click", onDownloadCsv);
    if (elements.colorByOperator) {
      elements.colorByOperator.addEventListener("change", () => {
        state.colorByOperator = Boolean(elements.colorByOperator.checked);
        if (state.lastPreviewGeojson) {
          updateOverlay(state.lastPreviewGeojson);
        }
      });
    }
    if (elements.clearSelection) {
      elements.clearSelection.addEventListener("click", clearSelection);
    }

    setStatus("Ready.");
    toggleActionButtons(true);
  } catch (error) {
    setStatus(`Startup failed: ${error.message}`);
  }
};

init();
