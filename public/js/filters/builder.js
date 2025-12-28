/**
 * Filter logic and SQL WHERE clause construction
 */

import { state } from "../state/manager.js";
import { escapeSql, quoteIdentifier } from "../utils/sql.js";
import { NONE_OPTION_VALUE } from "../config/constants.js";

const quoteQualified = (value) =>
  String(value)
    .split(".")
    .map((part) => quoteIdentifier(part))
    .join(".");

const quoteField = (field) => quoteQualified(field || "geometry");
const formatLiteral = (value) => `'${escapeSql(value)}'`;

const boundaryDefaults = {
  la: { file: "boundaries_la.parquet", codeField: "code", alias: "la_boundary" },
  rpt: { file: "boundaries_rpt.parquet", codeField: "rpt_code", alias: "rpt_boundary" }
};

const getBoundaryConfig = (type) => {
  const config = state.config || {};
  const upper = type === "la" ? "La" : "Rpt";
  const pathKey = `boundaries${upper}Parquet`;
  const codeKey = `boundaries${upper}CodeField`;
  const file = config[pathKey] || boundaryDefaults[type].file;
  const codeField = config[codeKey] || boundaryDefaults[type].codeField;
  return {
    file,
    codeField,
    alias: boundaryDefaults[type].alias
  };
};

const buildBoundaryClause = (type, value) => {
  const ready = state.boundaryParquetReady?.[type];
  if (!value || !ready || !state.spatialReady || !state.geometryField) {
    return "";
  }
  const boundary = getBoundaryConfig(type);
  if (!boundary.file || !boundary.codeField) {
    return "";
  }
  const alias = boundary.alias;
  const codeExpr = quoteQualified(`${alias}.${boundary.codeField}`);
  const geomExpr = quoteQualified(`${alias}.geom`);
  const geomField = quoteField(state.geometryField);
  const fileLiteral = formatLiteral(boundary.file);
  const valueLiteral = formatLiteral(value);
  return `EXISTS (
    SELECT 1
    FROM read_parquet(${fileLiteral}) AS ${alias}
    WHERE ${codeExpr} = ${valueLiteral}
      AND ST_Intersects(${geomField}, ${geomExpr})
  )`;
};

/**
 * Gets service search value from input
 * @param {HTMLInputElement} searchInput - Search input element
 * @returns {string} Trimmed search value
 */
export const getServiceSearchValue = (searchInput) => {
  if (!searchInput) return "";
  return String(searchInput.value || "").trim();
};

/**
 * Gets selected operators with field information
 * @param {HTMLSelectElement} operatorFilter - Operator filter element
 * @returns {Array<{value: string, field: string}>} Selected operators
 */
export const getSelectedOperators = (operatorFilter) => {
  if (!operatorFilter) return [];
  return Array.from(operatorFilter.selectedOptions).map((opt) => ({
    value: opt.value,
    field: opt.dataset.field || "operatorCode"
  }));
};

/**
 * Gets selected time bands
 * @param {HTMLSelectElement} timeBandFilter - Time band filter element
 * @returns {string[]} Selected time band keys
 */
export const getSelectedTimeBands = (timeBandFilter) => {
  if (!timeBandFilter) return [];
  return Array.from(timeBandFilter.selectedOptions)
    .map((opt) => opt.value)
    .filter(Boolean);
};

/**
 * Checks if any attribute filters are active
 * @param {object} filters - Filter values object
 * @returns {boolean} True if any filters are active
 */
export const hasAttributeFilters = (filters) => {
  const {
    modes = [],
    operators = [],
    timeBands = [],
    serviceSearch = "",
    laValue = "",
    rptValue = "",
    serviceIds = [],
    serviceIdsActive = false
  } = filters;
  return (
    modes.length > 0 ||
    operators.length > 0 ||
    timeBands.length > 0 ||
    Boolean(serviceSearch) ||
    Boolean(laValue) ||
    Boolean(rptValue) ||
    (serviceIdsActive && Array.isArray(serviceIds))
  );
};

