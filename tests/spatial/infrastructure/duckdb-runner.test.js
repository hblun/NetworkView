import { describe, it, expect, vi } from "vitest";
import { createDuckDBRunner } from "../../../public/js/spatial/infrastructure/duckdb-runner.js";

describe("DuckDB Runner Infrastructure", () => {
  describe("createDuckDBRunner", () => {
    it("should create runner instance", () => {
      const mockDb = {};
      const runner = createDuckDBRunner(mockDb);

      expect(runner).toBeDefined();
      expect(typeof runner.execute).toBe("function");
    });
  });

  describe("execute", () => {
    it("should execute query and return service IDs", async () => {
      const mockRows = [
        { spatial_service_id: "123" },
        { spatial_service_id: "456" },
        { spatial_service_id: "789" }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId"
      });

      expect(result.serviceIds).toEqual(["123", "456", "789"]);
      expect(result.count).toBe(3);
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockConn.query).toHaveBeenCalledWith("SELECT * FROM routes");
      expect(mockConn.close).toHaveBeenCalled();
    });

    it("should handle uppercase column names", async () => {
      const mockRows = [
        { SPATIAL_SERVICE_ID: "abc" },
        { SPATIAL_SERVICE_ID: "def" }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId"
      });

      expect(result.serviceIds).toEqual(["abc", "def"]);
    });

    it("should filter out null service IDs", async () => {
      const mockRows = [
        { spatial_service_id: "123" },
        { spatial_service_id: null },
        { spatial_service_id: "456" },
        { spatial_service_id: undefined }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId"
      });

      expect(result.serviceIds).toEqual(["123", "456"]);
      expect(result.count).toBe(2);
    });

    it("should throw error if database connection fails", async () => {
      const mockDb = {
        connect: vi.fn().mockRejectedValue(new Error("Connection failed"))
      };

      const runner = createDuckDBRunner(mockDb);

      await expect(
        runner.execute("SELECT * FROM routes", { serviceIdField: "serviceId" })
      ).rejects.toThrow("Connection failed");
    });

    it("should throw error if query fails", async () => {
      const mockConn = {
        query: vi.fn().mockRejectedValue(new Error("Query error")),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);

      await expect(
        runner.execute("INVALID SQL", { serviceIdField: "serviceId" })
      ).rejects.toThrow("Query error");

      // Should still close connection on error
      expect(mockConn.close).toHaveBeenCalled();
    });
  });

  describe("post-filtering", () => {
    it("should post-filter by distance when needsPostFilter is true", async () => {
      const mockRows = [
        {
          spatial_service_id: "route1",
          geojson_data: JSON.stringify({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-3.1883, 55.9533], // Edinburgh
                [-3.1900, 55.9550]
              ]
            }
          })
        },
        {
          spatial_service_id: "route2",
          geojson_data: JSON.stringify({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-3.5, 56.0], // Far away
                [-3.6, 56.1]
              ]
            }
          })
        }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId",
        needsPostFilter: true,
        point: { lat: 55.9533, lng: -3.1883 },
        distance: 100, // 100 meters
        geojsonField: "geojson"
      });

      // Only route1 should pass (route2 is too far)
      expect(result.serviceIds).toEqual(["route1"]);
      expect(result.count).toBe(1);
    });

    it("should skip post-filtering if needsPostFilter is false", async () => {
      const mockRows = [
        { spatial_service_id: "route1" },
        { spatial_service_id: "route2" }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId",
        needsPostFilter: false
      });

      // All routes should be returned (no post-filtering)
      expect(result.serviceIds).toEqual(["route1", "route2"]);
      expect(result.count).toBe(2);
    });

    it("should handle Point geometry in post-filtering", async () => {
      const mockRows = [
        {
          spatial_service_id: "stop1",
          geojson_data: JSON.stringify({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-3.1884, 55.9534] // Very close to target
            }
          })
        }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM stops", {
        serviceIdField: "serviceId",
        needsPostFilter: true,
        point: { lat: 55.9533, lng: -3.1883 },
        distance: 50, // 50 meters
        geojsonField: "geojson"
      });

      expect(result.serviceIds).toEqual(["stop1"]);
    });

    it("should skip rows with invalid geojson during post-filtering", async () => {
      const mockRows = [
        {
          spatial_service_id: "route1",
          geojson_data: "invalid json"
        },
        {
          spatial_service_id: "route2",
          geojson_data: JSON.stringify({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-3.1884, 55.9534]
            }
          })
        }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM routes", {
        serviceIdField: "serviceId",
        needsPostFilter: true,
        point: { lat: 55.9533, lng: -3.1883 },
        distance: 100,
        geojsonField: "geojson"
      });

      // route1 skipped due to invalid JSON, route2 included
      expect(result.serviceIds).toEqual(["route2"]);
    });
  });

  describe("geometry intersection utilities", () => {
    it("should calculate haversine distance correctly", async () => {
      // This is tested indirectly through post-filtering
      // Direct test would require exposing the utility function
      // For now, verify through integration test

      const mockRows = [
        {
          spatial_service_id: "point1",
          geojson_data: JSON.stringify({
            type: "Point",
            coordinates: [-3.1883, 55.9533]
          })
        }
      ];

      const mockResult = {
        toArray: () => mockRows
      };

      const mockConn = {
        query: vi.fn().mockResolvedValue(mockResult),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: vi.fn().mockResolvedValue(mockConn)
      };

      const runner = createDuckDBRunner(mockDb);
      const result = await runner.execute("SELECT * FROM points", {
        serviceIdField: "serviceId",
        needsPostFilter: true,
        point: { lat: 55.9533, lng: -3.1883 }, // Same point
        distance: 1, // 1 meter tolerance
        geojsonField: "geojson"
      });

      // Same point should be within 1 meter
      expect(result.serviceIds).toEqual(["point1"]);
    });
  });
});
