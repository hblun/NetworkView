import { describe, it, expect, beforeEach } from "vitest";

vi.mock("../public/js/state/manager.js", () => {
  const state = {
    spatialReady: false,
    geometryField: null,
    bboxReady: true,
    bboxFields: {
      minx: "min_lon",
      miny: "min_lat",
      maxx: "max_lon",
      maxy: "max_lat"
    },
    operatorFields: ["operator"],
    modeField: "mode"
  };
  return { state };
});

import {
  expandPointToBbox,
  buildPointDistanceWhere,
  buildSpatialWhere
} from "../public/js/spatial/sql.js";
import { state } from "../public/js/state/manager.js";

describe("spatial sql helpers", () => {
  beforeEach(() => {
    state.spatialReady = false;
    state.geometryField = null;
    state.bboxReady = true;
    state.bboxFields = {
      minx: "min_lon",
      miny: "min_lat",
      maxx: "max_lon",
      maxy: "max_lat"
    };
    state.operatorFields = ["operator"];
    state.modeField = "mode";
  });

  describe("expandPointToBbox", () => {
    it("expands point using degree approximations", () => {
      const bbox = expandPointToBbox({ lat: 0, lng: 0 }, 1000);
      expect(bbox.minLat).toBeCloseTo(-0.008983);
      expect(bbox.maxLat).toBeCloseTo(0.008983);
      expect(bbox.minLon).toBeCloseTo(-0.008983);
      expect(bbox.maxLon).toBeCloseTo(0.008983);
    });

    it("throws for invalid coordinates", () => {
      expect(() => expandPointToBbox({ lat: null, lng: 0 }, 1000)).toThrow(
        /Invalid point/
      );
    });

    it("throws near the poles when longitude delta is unstable", () => {
      expect(() => expandPointToBbox({ lat: 90, lng: 0 }, 1000)).toThrow(
        /Cannot compute longitude/
      );
    });
  });

  describe("buildPointDistanceWhere", () => {
    it("builds spatial distance predicate when geometry is available", () => {
      state.spatialReady = true;
      state.geometryField = "geom";
      const where = buildPointDistanceWhere({ lat: 2, lng: 1 }, 111320, "within");
      expect(where).toBe(
        "ST_Distance(ST_GeomFromText('POINT(1 2)'), \"geom\") <= 1"
      );
    });

    it("builds bbox predicate when spatial is unavailable", () => {
      const where = buildPointDistanceWhere({ lat: 1, lng: 1 }, 1000, "within");
      const compact = where.replace(/\s+/g, " ").trim();
      expect(compact).toBe(
        '"max_lon" >= 0.9910169902912622 AND "min_lon" <= 1.0089830097087378 AND "max_lat" >= 0.9910169902912622 AND "min_lat" <= 1.0089830097087378'
      );
    });

    it("fails fast when bbox fields are missing", () => {
      state.bboxFields = {};
      expect(() => buildPointDistanceWhere({ lat: 0, lng: 0 }, 1000)).toThrow(
        /Bbox field names/
      );
    });
  });

  describe("buildSpatialWhere", () => {
    it("throws on unknown operator to avoid silent failures", () => {
      const compiled = {
        blocks: [
          { target: "selected_point", distance: 1000, type: "include", relation: "within" },
          { type: "include", operator: "unknown" }
        ]
      };
      expect(() => buildSpatialWhere(compiled, { lat: 0, lng: 0 })).toThrow(
        /Unknown block operator/
      );
    });

    it("combines point and attribute filters", () => {
      const compiled = {
        blocks: [
          { target: "selected_point", distance: 1000, type: "include", relation: "within" },
          { type: "exclude", operator: "operator", value: "BusCo" }
        ]
      };
      const where = buildSpatialWhere(compiled, { lat: 0, lng: 0 });
      expect(where).toMatch(/NOT \(\("operator" = 'BusCo'\)\)/);
      expect(where).toMatch(/max_lat/);
    });
  });
});
