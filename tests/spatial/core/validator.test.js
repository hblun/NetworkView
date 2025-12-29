import { describe, it, expect } from "vitest";
import {
  ValidationError,
  validateQuery,
  assertValid
} from "../../../public/js/spatial/core/validator.js";
import { SpatialQuery } from "../../../public/js/spatial/core/query.js";

describe("Validator", () => {
  describe("validateQuery - basic validation", () => {
    it("should return empty array for valid query", () => {
      const query = new SpatialQuery({
        find: "routes",
        distance: 500,
        target: "selected_point"
      });
      const context = {
        point: { lat: 55, lng: -3 },
        spatialReady: true
      };

      const errors = validateQuery(query, context);
      expect(errors).toEqual([]);
    });

    it("should validate required fields", () => {
      const query = { distance: 500 }; // Missing find and target
      const errors = validateQuery(query, {});

      expect(errors).toContain("'find' is required");
      expect(errors).toContain("'target' is required");
    });

    it("should validate distance is non-negative", () => {
      const query = new SpatialQuery({ distance: -100 });
      const errors = validateQuery(query, {});

      expect(errors).toContain("'distance' must be a non-negative number");
    });

    it("should validate distance is a number", () => {
      const query = new SpatialQuery({ distance: "invalid" });
      const errors = validateQuery(query, {});

      expect(errors).toContain("'distance' must be a non-negative number");
    });
  });

  describe("validateQuery - target-specific validation", () => {
    it("should require point for selected_point target", () => {
      const query = new SpatialQuery({ target: "selected_point" });
      const context = { point: null };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Point is required when target is 'selected_point'");
    });

    it("should validate point coordinates", () => {
      const query = new SpatialQuery({ target: "selected_point" });
      const context = { point: { lat: NaN, lng: 0 } };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Invalid point coordinates");
    });

    it("should detect polar region coordinates", () => {
      const query = new SpatialQuery({
        target: "selected_point",
        distance: 1000
      });
      const context = { point: { lat: 90, lng: 0 } };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Cannot compute longitude delta near the poles");
    });

    it("should require boundary for boundary target", () => {
      const query = new SpatialQuery({ target: "boundary" });
      const context = { boundary: null };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Boundary is required when target is 'boundary'");
    });
  });

  describe("validateQuery - context validation", () => {
    it("should validate spatial extension availability for boundary queries", () => {
      const query = new SpatialQuery({
        target: "boundary",
        blocks: []
      });
      const context = {
        boundary: { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" },
        spatialReady: false
      };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Boundary queries require spatial extension");
    });

    it("should validate bbox availability when spatial unavailable", () => {
      const query = new SpatialQuery({ target: "selected_point" });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: false,
        bboxReady: false
      };

      const errors = validateQuery(query, context);
      expect(errors).toContain("Neither spatial extension nor bbox fields available");
    });
  });

  describe("validateQuery - block validation", () => {
    it("should validate block type", () => {
      const query = new SpatialQuery({
        blocks: [{ type: "invalid", operator: "operator", value: "X" }]
      });

      const errors = validateQuery(query, {});
      expect(errors).toContain("Block 0: invalid type 'invalid'");
    });

    it("should validate block operator", () => {
      const query = new SpatialQuery({
        blocks: [{ type: "include", operator: null, value: "X" }]
      });

      const errors = validateQuery(query, {});
      expect(errors).toContain("Block 0: operator is required");
    });

    it("should validate block value for operator/mode", () => {
      const query = new SpatialQuery({
        blocks: [{ type: "exclude", operator: "operator", value: "" }]
      });

      const errors = validateQuery(query, {});
      expect(errors).toContain("Block 0: value is required for operator");
    });

    it("should require point for near_point operator", () => {
      const query = new SpatialQuery({
        blocks: [{ type: "include", operator: "near_point", distance: 500 }]
      });
      const context = { point: null };

      const errors = validateQuery(query, {});
      expect(errors).toContain("Block 0: point required for near_point operator");
    });
  });

  describe("assertValid", () => {
    it("should throw ValidationError if invalid", () => {
      const query = { distance: -1 };

      expect(() => assertValid(query, {})).toThrow(ValidationError);
      expect(() => assertValid(query, {})).toThrow(/Validation failed/);
    });

    it("should not throw if valid", () => {
      const query = new SpatialQuery({});
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      expect(() => assertValid(query, context)).not.toThrow();
    });
  });

  describe("ValidationError", () => {
    it("should contain array of errors", () => {
      const errors = ["error1", "error2"];
      const err = new ValidationError(errors);

      expect(err.errors).toEqual(errors);
      expect(err.message).toContain("error1");
      expect(err.message).toContain("error2");
    });
  });
});
