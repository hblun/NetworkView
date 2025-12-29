import { describe, it, expect } from "vitest";
import { SpatialQuery } from "../../../public/js/spatial/core/query.js";

describe("SpatialQuery", () => {
  describe("constructor", () => {
    it("should create query with default values", () => {
      const query = new SpatialQuery({});
      expect(query.find).toBe("routes");
      expect(query.condition).toBe("intersect");
      expect(query.distance).toBe(300);
      expect(query.target).toBe("selected_point");
      expect(query.blocks).toEqual([]);
    });

    it("should accept custom values", () => {
      const query = new SpatialQuery({
        find: "stops",
        condition: "within",
        distance: 500,
        target: "boundary"
      });
      expect(query.find).toBe("stops");
      expect(query.condition).toBe("within");
      expect(query.distance).toBe(500);
      expect(query.target).toBe("boundary");
    });

    it("should accept blocks", () => {
      const blocks = [
        { type: "include", operator: "operator", value: "FirstBus" }
      ];
      const query = new SpatialQuery({ blocks });
      expect(query.blocks).toEqual(blocks);
    });
  });

  describe("toJSON", () => {
    it("should serialize to plain object", () => {
      const query = new SpatialQuery({
        find: "routes",
        distance: 500,
        blocks: [{ type: "exclude", operator: "mode", value: "Rail" }]
      });

      const json = query.toJSON();
      expect(json).toEqual({
        find: "routes",
        condition: "intersect",
        distance: 500,
        target: "selected_point",
        blocks: [{ type: "exclude", operator: "mode", value: "Rail" }]
      });
    });
  });

  describe("fromJSON", () => {
    it("should deserialize from plain object", () => {
      const json = {
        find: "stops",
        condition: "within",
        distance: 800,
        target: "selected_point",
        blocks: []
      };

      const query = SpatialQuery.fromJSON(json);
      expect(query).toBeInstanceOf(SpatialQuery);
      expect(query.find).toBe("stops");
      expect(query.distance).toBe(800);
    });
  });

  describe("describe", () => {
    it("should generate human-readable description", () => {
      const query = new SpatialQuery({
        find: "routes",
        condition: "within",
        distance: 500,
        target: "selected_point"
      });

      const description = query.describe();
      expect(description).toContain("routes");
      expect(description).toContain("within");
      expect(description).toContain("500");
    });

    it("should include blocks in description", () => {
      const query = new SpatialQuery({
        blocks: [
          { type: "exclude", operator: "operator", value: "FirstBus" }
        ]
      });

      const description = query.describe();
      expect(description).toContain("excluding");
      expect(description).toContain("FirstBus");
    });
  });
});
