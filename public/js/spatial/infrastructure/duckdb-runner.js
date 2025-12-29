/**
 * DuckDB query execution for spatial queries
 *
 * Infrastructure layer - handles database interaction and post-filtering.
 * Accepts database connection and context via parameters.
 */

/**
 * Create a DuckDB runner instance
 * @param {object} db - DuckDB database instance
 * @returns {object} Runner instance with execute method
 */
export const createDuckDBRunner = (db) => {
  /**
   * Haversine distance between two points
   * @param {number} lat1, lng1 - First point
   * @param {number} lat2, lng2 - Second point
   * @returns {number} Distance in meters
   */
  const haversineDistance = (lat1, lng1, lat2, lng2) => {
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
  };

  /**
   * Calculate distance from point to line segment
   * @param {number} px, py - Point coordinates (lat, lng)
   * @param {number} x1, y1 - Segment start (lat, lng)
   * @param {number} x2, y2 - Segment end (lat, lng)
   * @returns {number} Distance in meters
   */
  const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
    // Vector from segment start to point
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
      // Segment is a point
      return haversineDistance(px, py, x1, y1);
    }

    // Project point onto line (parameterized 0-1)
    const t = Math.max(0, Math.min(1,
      ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    ));

    // Closest point on segment
    const closestLat = x1 + t * dx;
    const closestLng = y1 + t * dy;

    return haversineDistance(px, py, closestLat, closestLng);
  };

  /**
   * Check if a LineString is within distance of a point
   * @param {Array} coords - [[lng, lat], ...]
   * @param {object} point - {lat, lng}
   * @param {number} distanceMeters - Distance in meters
   * @returns {boolean}
   */
  const lineStringIntersectsPoint = (coords, point, distanceMeters) => {
    // Check each line segment
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];

      const dist = pointToSegmentDistance(
        point.lat, point.lng,
        lat1, lng1,
        lat2, lng2
      );

      if (dist <= distanceMeters) {
        return true;
      }
    }
    return false;
  };

  /**
   * Check if a geometry intersects a buffered point
   * @param {object} geometry - GeoJSON geometry
   * @param {object} point - {lat, lng}
   * @param {number} distanceMeters - Buffer distance in meters
   * @returns {boolean}
   */
  const geometryIntersectsBuffer = (geometry, point, distanceMeters) => {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return false;
    }

    // For LineString, check if any segment is within distance
    if (geometry.type === "LineString") {
      return lineStringIntersectsPoint(geometry.coordinates, point, distanceMeters);
    }

    // For MultiLineString, check each line
    if (geometry.type === "MultiLineString") {
      return geometry.coordinates.some((line) =>
        lineStringIntersectsPoint(line, point, distanceMeters)
      );
    }

    // For Point, just check distance
    if (geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates;
      return haversineDistance(point.lat, point.lng, lat, lng) <= distanceMeters;
    }

    return false;
  };

  /**
   * Post-filters routes by actual distance when bbox mode gives false positives
   * @param {Array} rows - Query result rows with geojson_data
   * @param {object} point - {lat, lng}
   * @param {number} distanceMeters - Max distance in meters
   * @param {string} idAlias - Service ID column alias
   * @param {string} geojsonField - GeoJSON field name
   * @returns {string[]} Filtered service IDs
   */
  const postFilterByDistance = (rows, point, distanceMeters, idAlias, geojsonField) => {
    const filtered = [];

    for (const row of rows) {
      const geojsonStr = row[geojsonField] || row[geojsonField.toUpperCase()];
      if (!geojsonStr) continue;

      try {
        const geojson = typeof geojsonStr === "string" ? JSON.parse(geojsonStr) : geojsonStr;
        const geometry = geojson.type === "Feature" ? geojson.geometry : geojson;

        if (geometryIntersectsBuffer(geometry, point, distanceMeters)) {
          const id = row[idAlias] || row[idAlias.toUpperCase()];
          if (id) filtered.push(String(id));
        }
      } catch (err) {
        // Skip routes with invalid geojson
        continue;
      }
    }

    return filtered;
  };

  return {
    /**
     * Execute a SQL query and return matching service IDs
     * @param {string} sql - SQL query to execute
     * @param {object} options - Execution options
     * @param {string} options.serviceIdField - Service ID field name
     * @param {boolean} options.needsPostFilter - Whether to post-filter by distance
     * @param {object} options.point - Selected point (for post-filtering)
     * @param {number} options.distance - Distance in meters (for post-filtering)
     * @param {string} options.geojsonField - GeoJSON field name (for post-filtering)
     * @returns {Promise<object>} {serviceIds: string[], count: number}
     */
    async execute(sql, options = {}) {
      const serviceIdAlias = "spatial_service_id";
      let conn;

      try {
        conn = await db.connect();
        const result = await conn.query(sql);
        const rows = result.toArray();

        const aliasUpper = serviceIdAlias.toUpperCase();
        let serviceIds = rows
          .map((row) => row[serviceIdAlias] ?? row[aliasUpper])
          .filter((id) => id != null)
          .map((id) => String(id));

        // Post-filter using actual distance calculation for bbox mode
        if (options.needsPostFilter && options.point && options.distance) {
          const filtered = postFilterByDistance(
            rows,
            options.point,
            options.distance,
            serviceIdAlias,
            "geojson_data" // Always use this alias from SQL
          );
          serviceIds = filtered;
        }

        return {
          serviceIds,
          count: serviceIds.length
        };
      } finally {
        if (conn) {
          await conn.close();
        }
      }
    }
  };
};
