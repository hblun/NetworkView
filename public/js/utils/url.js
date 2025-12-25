/**
 * URL manipulation utilities
 */

/**
 * Joins a base URL with a path
 * @param {string} base - Base URL
 * @param {string} path - Path to join
 * @returns {string} Joined URL
 */
export const joinUrl = (base, path) => {
  if (!base) {
    return path;
  }
  if (
    typeof path === "string" &&
    (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/"))
  ) {
    return path;
  }
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

/**
 * Converts a relative URL to absolute
 * @param {string} value - URL to convert
 * @returns {string} Absolute URL
 */
export const toAbsoluteUrl = (value) => {
  if (!value || typeof window === "undefined") {
    return value;
  }
  try {
    return new URL(value, window.location.href).toString();
  } catch (error) {
    return value;
  }
};

/**
 * Adds cache busting parameter to a URL
 * @param {string} url - URL to bust
 * @param {string} version - Version string
 * @returns {string} URL with cache buster
 */
export const addCacheBuster = (url, version) => {
  if (!url || !version || typeof window === "undefined") {
    return url;
  }
  try {
    const resolved = new URL(url, window.location.href);
    resolved.searchParams.set("v", version);
    return resolved.toString();
  } catch (error) {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}v=${encodeURIComponent(version)}`;
  }
};
