/**
 * Application constants and configuration values
 */

// Special option values
export const NONE_OPTION_VALUE = "__NONE__";

// Map layer IDs
export const LAYER_IDS = {
  BASE: "routes-line",
  SELECTED: "routes-selected",
  BOUNDARIES_LA: "boundaries-la",
  BOUNDARIES_RPT: "boundaries-rpt",
  SPATIAL_POINT: "spatial-point",
  SPATIAL_RADIUS: "spatial-radius"
};

// Default colors
export const COLORS = {
  DEFAULT_ROUTE: "#d6603b",
  PREVIEW_ROUTE: "#165570",
  SELECTED_ROUTE: "#f59e0b",
  PRIMARY: "#2563eb"
};

// Map styling
export const ROUTE_LINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5, 0.9,
  8, 1.3,
  11, 2.2,
  14, 3.6
];

export const SELECTED_LINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5, 2.2,
  8, 3.0,
  11, 4.4,
  14, 6.2
];

// Time band definitions
export const TIME_BAND_OPTIONS = [
  {
    key: "weekday",
    label: "Weekday",
    candidates: ["runs_weekday", "runsWeekday", "runs_weekday_flag"]
  },
  {
    key: "saturday",
    label: "Saturday",
    candidates: ["runs_saturday", "runsSaturday", "runs_sat", "runsSat"]
  },
  {
    key: "sunday",
    label: "Sunday",
    candidates: ["runs_sunday", "runsSunday", "runs_sun", "runsSun"]
  },
  {
    key: "evening",
    label: "Evening",
    candidates: ["runs_evening", "runsEvening"]
  },
  {
    key: "night",
    label: "Night",
    candidates: ["runs_night", "runsNight"]
  }
];

// Field name candidates for auto-detection
export const FIELD_CANDIDATES = {
  MODE: ["mode", "transport_mode", "Mode"],
  OPERATOR: ["operatorCode", "operatorName", "operator"],
  LA_CODE: ["la_code", "laCode", "la"],
  LA_NAME: ["la_name", "laName", "local_authority"],
  LA_CODES: ["la_codes", "laCodes", "la_list"],
  LA_NAMES: ["la_names", "laNames", "local_authorities"],
  RPT_CODE: ["rpt_code", "rptCode", "rpt"],
  RPT_NAME: ["rpt_name", "rptName"],
  RPT_CODES: ["rpt_codes", "rptCodes", "rpt_list"],
  RPT_NAMES: ["rpt_names", "rptNames"],
  SERVICE_ID: ["serviceId", "service_id", "id"],
  SERVICE_NAME: ["serviceName", "service_name", "name"],
  GEOMETRY: ["geom", "geometry", "wkb_geometry"]
};

// Table configuration
export const TABLE_CONFIG = {
  DEFAULT_LIMIT: 2000,
  DEFAULT_PAGE_SIZE: 500,
  DEFAULT_BROWSE_MAX: 10000,
  ROW_HEIGHT: 34,
  OVERSCAN: 8
};

// Export limits
export const EXPORT_LIMITS = {
  CSV_WARNING_THRESHOLD: 10000,
  GEOJSON_WARNING_THRESHOLD: 5000,
  MAX_EXPORT_ROWS: 50000
};
