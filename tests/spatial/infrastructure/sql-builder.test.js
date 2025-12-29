import { describe, it, expect } from "vitest";
import {
  expandPointToBbox,
  buildPointDistanceWhere,
  buildBoundaryWhere,
  buildAttributeWhere,
  buildSpatialWhere
} from "../../../public/js/spatial/infrastructure/sql-builder.js";

describe("SQL Builder Infrastructure", () => {
  describe("expandPointToBbox", () => {
    it("should expand point to bbox with given distance", () => {
      const point = { lat: 55.9533, lng: -3.1883 }; // Edinburgh
      const bbox = expandPointToBbox(point, 1000); // 1km

      expect(bbox.minLon).toBeLessThan(point.lng);
      expect(bbox.maxLon).toBeGreaterThan(point.lng);
      expect(bbox.minLat).toBeLessThan(point.lat);
      expect(bbox.maxLat).toBeGreaterThan(point.lat);

      // Check approximate distances
      const lngDelta = bbox.maxLon - point.lng;
      const latDelta = bbox.maxLat - point.lat;
      expect(lngDelta).toBeCloseTo(0.016, 1);
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
    it("should build bbox overlap query when spatial not ready", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: false,
        bboxReady: true,
        bboxFields: {
          minx: "bbox_minx",
          miny: "bbox_miny",
          maxx: "bbox_maxx",
          maxy: "bbox_maxy"
        }
      };

      const sql = buildPointDistanceWhere(point, 500, "within", context);

      expect(sql).toContain('"bbox_maxx"');
      expect(sql).toContain('"bbox_minx"');
      expect(sql).toContain('"bbox_maxy"');
      expect(sql).toContain('"bbox_miny"');
      expect(sql).toContain("AND");
    });

    it("should throw if neither spatial nor bbox available", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: false,
        bboxReady: false
      };

      expect(() => buildPointDistanceWhere(point, 500, "within", context)).toThrow(
        "Bbox fields not available"
      );
    });

    it("should validate point coordinates", () => {
      const context = { spatialReady: true, geometryField: "geometry" };

      expect(() => buildPointDistanceWhere(null, 500, "within", context)).toThrow(
        "Invalid point coordinates"
      );
      expect(() => buildPointDistanceWhere({ lat: NaN, lng: 0 }, 500, "within", context)).toThrow(
        "Invalid point coordinates"
      );
      expect(() => buildPointDistanceWhere({ lat: 0, lng: Infinity }, 500, "within", context)).toThrow(
        "Invalid point coordinates"
      );
    });

    it("should validate distance", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = { spatialReady: true, geometryField: "geometry" };

      expect(() => buildPointDistanceWhere(point, -100, "within", context)).toThrow(
        "Invalid distance"
      );
      expect(() => buildPointDistanceWhere(point, NaN, "within", context)).toThrow(
        "Invalid distance"
      );
    });
  });

  describe("buildPointDistanceWhere - spatial extension", () => {
    it("should build ST_Distance query for within relation", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildPointDistanceWhere(point, 1000, "within", context);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POINT(-3.1883 55.9533)");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("<=");
    });

    it("should build ST_Intersects with buffer for intersects relation", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildPointDistanceWhere(point, 500, "intersects", context);

      expect(sql).toContain("ST_Intersects");
      expect(sql).toContain("ST_Buffer");
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POINT(-3.1883 55.9533)");
    });

    it("should use custom geometry field", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: true,
        geometryField: "geom"
      };

      const sql = buildPointDistanceWhere(point, 500, "within", context);

      expect(sql).toContain('"geom"');
    });

    it("should normalize relation to within or intersects", () => {
      const point = { lat: 55.9533, lng: -3.1883 };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      // Unknown relation should default to within
      const sql1 = buildPointDistanceWhere(point, 500, "unknown", context);
      expect(sql1).toContain("ST_Distance");

      const sql2 = buildPointDistanceWhere(point, 500, "within", context);
      expect(sql2).toContain("ST_Distance");

      const sql3 = buildPointDistanceWhere(point, 500, "intersects", context);
      expect(sql3).toContain("ST_Intersects");
    });
  });

  describe("buildBoundaryWhere", () => {
    it("should throw if spatial extension not available", () => {
      const context = {
        spatialReady: false,
        geometryField: null
      };

      expect(() => buildBoundaryWhere("touches_boundary", { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" }, context)).toThrow(
        "Boundary queries require spatial extension"
      );
    });

    it("should build ST_Touches query for touches_boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildBoundaryWhere("touches_boundary", boundary, context);

      expect(sql).toContain("ST_Touches");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("ST_GeomFromText");
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should build ST_Within query for inside_boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildBoundaryWhere("inside_boundary", boundary, context);

      expect(sql).toContain("ST_Within");
      expect(sql).toContain('"geometry"');
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should accept boundary as string WKT", () => {
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildBoundaryWhere("inside_boundary", "POLYGON((0 0,1 0,1 1,0 1,0 0))", context);
      expect(sql).toContain("POLYGON((0 0,1 0,1 1,0 1,0 0))");
    });

    it("should throw for unknown boundary operator", () => {
      const boundary = { wkt: "POLYGON((0 0,1 0,1 1,0 1,0 0))" };
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      expect(() => buildBoundaryWhere("unknown_operator", boundary, context)).toThrow(
        "Unknown boundary operator: unknown_operator"
      );
    });

    it("should throw if boundary missing WKT/GeoJSON", () => {
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      expect(() => buildBoundaryWhere("inside_boundary", {}, context)).toThrow(
        "Boundary geometry must include WKT or GeoJSON"
      );
      expect(() => buildBoundaryWhere("inside_boundary", null, context)).toThrow(
        "Boundary geometry must include WKT or GeoJSON"
      );
    });
  });

  describe("buildAttributeWhere", () => {
    it("should build operator filter with multiple field candidates", () => {
      const context = {
        operatorFields: ["operatorCode", "operatorName"]
      };

      const sql = buildAttributeWhere("operator", "FirstBus", context);

      expect(sql).toContain('"operatorCode"');
      expect(sql).toContain('"operatorName"');
      expect(sql).toContain("'FirstBus'");
      expect(sql).toContain("OR");
    });

    it("should build mode filter", () => {
      const context = {
        modeField: "mode"
      };

      const sql = buildAttributeWhere("mode", "Bus", context);

      expect(sql).toContain('"mode"');
      expect(sql).toContain("'Bus'");
      expect(sql).not.toContain("OR");
    });

    it("should return 1=1 for empty value", () => {
      const context = {
        operatorFields: ["operatorCode"]
      };

      const sql = buildAttributeWhere("operator", "", context);
      expect(sql).toBe("1=1");
    });

    it("should throw if operator field not found", () => {
      const context = {
        operatorFields: []
      };

      expect(() => buildAttributeWhere("operator", "FirstBus", context)).toThrow(
        "No operator field found in schema"
      );
    });

    it("should throw if mode field not found", () => {
      const context = {
        modeField: null
      };

      expect(() => buildAttributeWhere("mode", "Bus", context)).toThrow(
        "No mode field found in schema"
      );
    });

    it("should throw for unknown attribute operator", () => {
      expect(() => buildAttributeWhere("unknown", "value", {})).toThrow(
        "Unknown attribute operator: unknown"
      );
    });

    it("should escape SQL special characters", () => {
      const context = {
        operatorFields: ["operatorCode"]
      };

      const sql = buildAttributeWhere("operator", "O'Reilly's Buses", context);
      expect(sql).toContain("O''Reilly''s Buses");
    });
  });

  describe("buildSpatialWhere - combined queries", () => {
    it("should return 1=1 for empty blocks", () => {
      const compiled = { blocks: [] };
      const context = {};

      const sql = buildSpatialWhere(compiled, null, context);
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
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildSpatialWhere(compiled, point, context);

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
      const context = {
        spatialReady: true,
        geometryField: "geometry",
        operatorFields: ["operatorCode"]
      };

      const sql = buildSpatialWhere(compiled, point, context);

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
      const context = {
        spatialReady: true,
        geometryField: "geometry",
        modeField: "mode"
      };

      const sql = buildSpatialWhere(compiled, point, context);

      expect(sql).toContain("ST_Distance");
      expect(sql).toContain("AND");
      expect(sql).toContain("NOT");
      expect(sql).toContain("'Rail'");
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
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      expect(() => buildSpatialWhere(compiled, null, context)).toThrow(
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
      const context = {
        spatialReady: true,
        geometryField: "geometry"
      };

      const sql = buildSpatialWhere(compiled, null, context);

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
      const context = {
        spatialReady: true,
        geometryField: "geometry",
        operatorFields: ["operatorCode"]
      };

      const sql = buildSpatialWhere(compiled, point, context);

      // Should only contain main clause, not the 1=1
      expect(sql).toContain("ST_Distance");
      expect(sql).not.toContain("1=1");
    });
  });
});
