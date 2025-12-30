/**
 * Centralized application state management
 */

/**
 * Application state singleton
 * DO NOT mutate directly - use provided functions
 */
export const state = {
  config: null,
  metadata: null,
  map: null,
  overlay: null,
  deck: null,
  db: null,
  conn: null,
  spatialReady: false,
  spatialBuilder: null,
  spatialService: null,
  spatialMatchSet: null,
  spatialQuery: {
    active: false,
    serviceIds: [],
    point: null,
    pickingPoint: false
  },
  duckdbReady: false,
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
  timeBandFields: {},
  tileTimeBandFields: {},
  laField: "",
  laNameField: "",
  laCodesField: "",
  laNamesField: "",
  rptField: "",
  rptNameField: "",
  rptCodesField: "",
  rptNamesField: "",
  lastQuery: null,
  applyingFilters: false,
  pendingFilterApply: false,
  lastMapFilterWarningKey: "",
  tileFields: {
    serviceId: "",
    serviceName: "",
    mode: "",
    operatorCode: "",
    operatorName: "",
    laCode: "",
    laCodes: "",
    rptCode: "",
    rptCodes: ""
  },
  tableRows: [],
  tableLimit: 250,
  tableVirtual: {
    rowHeight: 34,
    overscan: 8,
    start: 0,
    end: 0,
    lastMeasuredAt: 0
  },
  tableEventsBound: false,
  tablePaging: {
    enabled: true,
    pageSize: 500,
    browseMax: 10000,
    offset: 0,
    rows: [],
    loading: false,
    queryKey: ""
  },
  pendingPreviewGeojson: null,
  serviceIdField: "",
  boundaryLayers: {
    la: null,
    rpt: null
  }
  ,
  boundaryParquetReady: {
    la: false,
    rpt: false
  }
};

/**
 * Expose state for debugging in development
 * Access via window.__NV_STATE in browser console
 */
if (typeof window !== "undefined") {
  window.__NV_STATE = state;
}

/**
 * Sets the DuckDB connection
 * @param {object} conn - DuckDB connection
 * @param {object} db - DuckDB database instance
 */
export const setDuckDBConnection = (conn, db) => {
  state.conn = conn;
  state.db = db;
  state.duckdbReady = Boolean(conn && db);
};

/**
 * Sets the map instance
 * @param {object} map - MapLibre map instance
 */
export const setMap = (map) => {
  state.map = map;
};

/**
 * Sets configuration
 * @param {object} config - Configuration object
 */
export const setConfig = (config) => {
  state.config = config;
};

/**
 * Sets metadata
 * @param {object} metadata - Metadata object
 */
export const setMetadata = (metadata) => {
  state.metadata = metadata;
};

/**
 * Sets spatial readiness flag
 * @param {boolean} ready - Whether spatial extension is ready
 */
export const setSpatialReady = (ready) => {
  state.spatialReady = Boolean(ready);
};

/**
 * Sets spatial logic builder reference
 * @param {object|null} builder - Builder instance
 */
export const setSpatialBuilder = (builder) => {
  state.spatialBuilder = builder || null;
};

/**
 * Sets spatial service reference
 * @param {object|null} service - Spatial service instance
 */
export const setSpatialService = (service) => {
  state.spatialService = service || null;
};

/**
 * Sets spatial match set (service IDs)
 * @param {Set<string>|null} matchSet - Match set of service IDs
 */
export const setSpatialMatchSet = (matchSet) => {
  if (matchSet === null || matchSet === undefined) {
    state.spatialMatchSet = null;
    state.spatialQuery = {
      ...state.spatialQuery,
      active: false,
      serviceIds: []
    };
    return;
  }
  const ids = Array.from(matchSet).map((value) => String(value));
  state.spatialMatchSet = new Set(ids);
  state.spatialQuery = {
    ...state.spatialQuery,
    active: true,
    serviceIds: ids
  };
};

/**
 * Clears spatial match set
 */
export const clearSpatialMatchSet = () => {
  setSpatialMatchSet(null);
};

/**
 * Sets spatial query point
 * @param {object|null} point - {lng, lat} or null
 */
export const setSpatialPoint = (point) => {
  state.spatialQuery = {
    ...state.spatialQuery,
    point: point || null
  };
};

export const setBoundaryParquetReady = (type, ready) => {
  if (!["la", "rpt"].includes(type)) {
    return;
  }
  state.boundaryParquetReady = {
    ...state.boundaryParquetReady,
    [type]: Boolean(ready)
  };
};

/**
 * Sets spatial point picking state
 * @param {boolean} picking - Whether user is picking a point on the map
 */
export const setSpatialPickingPoint = (picking) => {
  state.spatialQuery = {
    ...state.spatialQuery,
    pickingPoint: Boolean(picking)
  };
};

/**
 * Sets selected feature
 * @param {object|null} feature - GeoJSON feature or null to clear
 * @param {string} key - Feature key for identification
 */
export const setSelectedFeature = (feature, key = "") => {
  state.selectedFeature = feature;
  state.selectedFeatureKey = key;
};

/**
 * Clears selected feature
 */
export const clearSelectedFeature = () => {
  state.selectedFeature = null;
  state.selectedFeatureKey = null;
};

/**
 * Sets table rows
 * @param {Array<object>} rows - Array of row objects
 */
export const setTableRows = (rows) => {
  state.tableRows = Array.isArray(rows) ? rows : [];
};

/**
 * Sets parquet columns
 * @param {Array<string>} columns - Column names
 */
export const setColumns = (columns) => {
  state.columns = Array.isArray(columns) ? columns : [];
};

/**
 * Gets a field from state
 * @param {string} path - Dot-separated path (e.g., "config.dataBaseUrl")
 * @returns {*} Field value or undefined
 */
export const getStateField = (path) => {
  const parts = path.split(".");
  let current = state;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

/**
 * Updates last query info
 * @param {object} queryInfo - Query information (count, sql, etc.)
 */
export const setLastQuery = (queryInfo) => {
  state.lastQuery = queryInfo;
};

/**
 * Toggles color by operator mode
 * @param {boolean} enabled - Whether to color by operator
 */
export const setColorByOperator = (enabled) => {
  state.colorByOperator = Boolean(enabled);
};
