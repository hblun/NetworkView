/**
 * Spatial query runner with DuckDB execution
 */

import { buildSpatialWhere } from "./sql.js";
import { state } from "../state/manager.js";
import { quoteIdentifier } from "../utils/sql.js";

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
     * Extracts distance value from compiled blocks
     * @param {object} compiled - Compiled builder state
     * @returns {number|null} Distance in meters
     */
    _getDistanceFromCompiled(compiled) {
      if (!compiled?.blocks) return null;

      // Find the main spatial block (first block with distance)
      const mainBlock = compiled.blocks.find(
        (block) => block.distance && (block.target === "selected_point" || block.operator === "near_point")
      );

      return mainBlock?.distance || null;
    },

    /**
     * Post-filters routes by actual distance when bbox mode gives false positives
     * @param {Array} rows - Query result rows with geojson_data
     * @param {object} point - {lat, lng}
     * @param {number} distanceMeters - Max distance in meters
     * @param {string} idAlias - Service ID column alias
     * @returns {string[]} Filtered service IDs
     */
    _postFilterByDistance(rows, point, distanceMeters, idAlias) {
      const filtered = [];

      for (const row of rows) {
        const geojsonStr = row.geojson_data || row.GEOJSON_DATA;
        if (!geojsonStr) continue;

        try {
          const geojson = typeof geojsonStr === "string" ? JSON.parse(geojsonStr) : geojsonStr;
          const geometry = geojson.type === "Feature" ? geojson.geometry : geojson;

          if (this._geometryIntersectsBuffer(geometry, point, distanceMeters)) {
            const id = row[idAlias] || row[idAlias.toUpperCase()];
            if (id) filtered.push(String(id));
          }
        } catch (err) {
          // Skip routes with invalid geojson
          continue;
        }
      }

      return filtered;
    },

    /**
     * Check if a geometry intersects a buffered point
     * @param {object} geometry - GeoJSON geometry
     * @param {object} point - {lat, lng}
     * @param {number} distanceMeters - Buffer distance in meters
     * @returns {boolean}
     */
    _geometryIntersectsBuffer(geometry, point, distanceMeters) {
      if (!geometry || !geometry.type || !geometry.coordinates) {
        return false;
      }

      // For LineString, check if any segment is within distance
      if (geometry.type === "LineString") {
        return this._lineStringIntersectsPoint(geometry.coordinates, point, distanceMeters);
      }

      // For MultiLineString, check each line
      if (geometry.type === "MultiLineString") {
        return geometry.coordinates.some((line) =>
          this._lineStringIntersectsPoint(line, point, distanceMeters)
        );
      }

      // For Point, just check distance
      if (geometry.type === "Point") {
        const [lng, lat] = geometry.coordinates;
        return this._haversineDistance(point.lat, point.lng, lat, lng) <= distanceMeters;
      }

      return false;
    },

    /**
     * Check if a LineString is within distance of a point
     * @param {Array} coords - [[lng, lat], ...]
     * @param {object} point - {lat, lng}
     * @param {number} distanceMeters - Distance in meters
     * @returns {boolean}
     */
    _lineStringIntersectsPoint(coords, point, distanceMeters) {
      // Check each line segment
      for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[i + 1];

        const dist = this._pointToSegmentDistance(
          point.lat, point.lng,
          lat1, lng1,
          lat2, lng2
        );

        if (dist <= distanceMeters) {
          return true;
        }
      }
      return false;
    },

    /**
     * Calculate distance from point to line segment
     * @param {number} px, py - Point coordinates (lat, lng)
     * @param {number} x1, y1 - Segment start (lat, lng)
     * @param {number} x2, y2 - Segment end (lat, lng)
     * @returns {number} Distance in meters
     */
    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
      // Vector from segment start to point
      const dx = x2 - x1;
      const dy = y2 - y1;

      if (dx === 0 && dy === 0) {
        // Segment is a point
        return this._haversineDistance(px, py, x1, y1);
      }

      // Project point onto line (parameterized 0-1)
      const t = Math.max(0, Math.min(1,
        ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
      ));

      // Closest point on segment
      const closestLat = x1 + t * dx;
      const closestLng = y1 + t * dy;

      return this._haversineDistance(px, py, closestLat, closestLng);
    },

    /**
     * Haversine distance between two points
     * @param {number} lat1, lng1 - First point
     * @param {number} lat2, lng2 - Second point
     * @returns {number} Distance in meters
     */
    _haversineDistance(lat1, lng1, lat2, lng2) {
      const R = 6371000; // Earth radius in meters
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lng2 - lng1) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    },

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

        const serviceIdField = state.serviceIdField || state.tileFields?.serviceId || "serviceId";
        const serviceIdAlias = "spatial_service_id";

        // If spatial mode is unavailable and we're using bbox fallback,
        // we need to post-filter using actual distance calculations
        const usingSpatialMode = state.spatialReady && state.geometryField;
        const needsPostFilter = !usingSpatialMode && state.bboxReady && state.geojsonField;

        let selectClause = `${quoteIdentifier(serviceIdField)} AS ${serviceIdAlias}`;
        if (needsPostFilter && point) {
          // Include geojson for post-filtering
          selectClause += `, ${quoteIdentifier(state.geojsonField)} AS geojson_data`;
        }

        const sql = `
          SELECT DISTINCT ${selectClause}
          FROM ${tableName}
          WHERE ${whereClause}
        `;

        console.log("[Spatial Runner] Executing SQL:", sql);
        console.log("[Spatial Runner] Mode:", usingSpatialMode ? "spatial (accurate)" : "bbox (fallback)");
        console.log("[Spatial Runner] Post-filter enabled:", needsPostFilter);

        const conn = await duckdb.connect();
        const result = await conn.query(sql);
        const rows = result.toArray();
        await conn.close();

        console.log("[Spatial Runner] Query returned rows:", rows.length);

        const aliasUpper = serviceIdAlias.toUpperCase();
        let serviceIds = rows
          .map((row) => row[serviceIdAlias] ?? row[aliasUpper])
          .filter((id) => id != null)
          .map((id) => String(id));

        // Post-filter using actual distance calculation for bbox mode
        if (needsPostFilter && point) {
          const distanceMeters = this._getDistanceFromCompiled(compiled);
          if (distanceMeters && distanceMeters > 0) {
            console.log("[Spatial Runner] Post-filtering with distance:", distanceMeters, "meters");
            const filtered = this._postFilterByDistance(rows, point, distanceMeters, serviceIdAlias);
            serviceIds = filtered;
            console.log("[Spatial Runner] After post-filter:", serviceIds.length, "routes");
          }
        }

        console.log("[Spatial Runner] Final serviceIds:", serviceIds.length);

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
