/**
 * Tests for spatial/sql.js - Spatial query SQL generation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../public/js/state/manager.js";
import {
  expandPointToBbox,
  buildPointDistanceWhere,
  buildBoundaryWhere,
  buildAttributeWhere,
  buildSpatialWhere
} from "../public/js/spatial/sql.js";

describe("Spatial SQL Generation", () => {
  beforeEach(() => {
    // Reset state to defaults
    state.spatialReady = false;
    state.geometryField = null;
    state.bboxReady = false;
    state.bboxFields = null;
    state.modeField = "mode";
    state.operatorFields = ["operatorCode", "operatorName"];
  });

  describe("expandPointToBbox", () => {
    it("should expand point to bbox with given distance", () => {
      const point = { lat: 55.9533, lng: -3.1883 }; // Edinburgh
      const bbox = expandPointToBbox(point, 1000); // 1km

      expect(bbox.minLon).toBeLessThan(point.lng);
      expect(bbox.maxLon).toBeGreaterThan(point.lng);
      expect(bbox.minLat).toBeLessThan(point.lat);
      expect(bbox.maxLat).toBeGreaterThan(point.lat);

      // Check approximate distances (1km ~= 0.009 degrees at this latitude)
      const lngDelta = bbox.maxLon - point.lng;
      const latDelta = bbox.maxLat - point.lat;
      expect(lngDelta).toBeCloseTo(0.016, 1); // Adjusted for actual calculation
      expect(latDelta).toBeCloseTo(0.009, 2);
    });

    it("should handle equator coordinates", () => {
      const point = { lat: 0, lng: 0 };
      const bbox = expandPointToBbox(point, 5000); // 5km

      expect(bbox.minLon).toBeCloseTo(-0.045, 2);
      expect(bbox.maxLon).toBeCloseTo(0.045, 2);
      expect(bbox.minLat).toBeCloseTo(-0.045, 2);
      expect(bbox.maxLat).toBeCloseTo(0.045, 2);
    });

    it("should handle polar regions (high latitude)", () => {
      const point = { lat: 80, lng: 0 };
      const bbox = expandPointToBbox(point, 1000);

      // Longitude delta should be larger at high latitudes
      const lngDelta = bbox.maxLon - point.lng;
      const latDelta = bbox.maxLat - point.lat;
      expect(lngDelta).toBeGreaterThan(latDelta);
    });
  });

  describe("buildPointDistanceWhere - bbox fallback", () => {
    beforeEach(() => {
      state.spatialReady = false;
      state.bboxReady = true;
      state.bboxFields = {
        minx: "bbox_minx",
        miny: "bbox_miny",
        maxx: "bbox_maxx",
        maxy: "bbox_maxy"
      };
    });

    it("should build bbox overlap query when spatial not ready", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildPointDistanceWhere(point, 500, "within");

      expect(sql).toContain('"bbox_maxx"');
      expect(sql).toContain('"bbox_minx"');
      expect(sql).toContain('"bbox_maxy"');
      expect(sql).toContain('"bbox_miny"');
      expect(sql).toContain("AND");
    });

    it("should throw if neither spatial nor bbox available", () => {
      state.bboxReady = false;
      state.bboxFields = null;

      const point = { lat: 55.9533, lng: -3.1883 };
      expect(() => buildPointDistanceWhere(point, 500, "within")).toThrow(
        "Bbox fields not available"
      );
    });

    it("should validate point coordinates", () => {
      expect(() => buildPointDistanceWhere(null, 500, "within")).toThrow(
        "Invalid point coordinates"
      );
      expect(() => buildPointDistanceWhere({ lat: NaN, lng: 0 }, 500, "within")).toThrow(
        "Invalid point coordinates"
      );
      expect(() => buildPointDistanceWhere({ lat: 0, lng: Infinity }, 500, "within")).toThrow(
        "Invalid point coordinates"
      );
    });

    it("should validate distance", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      expect(() => buildPointDistanceWhere(point, -100, "within")).toThrow(
        "Invalid distance"
      );
      expect(() => buildPointDistanceWhere(point, NaN, "within")).toThrow(
        "Invalid distance"
      );
    });
  });

  describe("buildPointDistanceWhere - spatial extension", () => {
    beforeEach(() => {
      state.spatialReady = true;
      state.geometryField = "geometry";
    });

    it("should build ST_Distance query for within relation", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildPointDistanceWhere(point, 1000, "within");

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POINT(-3.1883 55.9533)");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("<=");
    });

    it("should build ST_Intersects with buffer for intersects relation", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildPointDistanceWhere(point, 500, "intersects");

      expect(sql).toContain("ST_Intersects");
      expect(sql).toContain("ST_Buffer");
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POINT(-3.1883 55.9533)");
    });

    it("should use custom geometry field", () => {
      state.geometryField = "geom";
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildPointDistanceWhere(point, 500, "within");

      expect(sql).toContain('"geom"');
    });

    it("should normalize relation to within or intersects", () => {
      const point = { lat: 55.9533, lng: -3.1883 };

      // Unknown relation should default to within
      const sql1 = buildPointDistanceWhere(point, 500, "unknown");
      expect(sql1).toContain("ST_Distance");

      const sql2 = buildPointDistanceWhere(point, 500, "within");
      expect(sql2).toContain("ST_Distance");

      const sql3 = buildPointDistanceWhere(point, 500, "intersects");
      expect(sql3).toContain("ST_Intersects");
    });
  });

  describe("buildBoundaryWhere", () => {
    beforeEach(() => {
      state.spatialReady = true;
      state.geometryField = "geometry";
    });

    it("should throw if spatial extension not available", () => {
      state.spatialReady = false;

      expect(() => buildBoundaryWhere("touches_boundary", { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" })).toThrow(
        "Boundary queries require spatial extension"
      );
    });

    it("should build ST_Touches query for touches_boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      const sql = buildBoundaryWhere("touches_boundary", boundary);

      expect(sql).toContain("ST_Touches");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should build ST_Within query for inside_boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      const sql = buildBoundaryWhere("inside_boundary", boundary);

      expect(sql).toContain("ST_Within");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should accept boundary as string WKT", () => {
      const sql = buildBoundaryWhere("inside_boundary", "POLYGON((0 0,1 0,1 1,0 1,0 0))");
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should accept boundary with geometry object (GeoJSON)", () => {
      const boundary = {
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
      };
      const sql = buildBoundaryWhere("inside_boundary", boundary);
      expect(sql).toContain("POLYGON");
      expect(sql).toContain("0 0");
      expect(sql).toContain("1 1");
    });

    it("should throw for unknown boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      expect(() => buildBoundaryWhere("unknown_operator", boundary)).toThrow(
        "Unknown boundary operator: unknown_operator"
      );
    });

    it("should throw if boundary missing WKT/GeoJSON", () => {
      expect(() => buildBoundaryWhere("inside_boundary", {})).toThrow(
        "Boundary geometry must include WKT or GeoJSON"
      );
      expect(() => buildBoundaryWhere("inside_boundary", null)).toThrow(
        "Boundary geometry must include WKT or GeoJSON"
      );
    });
  });

  describe("buildAttributeWhere", () => {
    it("should build operator filter with multiple field candidates", () => {
      state.operatorFields = ["operatorCode", "operatorName"];
      const sql = buildAttributeWhere("operator", "FirstBus");

      expect(sql).toContain('"operatorCode"');
      expect(sql).toContain('"operatorName"');
      expect(sql).toContain("'FirstBus'");
      expect(sql).toContain("OR");
    });

    it("should build mode filter", () => {
      state.modeField = "mode";
      const sql = buildAttributeWhere("mode", "Bus");

      expect(sql).toContain('"mode"');
      expect(sql).toContain("'Bus'");
      expect(sql).not.toContain("OR");
    });

    it("should return 1=1 for empty value", () => {
      const sql = buildAttributeWhere("operator", "");
      expect(sql).toBe("1=1");
    });

    it("should throw if operator field not found", () => {
      state.operatorFields = [];
      expect(() => buildAttributeWhere("operator", "FirstBus")).toThrow(
        "No operator field found in schema"
      );
    });

    it("should throw if mode field not found", () => {
      state.modeField = null;
      expect(() => buildAttributeWhere("mode", "Bus")).toThrow(
        "No mode field found in schema"
      );
    });

    it("should throw for unknown attribute operator", () => {
      expect(() => buildAttributeWhere("unknown", "value")).toThrow(
        "Unknown attribute operator: unknown"
      );
    });

    it("should escape SQL special characters", () => {
      state.operatorFields = ["operatorCode"];
      const sql = buildAttributeWhere("operator", "O'Reilly's Buses");
      expect(sql).toContain("O''Reilly''s Buses");
    });
  });

  describe("buildSpatialWhere - combined queries", () => {
    beforeEach(() => {
      state.spatialReady = true;
      state.geometryField = "geometry";
      state.operatorFields = ["operatorCode"];
      state.modeField = "mode";
    });

    it("should return 1=1 for empty blocks", () => {
      const compiled = { blocks: [] };
      const sql = buildSpatialWhere(compiled, null);
      expect(sql).toBe("1=1");
    });

    it("should build query for single point block", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("POINT(-3.1883 55.9533)");
    });

    it("should combine main block with include block using AND", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          },
          {
            type: "include",
            operator: "operator",
            value: "FirstBus"
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("AND");
      expect(sql).toContain("'FirstBus'");
    });

    it("should combine blocks with exclude using NOT AND", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          },
          {
            type: "exclude",
            operator: "mode",
            value: "Rail"
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("AND");
      expect(sql).toContain("NOT");
      expect(sql).toContain("'Rail'");
    });

    it("should combine blocks with also-include using OR", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          },
          {
            type: "also-include",
            operator: "near_point",
            distance: 1000
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("OR");
    });

    it("should handle complex multi-block queries", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          },
          {
            type: "include",
            operator: "mode",
            value: "Bus"
          },
          {
            type: "exclude",
            operator: "operator",
            value: "BadOperator"
          },
          {
            type: "also-include",
            operator: "near_point",
            distance: 1000
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      expect(sql).toContain("'Bus'");
      expect(sql).toContain("NOT");
      expect(sql).toContain("'BadOperator'");
      expect(sql).toContain("OR");
      expect(sql.split("AND").length).toBeGreaterThan(2);
    });

    it("should throw if point missing for point-based queries", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          }
        ]
      };
      expect(() => buildSpatialWhere(compiled, null)).toThrow(
        "Point is required for selected_point target"
      );
    });

    it("should handle boundary target with inside_boundary relation", () => {
      const compiled = {
        blocks: [
          {
            target: "boundary",
            relation: "inside_boundary"
          }
        ],
        boundary: { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" }
      };
      const sql = buildSpatialWhere(compiled, null);

      expect(sql).toContain("ST_Within");
      expect(sql).toContain("POLYGON");
    });

    it("should skip trivial 1=1 clauses", () => {
      const compiled = {
        blocks: [
          {
            target: "selected_point",
            distance: 500,
            relation: "within"
          },
          {
            type: "include",
            operator: "operator",
            value: "" // Empty value generates 1=1
          }
        ]
      };
      const point = { lat: 55.9533, lng: -3.1883 };
      const sql = buildSpatialWhere(compiled, point);

      // Should only contain main clause, not the 1=1
      expect(sql).toContain("ST_Distance");
      expect(sql).not.toContain("1=1");
    });
  });
});
