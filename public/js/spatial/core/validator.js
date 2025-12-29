/**
 * Spatial query validation
 *
 * Pure validation logic with no dependencies on global state.
 * All validation accepts a context object with runtime information.
 */

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  constructor(errors) {
    super(`Validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Validate a spatial query
 * @param {object} query - Query to validate
 * @param {object} context - Validation context
 * @param {object} context.point - Selected point {lat, lng}
 * @param {object} context.boundary - Boundary geometry
 * @param {boolean} context.spatialReady - Spatial extension available
 * @param {boolean} context.bboxReady - Bbox fields available
 * @returns {string[]} Array of validation error messages (empty if valid)
 */
export const validateQuery = (query, context = {}) => {
  const errors = [];

  // Basic field validation
  if (!query.find) {
    errors.push("'find' is required");
  }
  if (!query.target) {
    errors.push("'target' is required");
  }
  if (typeof query.distance !== 'number' || query.distance < 0 || !Number.isFinite(query.distance)) {
    errors.push("'distance' must be a non-negative number");
  }

  // Target-specific validation
  if (query.target === "selected_point") {
    if (!context.point) {
      errors.push("Point is required when target is 'selected_point'");
    } else {
      const pointErrors = validatePoint(context.point, query.distance);
      errors.push(...pointErrors);
    }
  }

  if (query.target === "boundary") {
    if (!context.boundary) {
      errors.push("Boundary is required when target is 'boundary'");
    }
    if (!context.spatialReady) {
      errors.push("Boundary queries require spatial extension");
    }
  }

  // Context validation for point queries
  if (query.target === "selected_point" && context.point) {
    if (!context.spatialReady && !context.bboxReady) {
      errors.push("Neither spatial extension nor bbox fields available");
    }
  }

  // Block validation
  if (query.blocks && Array.isArray(query.blocks)) {
    query.blocks.forEach((block, index) => {
      const blockErrors = validateBlock(block, context, index);
      errors.push(...blockErrors);
    });
  }

  return errors;
};

/**
 * Validate point coordinates
 * @param {object} point - {lat, lng}
 * @param {number} distance - Distance for polar region check
 * @returns {string[]} Array of error messages
 */
const validatePoint = (point, distance) => {
  const errors = [];

  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    errors.push("Invalid point coordinates");
    return errors;
  }

  // Check for polar regions (cos(lat) near zero)
  const cosLat = Math.cos((point.lat * Math.PI) / 180);
  if (!Number.isFinite(cosLat) || Math.abs(cosLat) < 1e-6) {
    errors.push("Cannot compute longitude delta near the poles");
  }

  return errors;
};

/**
 * Validate a query block
 * @param {object} block - Block to validate
 * @param {object} context - Validation context
 * @param {number} index - Block index
 * @returns {string[]} Array of error messages
 */
const validateBlock = (block, context, index) => {
  const errors = [];
  const prefix = `Block ${index}:`;

  // Type validation
  const validTypes = ['include', 'exclude', 'also-include'];
  if (block.type && !validTypes.includes(block.type)) {
    errors.push(`${prefix} invalid type '${block.type}'`);
  }

  // Operator validation
  if (!block.operator) {
    errors.push(`${prefix} operator is required`);
  }

  // Value validation for operator/mode
  if ((block.operator === 'operator' || block.operator === 'mode') && !block.value) {
    errors.push(`${prefix} value is required for ${block.operator}`);
  }

  // Point validation for near_point
  if (block.operator === 'near_point' && !context.point) {
    errors.push(`${prefix} point required for near_point operator`);
  }

  return errors;
};

/**
 * Assert that a query is valid (throws if not)
 * @param {object} query - Query to validate
 * @param {object} context - Validation context
 * @throws {ValidationError} If query is invalid
 */
export const assertValid = (query, context = {}) => {
  const errors = validateQuery(query, context);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
};
