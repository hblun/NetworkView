/**
 * DOM manipulation utilities
 */

/**
 * Clears all child nodes from an element
 * @param {HTMLElement} element - Element to clear
 */
export const clearElement = (element) => {
  if (element) {
    element.innerHTML = "";
  }
};

/**
 * Escapes HTML special characters
 * @param {*} value - Value to escape
 * @returns {string} HTML-safe string
 */
export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * Gets a property from an object with case-insensitive fallback
 * @param {object} obj - Object to search
 * @param {string} key - Property key
 * @returns {*} Property value or undefined
 */
export const getProp = (obj, key) => {
  if (!obj || !key) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }
  const lower = String(key).toLowerCase();
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (String(k).toLowerCase() === lower) {
      return obj[k];
    }
  }
  return undefined;
};

/**
 * Gets selected values from a multi-select element
 * @param {HTMLSelectElement} select - Select element
 * @returns {string[]} Array of selected values
 */
export const getSelectedValues = (select) => {
  if (!select) return [];
  return Array.from(select.selectedOptions).map((opt) => opt.value);
};

/**
 * Gets single selected value from a select element
 * @param {HTMLSelectElement} select - Select element
 * @returns {string} Selected value or empty string
 */
export const getSelectedValue = (select) => (select ? select.value : "");

/**
 * Formats a number with thousands separators
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
export const formatCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0";
  }
  return num.toLocaleString("en-US");
};

/**
 * Converts value to number with fallback
 * @param {*} value - Value to convert
 * @param {number} fallback - Fallback value if conversion fails
 * @returns {number} Converted number or fallback
 */
export const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
