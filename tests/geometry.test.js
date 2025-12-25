import { describe, it, expect } from "vitest";
import {
  getGeometryCoordinates,
  getFeaturesBbox,
  isValidBbox
} from "../public/js/utils/geometry.js";

describe("Geometry Utilities", () => {
  describe("getGeometryCoordinates", () => {
    it("should extract LineString coordinates", () => {
      const geometry = {
        type: "LineString",
        coordinates: [[0, 0], [1, 1], [2, 2]]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords).toEqual([[0, 0], [1, 1], [2, 2]]);
    });

    it("should extract MultiLineString coordinates", () => {
      const geometry = {
        type: "MultiLineString",
        coordinates: [
          [[0, 0], [1, 1]],
          [[2, 2], [3, 3]]
        ]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    });

    it("should extract Point coordinates", () => {
      const geometry = {
        type: "Point",
        coordinates: [10, 20]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords).toEqual([[10, 20]]);
    });

    it("should extract MultiPoint coordinates", () => {
      const geometry = {
        type: "MultiPoint",
        coordinates: [[0, 0], [1, 1]]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords).toEqual([[0, 0], [1, 1]]);
    });

    it("should extract Polygon coordinates", () => {
      const geometry = {
        type: "Polygon",
        coordinates: [
          [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]
        ]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords.length).toBeGreaterThan(0);
    });

    it("should extract MultiPolygon coordinates", () => {
      const geometry = {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [0, 1], [1, 1], [0, 0]]],
          [[[2, 2], [2, 3], [3, 3], [2, 2]]]
        ]
      };
      const coords = getGeometryCoordinates(geometry);
      expect(coords.length).toBeGreaterThan(0);
    });

    it("should handle null geometry", () => {
      expect(getGeometryCoordinates(null)).toEqual([]);
    });

    it("should handle unknown geometry type", () => {
      const geometry = { type: "Unknown", coordinates: [] };
      expect(getGeometryCoordinates(geometry)).toEqual([]);
    });
  });

  describe("getFeaturesBbox", () => {
    it("should calculate bbox for single feature", () => {
      const features = [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[0, 0], [10, 10]]
          }
        }
      ];
      const bbox = getFeaturesBbox(features);
      expect(bbox).toEqual([0, 0, 10, 10]);
    });

    it("should calculate bbox for multiple features", () => {
      const features = [
        {
          geometry: {
            type: "Point",
            coordinates: [-5, -5]
          }
        },
        {
          geometry: {
            type: "Point",
            coordinates: [15, 15]
          }
        }
      ];
      const bbox = getFeaturesBbox(features);
      expect(bbox).toEqual([-5, -5, 15, 15]);
    });

    it("should handle point at same location (zero-area)", () => {
      const features = [
        {
          geometry: {
            type: "Point",
            coordinates: [5, 5]
          }
        }
      ];
      const bbox = getFeaturesBbox(features);
      expect(bbox).toBeDefined();
      expect(bbox[0]).toBeLessThan(5); // Padded
      expect(bbox[2]).toBeGreaterThan(5); // Padded
    });

    it("should return null for empty features", () => {
      expect(getFeaturesBbox([])).toBeNull();
    });

    it("should return null for invalid coordinates", () => {
      const features = [
        {
          geometry: {
            type: "Point",
            coordinates: [NaN, NaN]
          }
        }
      ];
      expect(getFeaturesBbox(features)).toBeNull();
    });

    it("should skip invalid coordinate pairs", () => {
      const features = [
        {
          geometry: {
            type: "LineString",
            coordinates: [[0, 0], [null, null], [10, 10]]
          }
        }
      ];
      const bbox = getFeaturesBbox(features);
      expect(bbox).toEqual([0, 0, 10, 10]);
    });
  });

  describe("isValidBbox", () => {
    it("should validate correct bbox", () => {
      expect(isValidBbox([0, 0, 10, 10])).toBe(true);
      expect(isValidBbox([-180, -90, 180, 90])).toBe(true);
    });

    it("should reject non-array", () => {
      expect(isValidBbox(null)).toBe(false);
      expect(isValidBbox(undefined)).toBe(false);
      expect(isValidBbox("not an array")).toBe(false);
    });

    it("should reject wrong length", () => {
      expect(isValidBbox([0, 0])).toBe(false);
      expect(isValidBbox([0, 0, 10])).toBe(false);
      expect(isValidBbox([0, 0, 10, 10, 20])).toBe(false);
    });

    it("should reject non-finite values", () => {
      expect(isValidBbox([0, 0, 10, NaN])).toBe(false);
      expect(isValidBbox([Infinity, 0, 10, 10])).toBe(false);
      // Note: Number(null) === 0, which is finite, so [0, 0, null, 10] passes validation
      // This is expected behavior - null converts to 0
    });
  });
});