/**
 * Builds SQL WHERE clause from active filters
 * @param {object} filters - Filter values
 * @param {string[]} filters.modes - Selected modes
 * @param {Array<{value: string, field: string}>} filters.operators - Selected operators
 * @param {string[]} filters.timeBands - Selected time bands
 * @param {string} filters.serviceSearch - Service search query
 * @param {string} filters.laValue - Selected LA code
 * @param {string} filters.rptValue - Selected RPT code
 * @returns {string} SQL WHERE clause (with WHERE keyword) or empty string
 */
export const buildWhere = (filters) => {
  const clauses = [];
  const {
    modes = [],
    operators = [],
    timeBands = [],
    serviceSearch = "",
    laValue = "",
    rptValue = "",
    serviceIds = [],
    serviceIdsActive = false
  } = filters;

  // Mode filter
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

  // Operator filter
  if (operators.length) {
    const hasNone = operators.some((op) => op.value === NONE_OPTION_VALUE);
    const validOps = operators.filter((op) => op.value && op.value !== NONE_OPTION_VALUE);

    if (validOps.length || hasNone) {
      const opClauses = [];

      if (validOps.length) {
        const byField = new Map();
        validOps.forEach((op) => {
          if (!byField.has(op.field)) {
            byField.set(op.field, []);
          }
          byField.get(op.field).push(op.value);
        });

        byField.forEach((values, field) => {
          const fieldQuoted = quoteIdentifier(field);
          const list = values.map((v) => `'${escapeSql(v)}'`).join(", ");
          opClauses.push(`${fieldQuoted} IN (${list})`);
        });
      }

      if (hasNone && state.operatorFields.length) {
        const firstField = quoteIdentifier(state.operatorFields[0]);
        opClauses.push(`(${firstField} IS NULL OR ${firstField} = '')`);
      }

      if (opClauses.length) {
        clauses.push(opClauses.length > 1 ? `(${opClauses.join(" OR ")})` : opClauses[0]);
      }
    }
  }

  // Time band filter
  if (timeBands.length) {
    const bandClauses = [];
    timeBands.forEach((band) => {
      const field = state.timeBandFields[band];
      if (field) {
        const fieldQuoted = quoteIdentifier(field);
        bandClauses.push(`${fieldQuoted} = TRUE`);
      }
    });
    if (bandClauses.length) {
      clauses.push(`(${bandClauses.join(" OR ")})`);
    }
  }

  // Service search filter
  if (serviceSearch) {
    const tokens = serviceSearch
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[^\w\-]/g, ""))
      .filter(Boolean)
      .slice(0, 6);

    if (tokens.length) {
      const likeClauses = tokens.map((token) => {
        const q = escapeSql(token.toLowerCase());
        const like = `'%${q}%'`;
        const parts = [];

        if (state.columns.includes("serviceName")) {
          parts.push(`LOWER(CAST(${quoteIdentifier("serviceName")} AS VARCHAR)) LIKE ${like}`);
        }
        if (state.columns.includes("serviceId")) {
          parts.push(`LOWER(CAST(${quoteIdentifier("serviceId")} AS VARCHAR)) LIKE ${like}`);
        }
        if (state.columns.includes("operatorName")) {
          parts.push(`LOWER(CAST(${quoteIdentifier("operatorName")} AS VARCHAR)) LIKE ${like}`);
        }

        return parts.length ? `(${parts.join(" OR ")})` : "TRUE";
      });

      if (likeClauses.length) {
        clauses.push(`(${likeClauses.join(" AND ")})`);
      }
    }
  }

  // LA filter - prefer spatial boundary when available
  if (laValue && laValue !== NONE_OPTION_VALUE) {
    const spatialClause = buildBoundaryClause("la", laValue);
    if (spatialClause) {
      clauses.push(spatialClause);
    } else {
      const laClauses = [];

      if (state.laField) {
        laClauses.push(`${quoteField(state.laField)} = ${formatLiteral(laValue)}`);
      }

      if (state.laCodesField) {
        const pattern = `%|${escapeSql(laValue)}|%`;
        laClauses.push(`${quoteField(state.laCodesField)} LIKE ${formatLiteral(pattern)}`);
      }

      if (laClauses.length) {
        clauses.push(`(${laClauses.join(" OR ")})`);
      }
    }
  }

  // RPT filter - prefer spatial boundary when available
  if (rptValue && rptValue !== NONE_OPTION_VALUE) {
    const spatialClause = buildBoundaryClause("rpt", rptValue);
    if (spatialClause) {
      clauses.push(spatialClause);
    } else {
      const rptClauses = [];

      if (state.rptField) {
        rptClauses.push(`${quoteField(state.rptField)} = ${formatLiteral(rptValue)}`);
      }

      if (state.rptCodesField) {
        const pattern = `%|${escapeSql(rptValue)}|%`;
        rptClauses.push(`${quoteField(state.rptCodesField)} LIKE ${formatLiteral(pattern)}`);
      }

      if (rptClauses.length) {
        clauses.push(`(${rptClauses.join(" OR ")})`);
      }
    }
  }

  // Service ID filter (from spatial logic)
  if (serviceIdsActive) {
    const field = state.serviceIdField || (state.columns.includes("serviceId") ? "serviceId" : "");
    if (!serviceIds.length) {
      clauses.push("FALSE");
    } else if (field) {
      const list = serviceIds.map((value) => `'${escapeSql(value)}'`).join(", ");
      clauses.push(`${quoteIdentifier(field)} IN (${list})`);
    }
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
};

