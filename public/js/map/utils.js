/**
 * Map rendering utilities and helper functions
 */

import { state } from "../state/manager.js";
import { getFeaturesBbox, isValidBbox } from "../utils/geometry.js";

/**
 * Checks if a layer is visible
 * @param {object} map - MapLibre map instance
 * @param {string} layerId - Layer ID to check
 * @returns {boolean} True if visible
 */
export const getLayerVisible = (map, layerId) => {
  if (!map || !layerId || !map.getLayer(layerId)) {
    return false;
  }
  const visibility = map.getLayoutProperty(layerId, "visibility");
  return visibility !== "none";
};

/**
 * Fits map to a bounding box
 * @param {object} map - MapLibre map instance
 * @param {number[]} bbox - Bounding box [minLon, minLat, maxLon, maxLat]
 * @param {string} reason - Optional status message
 * @param {Function} setStatus - Status update callback
 */
export const fitMapToBbox = (map, bbox, reason, setStatus) => {
  if (!map || !isValidBbox(bbox)) {
    return;
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;

  try {
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat]
      ],
      { padding: 40, duration: 450 }
    );

    const minZoom = Number(state.config?.routesMinZoom ?? 5);
    if (Number.isFinite(minZoom)) {
      map.once("moveend", () => {
        try {
          if (map.getZoom() < minZoom) {
            map.setZoom(minZoom);
          }
        } catch (zoomError) {
          // Ignore zoom clamp failures
        }
      });
    }

    if (reason && setStatus) {
      setStatus(reason);
    }
  } catch (error) {
    // Ignore invalid bounds
  }
};

/**
 * Fits map to current scope (preview or rendered features)
 * @param {object} map - MapLibre map instance
 * @param {string} reason - Status message
 * @param {Function} setStatus - Status callback
 * @param {boolean} bboxFilterActive - Whether bbox filter is active
 */
export const fitMapToScope = (map, reason, setStatus, bboxFilterActive = false) => {
  if (!map || !state.config?.features?.autoFitScope) {
    return;
  }

  // If bbox-filter is active, the scope is explicitly the viewport
  if (bboxFilterActive) {
    return;
  }

  // Prefer GeoJSON preview bounds when present
  if (state.lastPreviewGeojson?.features?.length) {
    const bbox = getFeaturesBbox(state.lastPreviewGeojson.features);
    if (bbox) {
      fitMapToBbox(map, bbox, reason || "Fitting to preview scope...", setStatus);
      return;
    }
  }

  // Best-effort: fit to currently rendered features
  try {
    const rendered = map.queryRenderedFeatures(undefined, { layers: ["routes-line"] });
    const bbox = getFeaturesBbox(rendered);
    if (bbox) {
      fitMapToBbox(map, bbox, reason || "Fitting to scope...", setStatus);
      return;
    }
  } catch (error) {
    // Ignore render query failures
  }
};

/**
 * Updates zoom button states
 * @param {object} map - MapLibre map instance
 * @param {HTMLButtonElement} zoomInBtn - Zoom in button
 * @param {HTMLButtonElement} zoomOutBtn - Zoom out button
 */
export const updateZoomButtons = (map, zoomInBtn, zoomOutBtn) => {
  if (!map || !zoomInBtn || !zoomOutBtn) {
    return;
  }

  const zoom = map.getZoom();
  const minZoom = typeof map.getMinZoom === "function" ? map.getMinZoom() : 0;
  const maxZoom = typeof map.getMaxZoom === "function" ? map.getMaxZoom() : 24;

  zoomOutBtn.disabled = zoom <= minZoom + 1e-6;
  zoomInBtn.disabled = zoom >= maxZoom - 1e-6;

  zoomOutBtn.classList.toggle("opacity-50", zoomOutBtn.disabled);
  zoomInBtn.classList.toggle("opacity-50", zoomInBtn.disabled);
};

/**
 * Gets a unique feature key for identification
 * @param {object} feature - GeoJSON feature
 * @param {string} fallback - Fallback key if service ID not found
 * @returns {string} Unique feature key
 */
