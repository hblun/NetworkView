import { describe, it, expect, beforeEach } from "vitest";
import {
  clearElement,
  escapeHtml,
  getProp,
  formatCount,
  toNumber
} from "../public/js/utils/dom.js";

describe("DOM Utilities", () => {
  describe("clearElement", () => {
    it("should clear element innerHTML", () => {
      const el = document.createElement("div");
      el.innerHTML = "<span>test</span>";
      clearElement(el);
      expect(el.innerHTML).toBe("");
    });

    it("should handle null gracefully", () => {
      expect(() => clearElement(null)).not.toThrow();
    });
  });

  describe("escapeHtml", () => {
    it("should escape ampersands", () => {
      expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    });

    it("should escape less than", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    });

    it("should escape quotes", () => {
      expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
      expect(escapeHtml("'hello'")).toBe("&#039;hello&#039;");
    });

    it("should escape multiple characters", () => {
      expect(escapeHtml('<a href="test">Link & "text"</a>'))
        .toBe("&lt;a href=&quot;test&quot;&gt;Link &amp; &quot;text&quot;&lt;/a&gt;");
    });

    it("should handle null and undefined", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    it("should convert numbers to strings", () => {
      expect(escapeHtml(123)).toBe("123");
    });
  });

  describe("getProp", () => {
    const obj = {
      name: "test",
      Mode: "BUS",
      operatorCode: "OP1"
    };

    it("should get exact property", () => {
      expect(getProp(obj, "name")).toBe("test");
    });

    it("should get property case-insensitively", () => {
      expect(getProp(obj, "mode")).toBe("BUS");
      expect(getProp(obj, "MODE")).toBe("BUS");
      expect(getProp(obj, "Mode")).toBe("BUS");
    });

    it("should return undefined for missing property", () => {
      expect(getProp(obj, "missing")).toBeUndefined();
    });

    it("should handle null object", () => {
      expect(getProp(null, "key")).toBeUndefined();
    });

    it("should handle empty key", () => {
      expect(getProp(obj, "")).toBeUndefined();
    });
  });

  describe("formatCount", () => {
    it("should format thousands with commas", () => {
      expect(formatCount(1000)).toBe("1,000");
      expect(formatCount(1000000)).toBe("1,000,000");
    });

    it("should handle small numbers", () => {
      expect(formatCount(42)).toBe("42");
      expect(formatCount(0)).toBe("0");
    });

    it("should handle decimals", () => {
      expect(formatCount(1234.56)).toBe("1,234.56");
    });

    it("should handle non-numbers gracefully", () => {
      expect(formatCount("not a number")).toBe("0");
      expect(formatCount(null)).toBe("0");
      expect(formatCount(undefined)).toBe("0");
    });
  });

  describe("toNumber", () => {
    it("should convert strings to numbers", () => {
      expect(toNumber("123")).toBe(123);
      expect(toNumber("45.67")).toBe(45.67);
    });

    it("should pass through numbers", () => {
      expect(toNumber(42)).toBe(42);
    });

    it("should use fallback for invalid input", () => {
      expect(toNumber("not a number", 0)).toBe(0);
      // Note: Number(null) === 0 which is finite, so fallback is not used
      expect(toNumber(null, 10)).toBe(0); // null converts to 0
      expect(toNumber(undefined, -1)).toBe(-1); // undefined converts to NaN, so fallback is used
    });

    it("should default fallback to 0", () => {
      expect(toNumber("invalid")).toBe(0);
    });

    it("should handle Infinity", () => {
      expect(toNumber(Infinity, 0)).toBe(0);
      expect(toNumber(-Infinity, 0)).toBe(0);
    });
  });
});