/**
 * Builds viewport bbox filter clause
 * @param {object} map - MapLibre map instance
 * @returns {string} SQL WHERE clause for viewport or empty string
 */
export const buildBboxFilter = (map) => {
  if (!map) {
    return "";
  }

  const bounds = map.getBounds();
  if (!bounds) {
    return "";
  }

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const minLon = sw.lng;
  const minLat = sw.lat;
  const maxLon = ne.lng;
  const maxLat = ne.lat;

  if (state.spatialReady && state.geometryField) {
    const geomField = quoteField(state.geometryField);
    const envelope = `ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat})`;
    return `ST_Intersects(${geomField}, ${envelope})`;
  }

  if (!state.bboxReady || !state.bboxFields) {
    return "";
  }

  const { minx, miny, maxx, maxy } = state.bboxFields;
  if (!minx || !miny || !maxx || !maxy) {
    return "";
  }

  return `(
    ${quoteIdentifier(maxx)} >= ${minLon} AND
    ${quoteIdentifier(minx)} <= ${maxLon} AND
    ${quoteIdentifier(maxy)} >= ${minLat} AND
    ${quoteIdentifier(miny)} <= ${maxLat}
  )`;
};

/**
 * Combines attribute and bbox filters
 * @param {object} filters - Attribute filters
 * @param {object} map - MapLibre map instance
 * @param {boolean} useBbox - Whether to include bbox filter
 * @returns {string} Combined WHERE clause
 */
export const buildCombinedWhere = (filters, map, useBbox = false) => {
  const attributeWhere = buildWhere(filters);
  const bboxClause = useBbox ? buildBboxFilter(map) : "";

  if (!attributeWhere && !bboxClause) {
    return "";
  }

  if (attributeWhere && bboxClause) {
    // Both present - combine with AND
    const attrConditions = attributeWhere.replace(/^WHERE\s+/i, "");
    return `WHERE (${attrConditions}) AND ${bboxClause}`;
  }

  if (bboxClause) {
    return `WHERE ${bboxClause}`;
  }

  return attributeWhere;
};
