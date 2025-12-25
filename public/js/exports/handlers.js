/**
 * Export Handlers Module
 *
 * Handles CSV and GeoJSON exports from DuckDB queries.
 * Provides functions for building export queries, formatting data, and triggering downloads.
 */

import { state } from "../state/manager.js";
import { quoteIdentifier, escapeSql } from "../utils/sql.js";
import { buildWhere } from "../filters/builder.js";
import { EXPORT_LIMITS } from "../config/constants.js";

/**
 * Set of columns to exclude from CSV exports
 */
const EXCLUDED_CSV_COLUMNS = new Set(["geometry", "geom", "geojson"]);

/**
 * Get columns to include in the result
 * @param {Object} result - DuckDB query result
 * @returns {Array<string>} Column names
 */
const getResultColumns = (result) => {
  if (!result || !result.schema || !result.schema.fields) {
    return [];
  }
  return result.schema.fields.map((field) => field.name);
};

/**
 * Get columns to include in CSV export
 * @returns {Array<string>} Column names
 */
export const getCsvColumns = () => {
  return (state.columns || []).filter((col) => !EXCLUDED_CSV_COLUMNS.has(col));
};

/**
 * Query GeoJSON data with optional limit
 * @param {number} limit - Maximum number of features to export
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export const queryGeoJson = async (limit = 50000, filters = {}) => {
  const where = buildWhere(filters);

  if (state.geojsonField) {
    // Approach 1: geojson column exists
    const geojsonCol = quoteIdentifier(state.geojsonField);
    const query = `
      SELECT *
      FROM read_parquet('routes.parquet')
      ${where}
      LIMIT ${limit}
    `;
    const result = await state.conn.query(query);
    const rows = result.toArray();
    const columns = getResultColumns(result);

    const features = rows.map((row) => {
      let geometry = null;
      if (row[state.geojsonField]) {
        geometry = typeof row[state.geojsonField] === "string" ? JSON.parse(row[state.geojsonField]) : row[state.geojsonField];
      }
      const properties = {};
      columns.forEach((column) => {
        if (column === state.geojsonField) return;
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
  }

  // Approach 2: Use spatial extension to convert geometry to GeoJSON
  if (state.spatialReady && state.geometryField) {
    const geomCol = quoteIdentifier(state.geometryField);
    const query = `
      SELECT *, ST_AsGeoJSON(${geomCol}) AS geojson
      FROM read_parquet('routes.parquet')
      ${where}
      LIMIT ${limit}
    `;
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
  }

  throw new Error("GeoJSON preview unavailable (no geometry/geojson column).");
};

/**
 * Query CSV data with optional limit
 * @param {number} limit - Maximum number of rows to export
 * @returns {Promise<string>} CSV string
 */
export const queryCsv = async (limit = 50000, filters = {}) => {
  const where = buildWhere(filters);
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

/**
 * Download a file to the user's computer
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mime - MIME type
 */
export const downloadFile = (content, filename, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Confirm large export with the user
 * @param {number} count - Number of rows to export
 * @param {string} format - Export format ("csv" or "geojson")
 * @returns {Promise<boolean>} True if user confirms
 */
export const confirmLargeExport = async (count, format) => {
  const limit = EXPORT_LIMITS.WARN_THRESHOLD || 10000;
  if (count <= limit) {
    return true;
  }
  const msg = `Export will include ${count.toLocaleString()} rows. This may take time. Continue?`;
  return window.confirm(msg);
};

/**
 * Handle GeoJSON download
 * @param {Function} setStatus - Status update callback
 * @param {Function} toggleActionButtons - Function to enable/disable action buttons
 * @param {Function} validateFilters - Function to validate current filters
 * @param {Function} queryCount - Function to get current selection count
 * @param {Function} logAction - Action logging callback
 * @param {Function} logEvent - Event logging callback
 */
export const onDownloadGeojson = async (setStatus, toggleActionButtons, validateFilters, queryCount, logAction, logEvent, getFilters) => {
  logAction("GeoJSON export requested.");
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
    const countNumber = typeof count === "number" ? count : parseInt(count, 10) || 0;
    const ok = await confirmLargeExport(countNumber, "geojson");
    if (!ok) {
      setStatus("Export cancelled.");
      return;
    }
    const limit = countNumber > 50000 ? 50000 : countNumber;
    if (countNumber > 50000) {
      setStatus("Large export capped at 50,000 rows. Narrow filters for full export.");
    }
    const filters = typeof getFilters === "function" ? getFilters() : getFilters || {};
    const geojson = await queryGeoJson(limit || 50000, filters);
    downloadFile(JSON.stringify(geojson), "routes-filtered.geojson", "application/json");
    setStatus("GeoJSON download ready.");
  } catch (error) {
    logEvent("error", "GeoJSON export failed.", { error: error.message });
    setStatus(`GeoJSON export failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};

/**
 * Handle CSV download
 * @param {Function} setStatus - Status update callback
 * @param {Function} toggleActionButtons - Function to enable/disable action buttons
 * @param {Function} validateFilters - Function to validate current filters
 * @param {Function} queryCount - Function to get current selection count
 * @param {Function} logAction - Action logging callback
 * @param {Function} logEvent - Event logging callback
 */
export const onDownloadCsv = async (setStatus, toggleActionButtons, validateFilters, queryCount, logAction, logEvent, getFilters) => {
  logAction("CSV export requested.");
  const validation = validateFilters();
  if (validation) {
    setStatus(validation);
    return;
  }
  toggleActionButtons(false);
  setStatus("Preparing CSV download...");
  try {
    const count = await queryCount();
    const countNumber = typeof count === "number" ? count : parseInt(count, 10) || 0;
    const ok = await confirmLargeExport(countNumber, "csv");
    if (!ok) {
      setStatus("Export cancelled.");
      return;
    }
    const limit = countNumber > 50000 ? 50000 : countNumber;
    if (countNumber > 50000) {
      setStatus("Large export capped at 50,000 rows. Narrow filters for full export.");
    }
    const filters = typeof getFilters === "function" ? getFilters() : getFilters || {};
    const csv = await queryCsv(limit || 50000, filters);
    downloadFile(csv, "routes-filtered.csv", "text/csv");
    setStatus("CSV download ready.");
  } catch (error) {
    logEvent("error", "CSV export failed.", { error: error.message });
    setStatus(`CSV export failed: ${error.message}`);
  } finally {
    toggleActionButtons(true);
  }
};
