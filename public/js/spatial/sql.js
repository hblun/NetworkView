/**
 * Spatial query SQL generation with bbox fallback
 */

import { state } from "../state/manager.js";
import { escapeSql, quoteIdentifier } from "../utils/sql.js";

const quoteField = (field) => quoteIdentifier(field || "geometry");
const formatLiteral = (value) => `'${escapeSql(value)}'`;

const joinCoords = (coords) => coords.map(([lng, lat]) => `${lng} ${lat}`).join(", ");

const ringToWkt = (ring) => `(${joinCoords(ring)})`;

const polygonToWkt = (rings) =>
  `(${rings.map((ring) => ringToWkt(ring)).join(", ")})`;

const geometryToWkt = (geometry) => {
  if (!geometry || typeof geometry.type !== "string") {
    return null;
  }

  switch (geometry.type) {
    case "Point":
      return `POINT(${joinCoords([geometry.coordinates])})`;
    case "LineString":
      return `LINESTRING(${joinCoords(geometry.coordinates)})`;
    case "Polygon":
      return `POLYGON${polygonToWkt(geometry.coordinates)}`;
    case "MultiPolygon":
      return `MULTIPOLYGON(${geometry.coordinates
        .map((polygon) => polygonToWkt(polygon))
        .join(", ")})`;
    default:
      return null;
  }
};

const normalizeBoundary = (boundary) => {
  if (!boundary) {
    return null;
  }

  if (typeof boundary === "string") {
    return { wkt: boundary };
  }

  if (boundary.wkt) {
    return { wkt: boundary.wkt };
  }

  if (boundary.geometry) {
    const wkt = geometryToWkt(boundary.geometry);
    if (wkt) {
      return { wkt };
    }
  }

  const wkt = geometryToWkt(boundary);
  if (wkt) {
    return { wkt };
  }

  return null;
};

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

  const normalizedRelation = relation === "intersects" ? "intersects" : "within";

  const useSpatial = state.spatialReady && state.geometryField;
  console.log("[Spatial SQL] Mode decision:", {
    spatialReady: state.spatialReady,
    geometryField: state.geometryField,
    bboxReady: state.bboxReady,
    usingSpatialMode: useSpatial
  });

  if (useSpatial) {
    const geomField = quoteField(state.geometryField);
    const pointWkt = `POINT(${point.lng} ${point.lat})`;
    const distanceDegrees = distanceMeters / 111320;
    const pointLiteral = formatLiteral(pointWkt);

    if (normalizedRelation === "within") {
      return `ST_Distance(ST_GeomFromText(${pointLiteral}, 4326), ${geomField}) <= ${distanceDegrees}`;
    }

    return `ST_Intersects(ST_Buffer(ST_GeomFromText(${pointLiteral}, 4326), ${distanceDegrees}), ${geomField})`;
  }

  if (!state.bboxReady) {
    throw new Error("Bbox fields not available");
  }

  const bbox = expandPointToBbox(point, distanceMeters);
  const { minx, miny, maxx, maxy } = state.bboxFields;
  const clauses = [
    `${quoteField(maxx)} >= ${bbox.minLon}`,
    `${quoteField(minx)} <= ${bbox.maxLon}`,
    `${quoteField(maxy)} >= ${bbox.minLat}`,
    `${quoteField(miny)} <= ${bbox.maxLat}`
  ];

  return clauses.join(" AND ");
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

  const normalized = normalizeBoundary(boundaryGeom);
  if (!normalized?.wkt) {
    throw new Error("Boundary geometry must include WKT or GeoJSON");
  }

  const geomField = quoteField(state.geometryField);
  const boundaryLiteral = formatLiteral(normalized.wkt);

  if (operator === "touches_boundary") {
    return `ST_Touches(${geomField}, ST_GeomFromText(${boundaryLiteral}, 4326))`;
  } else if (operator === "inside_boundary") {
    return `ST_Within(${geomField}, ST_GeomFromText(${boundaryLiteral}, 4326))`;
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
    const literal = formatLiteral(value);
    const conditions = operatorFields.map((field) => `${quoteField(field)} = ${literal}`);
    return `(${conditions.join(" OR ")})`;
  } else if (operator === "mode") {
    if (!state.modeField) {
      throw new Error("No mode field found in schema");
    }
    return `${quoteField(state.modeField)} = ${formatLiteral(value)}`;
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

  const combineAnd = (current, next) =>
    current ? `(${current}) AND (${next})` : next;
  const combineOr = (current, next) =>
    current ? `(${current}) OR (${next})` : next;
  const isTrivialClause = (clause) => {
    if (!clause) {
      return true;
    }
    return clause.replace(/\s+/g, "").toLowerCase() === "1=1";
  };

  const globalBoundary = compiled.boundary || compiled.boundaryGeom || compiled.boundarySelection;

  const buildMainClause = (block) => {
    if (block.target === "selected_point") {
      if (!point) {
        throw new Error("Point is required for selected_point target");
      }
      return buildPointDistanceWhere(point, block.distance, block.relation);
    }
    if (block.target === "boundary") {
      return buildBoundaryWhere(block.relation || "within", globalBoundary);
    }
    return null;
  };

  const buildSupplementalClause = (block) => {
    if (block.operator === "near_point") {
      if (!point) {
        throw new Error("Point is required for near_point operator");
      }
      return buildPointDistanceWhere(point, block.distance || 300, "within");
    }
    if (block.operator === "touches_boundary" || block.operator === "inside_boundary") {
      if (!state.spatialReady) {
        throw new Error(`${block.operator} requires spatial extension (unavailable)`);
      }
      return buildBoundaryWhere(block.operator, block.boundary || globalBoundary);
    }
    if (block.operator === "operator" || block.operator === "mode") {
      return buildAttributeWhere(block.operator, block.value);
    }
    return null;
  };

  let expression = null;

  compiled.blocks.forEach((block, index) => {
    const clause =
      index === 0 ? buildMainClause(block) : buildSupplementalClause(block);
    if (isTrivialClause(clause)) {
      return;
    }

    const type = block.type || "include";
    if (type === "exclude") {
      expression = combineAnd(expression, `NOT (${clause})`);
    } else if (type === "also-include") {
      expression = combineOr(expression, clause);
    } else {
      expression = combineAnd(expression, clause);
    }
  });

  return expression || "1=1";
};
