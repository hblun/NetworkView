/**
 * Spatial query SQL generation with bbox fallback
 */

import { state } from "../state/manager.js";

/**
 * Expands a point to a bounding box based on distance
 * @param {object} point - {lat, lng}
 * @param {number} distanceMeters - Distance in meters
 * @returns {object} {minLon, minLat, maxLon, maxLat}
 */
export const expandPointToBbox = (point, distanceMeters) => {
  // Approximate conversion: 1 degree latitude ≈ 111,320 meters
  // 1 degree longitude ≈ 111,320 * cos(latitude) meters
  const latDelta = distanceMeters / 111320;
  const lngDelta = distanceMeters / (111320 * Math.cos((point.lat * Math.PI) / 180));

  return {
    minLon: point.lng - lngDelta,
    minLat: point.lat - latDelta,
    maxLon: point.lng + lngDelta,
    maxLat: point.lat + latDelta
  };
};

/**
 * Builds WHERE clause for point + distance query
 * @param {object} point - {lat, lng}
 * @param {number} distanceMeters - Distance in meters
 * @param {string} relation - "within" or "intersects"
 * @returns {string} SQL WHERE clause
 */
export const buildPointDistanceWhere = (point, distanceMeters, relation = "within") => {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error("Invalid point coordinates");
  }
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error("Invalid distance");
  }

  // Use spatial extension if available and geometry field exists
  // Otherwise fall back to bbox (if bbox columns are available)
  const useSpatial = state.spatialReady && state.geometryField;

  if (useSpatial) {
    const geomField = state.geometryField;
    // DuckDB spatial: geometry column in parquet is already GEOMETRY type
    // Don't wrap it in ST_GeomFromText, just use it directly
    const pointWKT = `POINT(${point.lng} ${point.lat})`;

    if (relation === "within") {
      // ST_Distance returns distance in degrees, need to convert meters to degrees
      // Approximate: 1 degree ≈ 111,320 meters
      const distanceDegrees = distanceMeters / 111320;
      // Geometry column is already geometry type, no conversion needed
      return `ST_Distance(ST_GeomFromText('${pointWKT}'), "${geomField}") <= ${distanceDegrees}`;
    } else {
      // intersects with buffer
      const distanceDegrees = distanceMeters / 111320;
      return `ST_Intersects(ST_Buffer(ST_GeomFromText('${pointWKT}'), ${distanceDegrees}), "${geomField}")`;
    }
  }

  // Use bbox expansion (reliable and fast)
  if (!state.bboxReady) {
    throw new Error("Bbox fields not available");
  }

  const bbox = expandPointToBbox(point, distanceMeters);
  const { minx, miny, maxx, maxy } = state.bboxFields;

  return `
    "${maxx}" >= ${bbox.minLon} AND
    "${minx}" <= ${bbox.maxLon} AND
    "${maxy}" >= ${bbox.minLat} AND
    "${miny}" <= ${bbox.maxLat}
  `;
};

/**
 * Builds WHERE clause for boundary intersection/containment
 * @param {string} operator - "touches_boundary" or "inside_boundary"
 * @param {object} boundaryGeom - Boundary geometry (not yet implemented)
 * @returns {string} SQL WHERE clause
 */
export const buildBoundaryWhere = (operator, boundaryGeom) => {
  if (!state.spatialReady || !state.geometryField) {
    throw new Error("Boundary queries require spatial extension");
  }

  const geomField = state.geometryField;
  // TODO: Implement when boundary selection is added
  // For now, placeholder
  if (operator === "touches_boundary") {
    return `ST_Touches("${geomField}", ST_GeomFromText(?))`;
  } else if (operator === "inside_boundary") {
    return `ST_Within("${geomField}", ST_GeomFromText(?))`;
  }

  throw new Error(`Unknown boundary operator: ${operator}`);
};

/**
 * Builds WHERE clause for attribute filter (operator/mode)
 * @param {string} operator - "operator" or "mode"
 * @param {string} value - Filter value
 * @returns {string} SQL WHERE clause
 */
export const buildAttributeWhere = (operator, value) => {
  if (!value) {
    return "1=1";
  }

  if (operator === "operator") {
    // Try multiple operator field candidates
    const operatorFields = state.operatorFields || [];
    if (operatorFields.length === 0) {
      throw new Error("No operator field found in schema");
    }

    // Match any of the operator fields
    const conditions = operatorFields.map(field => `"${field}" = '${value}'`);
    return `(${conditions.join(" OR ")})`;
  } else if (operator === "mode") {
    if (!state.modeField) {
      throw new Error("No mode field found in schema");
    }
    return `"${state.modeField}" = '${value}'`;
  }

  throw new Error(`Unknown attribute operator: ${operator}`);
};

/**
 * Builds complete spatial query WHERE clause from compiled builder state
 * @param {object} compiled - Builder compiled state
 * @param {object} point - Selected point {lat, lng} (required for point-based queries)
 * @returns {string} SQL WHERE clause
 */
export const buildSpatialWhere = (compiled, point) => {
  if (!compiled || !compiled.blocks || compiled.blocks.length === 0) {
    return "1=1";
  }

  const conditions = [];

  // Process all blocks
  compiled.blocks.forEach((block, index) => {
    let blockCondition = null;

    // Main block (first block)
    if (index === 0) {
      if (block.target === "selected_point") {
        if (!point) {
          throw new Error("Point is required for selected_point target");
        }
        blockCondition = buildPointDistanceWhere(point, block.distance, block.relation);
      } else if (block.target === "boundary") {
        // TODO: Implement boundary selection
        throw new Error("Boundary target not yet implemented");
      }
    } else {
      // Additional blocks (Include/Exclude/Also Include)
      if (block.operator === "near_point") {
        if (!point) {
          throw new Error("Point is required for near_point operator");
        }
        blockCondition = buildPointDistanceWhere(point, block.distance || 300, "within");
      } else if (block.operator === "touches_boundary" || block.operator === "inside_boundary") {
        // Requires spatial extension
        if (!state.spatialReady) {
          throw new Error(`${block.operator} requires spatial extension (unavailable)`);
        }
        blockCondition = buildBoundaryWhere(block.operator, null);
      } else if (block.operator === "operator" || block.operator === "mode") {
        blockCondition = buildAttributeWhere(block.operator, block.value);
      }
    }

    if (blockCondition) {
      // Apply block type logic
      if (block.type === "exclude") {
        conditions.push(`NOT (${blockCondition})`);
      } else if (block.type === "also-include") {
        // Also Include = OR with previous conditions
        if (conditions.length > 0) {
          const prev = conditions.pop();
          conditions.push(`((${prev}) OR (${blockCondition}))`);
        } else {
          conditions.push(blockCondition);
        }
      } else {
        // Include = AND
        conditions.push(blockCondition);
      }
    }
  });

  if (conditions.length === 0) {
    return "1=1";
  }

  return conditions.join(" AND ");
};
