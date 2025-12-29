/**
 * Spatial query service - orchestration layer
 *
 * Coordinates core domain logic and infrastructure to execute spatial queries.
 * Handles validation, compilation, SQL generation, execution, caching, and cancellation.
 */

import { validateQuery } from "../core/validator.js";
import { compileQuery, hashQuery } from "../core/compiler.js";
import { buildSpatialWhere } from "../infrastructure/sql-builder.js";
import { createDuckDBRunner } from "../infrastructure/duckdb-runner.js";
import { quoteIdentifier } from "../../utils/sql.js";

/**
 * Create a spatial service instance
 * @param {object} db - DuckDB database instance
 * @returns {object} Service instance with executeQuery, cancel, clearCache methods
 */
export const createSpatialService = (db) => {
  // Query cache: hash -> compiled query
  const compiledCache = new Map();

  // Cancellation support
  let currentController = null;

  /**
   * Get cached compiled query or compile new one
   * @param {object} query - Query to compile
   * @param {object} context - Compilation context
   * @returns {object} Compiled query
   */
  const getCachedCompiled = (query, context) => {
    const cacheKey = JSON.stringify({
      query: hashQuery(query),
      spatialReady: context.spatialReady,
      hasPoint: !!context.point,
      hasBoundary: !!context.boundary
    });

    if (compiledCache.has(cacheKey)) {
      return compiledCache.get(cacheKey);
    }

    const compiled = compileQuery(query, context);
    compiledCache.set(cacheKey, compiled);

    // Limit cache size (simple LRU: drop oldest)
    if (compiledCache.size > 50) {
      const firstKey = compiledCache.keys().next().value;
      compiledCache.delete(firstKey);
    }

    return compiled;
  };

  /**
   * Select table name based on context
   * @param {object} context - Query context
   * @returns {string} Table name or file path
   */
  const getTableName = (context) => {
    // If bbox was generated from geometry (bbox_minx, etc.), use view
    if (context.bboxReady && context.bboxFields?.minx === "bbox_minx") {
      return "routes_with_bbox";
    }

    // Otherwise use parquet file directly
    return "read_parquet('routes.parquet')";
  };

  return {
    /**
     * Execute a spatial query
     * @param {object} query - Spatial query to execute
     * @param {object} context - Query context
     * @param {object} context.point - Selected point {lat, lng}
     * @param {object} context.boundary - Boundary geometry
     * @param {boolean} context.spatialReady - Spatial extension available
     * @param {string} context.geometryField - Geometry field name
     * @param {boolean} context.bboxReady - Bbox fields available
     * @param {object} context.bboxFields - Bbox field names
     * @param {string[]} context.operatorFields - Operator field names
     * @param {string} context.modeField - Mode field name
     * @param {string} context.serviceIdField - Service ID field name (REQUIRED)
     * @param {string} context.geojsonField - GeoJSON field name (for post-filtering)
     * @returns {Promise<object>} {success: boolean, serviceIds?: string[], count?: number, errors?: string[], error?: string}
     */
    async executeQuery(query, context = {}) {
      try {
        // Validate required context fields
        if (!context.serviceIdField) {
          return {
            success: false,
            error: "Context must include serviceIdField"
          };
        }

        // 1. Validate query
        const errors = validateQuery(query, context);
        if (errors.length > 0) {
          return {
            success: false,
            errors
          };
        }

        // 2. Compile query (with caching)
        const compiled = getCachedCompiled(query, context);

        // 3. Build SQL WHERE clause
        const whereClause = buildSpatialWhere(compiled, context.point, context);

        // 4. Build complete SQL query
        const tableName = getTableName(context);
        const serviceIdAlias = "spatial_service_id";

        // Determine if we need post-filtering
        const usingSpatialMode = context.spatialReady && context.geometryField;
        const needsPostFilter = !usingSpatialMode && context.bboxReady && context.geojsonField;

        let selectClause = `${quoteIdentifier(context.serviceIdField)} AS ${serviceIdAlias}`;
        if (needsPostFilter && context.point) {
          // Include geojson for post-filtering
          selectClause += `, ${quoteIdentifier(context.geojsonField)} AS geojson_data`;
        }

        const sql = `
          SELECT DISTINCT ${selectClause}
          FROM ${tableName}
          WHERE ${whereClause}
        `;

        // 5. Execute query with cancellation support
        // Create new abort controller for this query
        currentController = new AbortController();
        const signal = currentController.signal;

        // Check if already cancelled
        if (signal.aborted) {
          return {
            success: false,
            error: "Query was cancelled before execution"
          };
        }

        // Create runner and execute
        const runner = createDuckDBRunner(db);

        // Execute with post-filter options if needed
        const result = await runner.execute(sql, {
          serviceIdField: context.serviceIdField,
          needsPostFilter,
          point: context.point,
          distance: compiled.blocks[0]?.distance,
          geojsonField: context.geojsonField
        });

        // Check if cancelled after execution
        if (signal.aborted) {
          return {
            success: false,
            error: "Query was cancelled during execution"
          };
        }

        return {
          success: true,
          serviceIds: result.serviceIds,
          count: result.count
        };

      } catch (err) {
        // Check if it was a cancellation
        if (err.name === "AbortError" || (currentController && currentController.signal.aborted)) {
          return {
            success: false,
            error: "Query was cancelled"
          };
        }

        return {
          success: false,
          error: err.message || String(err)
        };
      }
    },

    /**
     * Cancel the currently running query
     */
    cancel() {
      if (currentController) {
        currentController.abort();
      }
    },

    /**
     * Clear the compiled query cache
     */
    clearCache() {
      compiledCache.clear();
    }
  };
};
