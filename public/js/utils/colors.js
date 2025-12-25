/**
 * Color utility functions
 */

/**
 * Converts HSL color values to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {number[]} RGB values [r, g, b] (0-255)
 */
export const hslToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp >= 1 && hp < 2) {
    r = x;
    g = c;
  } else if (hp >= 2 && hp < 3) {
    g = c;
    b = x;
  } else if (hp >= 3 && hp < 4) {
    g = x;
    b = c;
  } else if (hp >= 4 && hp < 5) {
    r = x;
    b = c;
  } else if (hp >= 5 && hp < 6) {
    r = c;
    b = x;
  }

  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
};

/**
 * Converts RGBA array to hex color string
 * @param {number[]} rgba - Array of [r, g, b, a] values (0-255)
 * @returns {string} Hex color string like "#ff0000"
 */
export const rgbaToHex = (rgba) => {
  const [r, g, b] = rgba || [0, 0, 0];
  const toHex = (n) => {
    const v = Math.max(0, Math.min(255, Number(n) || 0));
    return v.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Generates a simple hash from a string
 * @param {string} value - String to hash
 * @returns {number} Hash value
 */
export const hashString = (value) => {
  let hash = 0;
  const str = String(value);
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Generates a deterministic color from a string value
 * @param {string} value - String to generate color from
 * @returns {number[]} RGBA array [r, g, b, a]
 */
export const generateColor = (value, saturation = 0.6, lightness = 0.45, alpha = 185) => {
  if (!value) {
    return [22, 85, 112, 180];
  }
  const hue = hashString(value) % 360;
  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  return [r, g, b, alpha];
};
