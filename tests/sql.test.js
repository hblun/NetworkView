import { describe, it, expect } from "vitest";
import { escapeSql, quoteIdentifier, buildInClause, escapeLikePattern } from "../public/js/utils/sql.js";

describe("SQL Utilities", () => {
  describe("escapeSql", () => {
    it("should escape single quotes", () => {
      expect(escapeSql("O'Brien")).toBe("O''Brien");
    });

    it("should handle multiple single quotes", () => {
      expect(escapeSql("it's Bob's car")).toBe("it''s Bob''s car");
    });

    it("should handle strings without quotes", () => {
      expect(escapeSql("simple string")).toBe("simple string");
    });

    it("should convert numbers to strings", () => {
      expect(escapeSql(123)).toBe("123");
    });

    it("should handle empty strings", () => {
      expect(escapeSql("")).toBe("");
    });
  });

  describe("quoteIdentifier", () => {
    it("should wrap identifier in double quotes", () => {
      expect(quoteIdentifier("table_name")).toBe('"table_name"');
    });

    it("should escape double quotes in identifier", () => {
      expect(quoteIdentifier('weird"column')).toBe('"weird""column"');
    });

    it("should handle simple identifiers", () => {
      expect(quoteIdentifier("id")).toBe('"id"');
    });
  });

  describe("buildInClause", () => {
    it("should build IN clause from array", () => {
      const result = buildInClause(["BUS", "COACH", "FERRY"]);
      expect(result).toBe("('BUS', 'COACH', 'FERRY')");
    });

    it("should escape quotes in values", () => {
      const result = buildInClause(["O'Brien", "Smith"]);
      expect(result).toBe("('O''Brien', 'Smith')");
    });

    it("should handle single value", () => {
      const result = buildInClause(["BUS"]);
      expect(result).toBe("('BUS')");
    });

    it("should handle empty array", () => {
      const result = buildInClause([]);
      expect(result).toBe("('')");
    });

    it("should handle non-array input", () => {
      const result = buildInClause(null);
      expect(result).toBe("('')");
    });
  });

  describe("escapeLikePattern", () => {
    it("should escape percent signs", () => {
      expect(escapeLikePattern("100%")).toBe("100\\%");
    });

    it("should escape underscores", () => {
      expect(escapeLikePattern("test_value")).toBe("test\\_value");
    });

    it("should escape brackets", () => {
      expect(escapeLikePattern("test[a-z]")).toBe("test\\[a-z\\]");
    });

    it("should escape backslashes", () => {
      expect(escapeLikePattern("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should handle plain strings", () => {
      expect(escapeLikePattern("simple")).toBe("simple");
    });

    it("should escape multiple special characters", () => {
      expect(escapeLikePattern("100%_test[x]")).toBe("100\\%\\_test\\[x\\]");
    });
  });
});
