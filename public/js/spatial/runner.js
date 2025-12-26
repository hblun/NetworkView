/**
 * Spatial query runner with DuckDB execution
 */

import { buildSpatialWhere } from "./sql.js";
import { state } from "../state/manager.js";

/**
 * Loads and returns the spatial logic runner instance
 * @param {object} config - Application configuration
 * @param {Function} setStatus - Status update callback
 * @returns {Promise<object>} Runner instance
 */
export const loadSpatialLogicRunner = async (config, setStatus) => {
  // Return runner instance with run method
  return {
    /**
     * Executes a spatial query and returns matching service IDs
     * @param {object} compiled - Compiled builder state
     * @param {object} point - Selected point {lat, lng}
     * @param {object} duckdb - DuckDB connection
     * @returns {Promise<object>} {serviceIds: string[], count: number}
     */
    async run(compiled, point, duckdb) {
      if (!compiled || !compiled.blocks || compiled.blocks.length === 0) {
        return { serviceIds: [], count: 0 };
      }

      if (!duckdb) {
        throw new Error("DuckDB connection not available");
      }

      try {
        const whereClause = buildSpatialWhere(compiled, point);

        // Use routes_with_bbox view if bbox was generated from geometry
        // This happens when spatial extension is available but no bbox columns exist
        const tableName = state.bboxReady && state.bboxFields?.minx === "bbox_minx"
          ? "routes_with_bbox"
          : "read_parquet('routes.parquet')";

        const sql = `
          SELECT DISTINCT serviceId
          FROM ${tableName}
          WHERE ${whereClause}
        `;

        console.log("[Spatial Runner] Executing SQL:", sql);

        const conn = await duckdb.connect();
        const result = await conn.query(sql);
        const rows = result.toArray();
        await conn.close();

        console.log("[Spatial Runner] Query returned rows:", rows.length);
        console.log("[Spatial Runner] First 5 rows:", rows.slice(0, 5));

        const serviceIds = rows
          .map((row) => row.serviceId || row.service_id)
          .filter((id) => id != null)
          .map((id) => String(id));

        console.log("[Spatial Runner] Extracted serviceIds:", serviceIds.length);

        return { serviceIds, count: serviceIds.length };
      } catch (err) {
        const message = err?.message || String(err);
        setStatus(`Spatial query error: ${message}`);
        console.error("[Spatial Runner] Query failed:", err);
        throw err;
      }
    }
  };
};
