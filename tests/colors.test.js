import { describe, it, expect } from "vitest";
import { hslToRgb, rgbaToHex, hashString, generateColor } from "../public/js/utils/colors.js";

describe("Color Utilities", () => {
  describe("hslToRgb", () => {
    it("should convert pure red (0°)", () => {
      const [r, g, b] = hslToRgb(0, 1, 0.5);
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it("should convert pure green (120°)", () => {
      const [r, g, b] = hslToRgb(120, 1, 0.5);
      expect(r).toBe(0);
      expect(g).toBe(255);
      expect(b).toBe(0);
    });

    it("should convert pure blue (240°)", () => {
      const [r, g, b] = hslToRgb(240, 1, 0.5);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(255);
    });

    it("should handle gray (zero saturation)", () => {
      const [r, g, b] = hslToRgb(180, 0, 0.5);
      expect(r).toBe(128);
      expect(g).toBe(128);
      expect(b).toBe(128);
    });

    it("should handle white", () => {
      const [r, g, b] = hslToRgb(0, 0, 1);
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it("should handle black", () => {
      const [r, g, b] = hslToRgb(0, 0, 0);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });
  });

  describe("rgbaToHex", () => {
    it("should convert red to hex", () => {
      expect(rgbaToHex([255, 0, 0, 255])).toBe("#ff0000");
    });

    it("should convert green to hex", () => {
      expect(rgbaToHex([0, 255, 0, 255])).toBe("#00ff00");
    });

    it("should convert blue to hex", () => {
      expect(rgbaToHex([0, 0, 255, 255])).toBe("#0000ff");
    });

    it("should handle white", () => {
      expect(rgbaToHex([255, 255, 255, 255])).toBe("#ffffff");
    });

    it("should handle black", () => {
      expect(rgbaToHex([0, 0, 0, 255])).toBe("#000000");
    });

    it("should pad single digit hex values", () => {
      expect(rgbaToHex([1, 2, 3, 255])).toBe("#010203");
    });

    it("should handle null/undefined gracefully", () => {
      expect(rgbaToHex(null)).toBe("#000000");
    });

    it("should clamp values outside 0-255", () => {
      expect(rgbaToHex([300, -10, 128, 255])).toBe("#ff0080");
    });
  });

  describe("hashString", () => {
    it("should generate consistent hash for same string", () => {
      const hash1 = hashString("test");
      const hash2 = hashString("test");
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different strings", () => {
      const hash1 = hashString("test1");
      const hash2 = hashString("test2");
      expect(hash1).not.toBe(hash2);
    });

    it("should return positive number", () => {
      const hash = hashString("anything");
      expect(hash).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty string", () => {
      const hash = hashString("");
      expect(typeof hash).toBe("number");
      expect(hash).toBe(0);
    });

    it("should handle numbers", () => {
      const hash = hashString(123);
      expect(typeof hash).toBe("number");
    });
  });

  describe("generateColor", () => {
    it("should generate RGBA array", () => {
      const color = generateColor("operator1");
      expect(Array.isArray(color)).toBe(true);
      expect(color).toHaveLength(4);
    });

    it("should generate consistent colors for same input", () => {
      const color1 = generateColor("operator1");
      const color2 = generateColor("operator1");
      expect(color1).toEqual(color2);
    });

    it("should generate different colors for different inputs", () => {
      const color1 = generateColor("operator1");
      const color2 = generateColor("operator2");
      expect(color1).not.toEqual(color2);
    });

    it("should have RGB values in valid range", () => {
      const [r, g, b, a] = generateColor("test");
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
      expect(a).toBe(185); // Default alpha
    });

    it("should use default color for empty/null value", () => {
      const color1 = generateColor("");
      const color2 = generateColor(null);
      expect(color1).toEqual([22, 85, 112, 180]);
      expect(color2).toEqual([22, 85, 112, 180]);
    });

    it("should allow custom saturation and lightness", () => {
      const color = generateColor("test", 0.8, 0.6, 200);
      expect(color[3]).toBe(200); // Custom alpha
    });
  });
});