export const getFeatureKey = (feature, fallback = "") => {
  if (!feature) return fallback;

  const props = feature.properties || {};
  const candidates = ["serviceId", "service_id", "id"];

  for (const key of candidates) {
    const value = props[key];
    if (value !== undefined && value !== null && value !== "") {
      return `serviceId:${value}`;
    }
  }

  // Use feature ID if available
  if (feature.id !== undefined && feature.id !== null) {
    return `featureId:${feature.id}`;
  }

  return fallback || `feature:${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Creates a MapLibre filter expression from attribute filters
 * @param {object} filters - Filter values
 * @param {object} tileFields - Detected tile field names
 * @returns {Array|null} MapLibre filter expression or null
 */
export const buildMapFilter = (filters, tileFields) => {
  const { modes = [], operators = [], laValue = "", rptValue = "" } = filters;

  const expressions = ["all"];

  // Mode filter
  if (modes.length && tileFields.mode) {
    const hasNone = modes.includes("__NONE__");
    const values = modes.filter((m) => m !== "__NONE__");

    if (values.length > 0 && !hasNone) {
      expressions.push(["in", ["get", tileFields.mode], ["literal", values]]);
    } else if (values.length > 0 && hasNone) {
      expressions.push([
        "any",
        ["in", ["get", tileFields.mode], ["literal", values]],
        ["!", ["has", tileFields.mode]],
        ["==", ["get", tileFields.mode], ""]
      ]);
    } else if (hasNone) {
      expressions.push([
        "any",
        ["!", ["has", tileFields.mode]],
        ["==", ["get", tileFields.mode], ""]
      ]);
    }
  }

  // Operator filter
  if (operators.length) {
    const hasNone = operators.some((op) => op.value === "__NONE__");
    const values = operators.filter((op) => op.value && op.value !== "__NONE__").map((op) => op.value);

    const operatorFields = [tileFields.operatorCode, tileFields.operatorName].filter(Boolean);

    if (operatorFields.length > 0) {
      const opExprs = operatorFields.map((field) => {
        if (values.length > 0 && !hasNone) {
          return ["in", ["get", field], ["literal", values]];
        } else if (values.length > 0 && hasNone) {
          return [
            "any",
            ["in", ["get", field], ["literal", values]],
            ["!", ["has", field]],
            ["==", ["get", field], ""]
          ];
        } else if (hasNone) {
          return ["any", ["!", ["has", field]], ["==", ["get", field], ""]];
        }
        return null;
      }).filter(Boolean);

      if (opExprs.length > 0) {
        expressions.push(opExprs.length === 1 ? opExprs[0] : ["any", ...opExprs]);
      }
    }
  }

  // LA filter - check both primary and membership fields
  if (laValue && laValue !== "__NONE__") {
    const laExprs = [];

    if (tileFields.laCode) {
      laExprs.push(["==", ["get", tileFields.laCode], laValue]);
    }

    if (tileFields.laCodes) {
      const pattern = `|${laValue}|`;
      laExprs.push(["in", pattern, ["get", tileFields.laCodes]]);
    }

    if (laExprs.length > 0) {
      expressions.push(laExprs.length === 1 ? laExprs[0] : ["any", ...laExprs]);
    }
  }

  // RPT filter - check both primary and membership fields
  if (rptValue && rptValue !== "__NONE__") {
    const rptExprs = [];

    if (tileFields.rptCode) {
      rptExprs.push(["==", ["get", tileFields.rptCode], rptValue]);
    }

    if (tileFields.rptCodes) {
      const pattern = `|${rptValue}|`;
      rptExprs.push(["in", pattern, ["get", tileFields.rptCodes]]);
    }

    if (rptExprs.length > 0) {
      expressions.push(rptExprs.length === 1 ? rptExprs[0] : ["any", ...rptExprs]);
    }
  }

  // If only "all" remains, no filters
  if (expressions.length === 1) {
    return null;
  }

  return expressions;
};

/**
 * Detects tile field names from rendered features
 * @param {object} map - MapLibre map instance
 * @param {string} layerId - Layer to query
 * @returns {object} Detected field names
 */
export const detectTileFieldsFromRendered = (map, layerId) => {
  if (!map || !layerId) {
    return {};
  }

  try {
    const rendered = map.queryRenderedFeatures(undefined, { layers: [layerId] });
    if (!rendered.length) {
      return {};
    }

    const sample = rendered[0].properties || {};
    const keys = Object.keys(sample);
    const lowerKeys = new Map(keys.map((k) => [k.toLowerCase(), k]));

    const findField = (candidates) => {
      for (const candidate of candidates) {
        const hit = lowerKeys.get(candidate.toLowerCase());
        if (hit) return hit;
      }
      return "";
    };

    return {
      serviceId: findField(["serviceId", "service_id", "id"]),
      serviceName: findField(["serviceName", "service_name", "name"]),
      mode: findField(["mode", "transport_mode"]),
      operatorCode: findField(["operatorCode", "operator_code"]),
      operatorName: findField(["operatorName", "operator_name", "operator"]),
      laCode: findField(["la_code", "laCode", "la"]),
      laCodes: findField(["la_codes", "laCodes"]),
      rptCode: findField(["rpt_code", "rptCode", "rpt"]),
      rptCodes: findField(["rpt_codes", "rptCodes"])
    };
  } catch (error) {
    return {};
  }
};
