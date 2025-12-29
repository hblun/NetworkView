/**
 * Spatial query compilation
 *
 * Pure function that transforms a query into a versioned, executable format.
 * Compiled queries are stable contracts that can be:
 * - Serialized for debugging
 * - Replayed for testing
 * - Cached for performance
 */

import { assertValid } from "./validator.js";

/**
 * Compile a spatial query into executable format
 * @param {SpatialQuery} query - Query to compile
 * @param {object} context - Compilation context
 * @param {object} context.point - Selected point {lat, lng}
 * @param {object} context.boundary - Boundary geometry
 * @param {boolean} context.spatialReady - Spatial extension available
 * @param {boolean} context.bboxReady - Bbox fields available
 * @returns {object} Compiled query (versioned, stable contract)
 */
export const compileQuery = (query, context = {}) => {
  // Validate first (throws if invalid)
  assertValid(query, context);

  // Map condition to SQL relation
  const relation = query.condition === "within" ? "within" : "intersects";

  // Build main spatial block
  const mainBlock = {
    target: query.target,
    distance: query.distance,
    relation
  };

  // Compile additional blocks
  const additionalBlocks = (query.blocks || []).map(block => ({
    type: block.type || "include",
    operator: block.operator,
    value: block.value,
    distance: block.distance
  }));

  // Compiled output with stable version
  return {
    // Version for stable contract (semver)
    version: "1.0.0",

    // What to find
    find: query.find,

    // Execution blocks (main + additional)
    blocks: [mainBlock, ...additionalBlocks],

    // Boundary geometry if present
    boundary: context.boundary || null,

    // Compilation metadata
    metadata: {
      compiled_at: new Date().toISOString(),
      context: {
        has_point: !!context.point,
        has_boundary: !!context.boundary,
        spatial_ready: !!context.spatialReady
      }
    },

    // Query hash for caching and comparison
    hash: hashQuery(query)
  };
};

/**
 * Generate hash for query (for caching)
 * @param {SpatialQuery} query - Query to hash
 * @returns {string} Hash string
 */
export const hashQuery = (query) => {
  // Simple hash based on JSON stringification
  // In production, might use a proper hash function
  const data = JSON.stringify({
    find: query.find,
    condition: query.condition,
    distance: query.distance,
    target: query.target,
    blocks: query.blocks || []
  });

  // Simple string hash (FNV-1a variant)
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16);
};
