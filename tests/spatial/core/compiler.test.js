import { describe, it, expect } from "vitest";
import { compileQuery, hashQuery } from "../../../public/js/spatial/core/compiler.js";
import { SpatialQuery } from "../../../public/js/spatial/core/query.js";

describe("Compiler", () => {
  describe("compileQuery", () => {
    it("should compile simple point query", () => {
      const query = new SpatialQuery({
        find: "routes",
        condition: "within",
        distance: 500,
        target: "selected_point"
      });
      const context = {
        point: { lat: 55, lng: -3 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.version).toBe("1.0.0");
      expect(compiled.blocks).toHaveLength(1);
      expect(compiled.blocks[0]).toMatchObject({
        target: "selected_point",
        distance: 500,
        relation: "within"
      });
      expect(compiled.metadata).toBeDefined();
      expect(compiled.metadata.compiled_at).toBeDefined();
      expect(compiled.hash).toBeDefined();
    });

    it("should include context in metadata", () => {
      const query = new SpatialQuery({});
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        bboxReady: false
      };

      const compiled = compileQuery(query, context);

      expect(compiled.metadata.context).toMatchObject({
        has_point: true,
        has_boundary: false,
        spatial_ready: true
      });
    });

    it("should compile query with include blocks", () => {
      const query = new SpatialQuery({
        blocks: [
          { type: "include", operator: "operator", value: "FirstBus" }
        ]
      });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      // Main block + include block
      expect(compiled.blocks).toHaveLength(2);
      expect(compiled.blocks[1]).toMatchObject({
        type: "include",
        operator: "operator",
        value: "FirstBus"
      });
    });

    it("should compile query with exclude blocks", () => {
      const query = new SpatialQuery({
        blocks: [
          { type: "exclude", operator: "mode", value: "Rail" }
        ]
      });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.blocks[1]).toMatchObject({
        type: "exclude",
        operator: "mode",
        value: "Rail"
      });
    });

    it("should compile query with also-include blocks", () => {
      const query = new SpatialQuery({
        blocks: [
          { type: "also-include", operator: "near_point", distance: 1000 }
        ]
      });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.blocks[1]).toMatchObject({
        type: "also-include",
        operator: "near_point",
        distance: 1000
      });
    });

    it("should compile boundary query", () => {
      const query = new SpatialQuery({
        target: "boundary",
        condition: "within"
      });
      const context = {
        boundary: { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.blocks[0]).toMatchObject({
        target: "boundary",
        relation: "within"
      });
      expect(compiled.boundary).toEqual(context.boundary);
    });

    it("should throw ValidationError if query is invalid", () => {
      const query = { distance: -1 }; // Invalid
      const context = {};

      expect(() => compileQuery(query, context)).toThrow("Validation failed");
    });

    it("should include find type in compiled output", () => {
      const query = new SpatialQuery({ find: "stops" });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.find).toBe("stops");
    });

    it("should map intersect condition to intersects relation", () => {
      const query = new SpatialQuery({ condition: "intersect" });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.blocks[0].relation).toBe("intersects");
    });

    it("should map within condition to within relation", () => {
      const query = new SpatialQuery({ condition: "within" });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      expect(compiled.blocks[0].relation).toBe("within");
    });
  });

  describe("hashQuery", () => {
    it("should generate consistent hash for same query", () => {
      const query = new SpatialQuery({ distance: 500 });
      const hash1 = hashQuery(query);
      const hash2 = hashQuery(query);

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different queries", () => {
      const query1 = new SpatialQuery({ distance: 500 });
      const query2 = new SpatialQuery({ distance: 1000 });

      const hash1 = hashQuery(query1);
      const hash2 = hashQuery(query2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle blocks in hash", () => {
      const query1 = new SpatialQuery({
        blocks: [{ type: "include", operator: "operator", value: "A" }]
      });
      const query2 = new SpatialQuery({
        blocks: [{ type: "include", operator: "operator", value: "B" }]
      });

      const hash1 = hashQuery(query1);
      const hash2 = hashQuery(query2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("compiled query contract", () => {
    it("should be serializable", () => {
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);
      const json = JSON.stringify(compiled);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe("1.0.0");
      expect(parsed.blocks).toBeDefined();
      expect(parsed.metadata).toBeDefined();
    });

    it("should have stable version", () => {
      const query = new SpatialQuery({});
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true
      };

      const compiled = compileQuery(query, context);

      // Version should follow semver
      expect(compiled.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
