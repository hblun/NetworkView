/**
 * Geometry and spatial utilities
 */

/**
 * Extracts coordinates from any geometry type
 * @param {object} geometry - GeoJSON geometry object
 * @returns {Array<[number, number]>} Array of [lon, lat] coordinate pairs
 */
export const getGeometryCoordinates = (geometry) => {
  if (!geometry) {
    return [];
  }
  const type = geometry.type;
  if (type === "LineString") {
    return geometry.coordinates || [];
  }
  if (type === "MultiLineString") {
    return (geometry.coordinates || []).flat();
  }
  if (type === "Point") {
    return [geometry.coordinates];
  }
  if (type === "MultiPoint") {
    return geometry.coordinates || [];
  }
  if (type === "Polygon") {
    return (geometry.coordinates || []).flat();
  }
  if (type === "MultiPolygon") {
    return (geometry.coordinates || []).flat(2);
  }
  return [];
};

/**
 * Calculates bounding box for an array of GeoJSON features
 * @param {Array<object>} features - Array of GeoJSON features
 * @returns {Array<number>|null} Bounding box [minLon, minLat, maxLon, maxLat] or null
 */
export const getFeaturesBbox = (features) => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  (features || []).forEach((feature) => {
    const coords = getGeometryCoordinates(feature?.geometry);
    coords.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) {
        return;
      }
      const lon = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return;
      }
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
  });

  if (![minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (minLon === maxLon && minLat === maxLat) {
    // Avoid zero-area bounds - add small padding
    const pad = 0.01;
    return [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad];
  }
  return [minLon, minLat, maxLon, maxLat];
};

/**
 * Checks if a bounding box is valid
 * @param {Array<number>} bbox - Bounding box [minLon, minLat, maxLon, maxLat]
 * @returns {boolean} True if valid
 */
export const isValidBbox = (bbox) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return false;
  }
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
  return [minLon, minLat, maxLon, maxLat].every((n) => Number.isFinite(n));
};
