/**
 * SQL utility functions for query building and sanitization
 */

/**
 * Escapes single quotes in a string for safe SQL interpolation
 * @param {string|number} value - Value to escape
 * @returns {string} Escaped string safe for SQL
 */
export const escapeSql = (value) => String(value).replace(/'/g, "''");

/**
 * Quotes an identifier (table/column name) for SQL
 * @param {string} value - Identifier to quote
 * @returns {string} Quoted identifier
 */
export const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

/**
 * Builds a SQL IN clause from an array of values
 * @param {Array<string>} values - Array of values
 * @returns {string} SQL IN clause like "('val1', 'val2')"
 */
export const buildInClause = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return "('')";
  }
  const escaped = values.map(v => `'${escapeSql(v)}'`);
  return `(${escaped.join(", ")})`;
};

/**
 * Sanitizes a value for use in SQL LIKE patterns
 * Escapes special characters: % _ [ ]
 * @param {string} value - Value to sanitize
 * @returns {string} Sanitized value
 */
export const escapeLikePattern = (value) => {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
};
