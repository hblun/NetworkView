import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpatialService } from "../../../public/js/spatial/service/spatial-service.js";
import { SpatialQuery } from "../../../public/js/spatial/core/query.js";

describe("Spatial Service", () => {
  let mockDb;
  let mockConn;
  let mockResult;

  beforeEach(() => {
    // Reset mocks before each test
    mockResult = {
      toArray: vi.fn().mockReturnValue([
        { spatial_service_id: "route1" },
        { spatial_service_id: "route2" }
      ])
    };

    mockConn = {
      query: vi.fn().mockResolvedValue(mockResult),
      close: vi.fn().mockResolvedValue(undefined)
    };

    mockDb = {
      connect: vi.fn().mockResolvedValue(mockConn)
    };
  });

  describe("createSpatialService", () => {
    it("should create service instance", () => {
      const service = createSpatialService(mockDb);

      expect(service).toBeDefined();
      expect(typeof service.executeQuery).toBe("function");
      expect(typeof service.cancel).toBe("function");
      expect(typeof service.clearCache).toBe("function");
    });
  });

  describe("executeQuery", () => {
    it("should execute valid query and return results", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({
        find: "routes",
        distance: 500,
        target: "selected_point"
      });
      const context = {
        point: { lat: 55.9533, lng: -3.1883 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      const result = await service.executeQuery(query, context);

      expect(result.success).toBe(true);
      expect(result.serviceIds).toEqual(["route1", "route2"]);
      expect(result.count).toBe(2);
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockConn.query).toHaveBeenCalled();
      expect(mockConn.close).toHaveBeenCalled();
    });

    it("should validate query before execution", async () => {
      const service = createSpatialService(mockDb);
      const invalidQuery = { distance: -1 }; // Invalid
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      const result = await service.executeQuery(invalidQuery, context);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(mockDb.connect).not.toHaveBeenCalled();
    });

    it("should compile query before execution", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      await service.executeQuery(query, context);

      // SQL should contain compiled query elements
      const sqlCall = mockConn.query.mock.calls[0][0];
      expect(sqlCall).toContain("SELECT");
      expect(sqlCall).toContain("spatial_service_id");
    });

    it("should handle database errors gracefully", async () => {
      const errorDb = {
        connect: vi.fn().mockRejectedValue(new Error("DB connection failed"))
      };

      const service = createSpatialService(errorDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      const result = await service.executeQuery(query, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("DB connection failed");
    });

    it("should pass context to SQL builder", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({
        distance: 500,
        target: "selected_point"
      });
      const context = {
        point: { lat: 55.9533, lng: -3.1883 },
        spatialReady: true,
        geometryField: "custom_geom",
        serviceIdField: "serviceId"
      };

      await service.executeQuery(query, context);

      const sqlCall = mockConn.query.mock.calls[0][0];
      // Should use custom_geom field
      expect(sqlCall).toContain("custom_geom");
    });

    it("should handle bbox fallback mode", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: false,
        bboxReady: true,
        bboxFields: {
          minx: "bbox_minx",
          miny: "bbox_miny",
          maxx: "bbox_maxx",
          maxy: "bbox_maxy"
        },
        serviceIdField: "serviceId"
      };

      const result = await service.executeQuery(query, context);

      expect(result.success).toBe(true);
      const sqlCall = mockConn.query.mock.calls[0][0];
      expect(sqlCall).toContain("bbox_");
    });
  });

  describe("cancellation", () => {
    it("should support query cancellation", async () => {
      // Simulate slow query
      const slowConn = {
        query: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve(mockResult), 1000);
          });
        }),
        close: vi.fn().mockResolvedValue(undefined)
      };

      const slowDb = {
        connect: vi.fn().mockResolvedValue(slowConn)
      };

      const service = createSpatialService(slowDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // Start query
      const queryPromise = service.executeQuery(query, context);

      // Cancel immediately
      service.cancel();

      // Should return cancelled result
      const result = await queryPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain("cancelled");
    });

    it("should allow new query after cancellation", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // Cancel (even though nothing is running)
      service.cancel();

      // Should still work
      const result = await service.executeQuery(query, context);
      expect(result.success).toBe(true);
    });
  });

  describe("caching", () => {
    it("should cache compiled queries", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // First execution
      await service.executeQuery(query, context);
      const firstSql = mockConn.query.mock.calls[0][0];

      // Second execution with same query
      await service.executeQuery(query, context);
      const secondSql = mockConn.query.mock.calls[1][0];

      // SQL should be identical (from cache)
      expect(firstSql).toBe(secondSql);
    });

    it("should invalidate cache when query changes", async () => {
      const service = createSpatialService(mockDb);
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // First query
      const query1 = new SpatialQuery({ distance: 500 });
      await service.executeQuery(query1, context);

      // Different query
      const query2 = new SpatialQuery({ distance: 1000 });
      await service.executeQuery(query2, context);

      // SQL should be different
      const firstSql = mockConn.query.mock.calls[0][0];
      const secondSql = mockConn.query.mock.calls[1][0];
      expect(firstSql).not.toBe(secondSql);
    });

    it("should clear cache on demand", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // Execute query (populates cache)
      await service.executeQuery(query, context);

      // Clear cache
      service.clearCache();

      // Execute again (should recompile)
      await service.executeQuery(query, context);

      expect(mockConn.query).toHaveBeenCalledTimes(2);
    });

    it("should limit cache size", async () => {
      const service = createSpatialService(mockDb);
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
      };

      // Execute 60 different queries (exceeds 50 limit)
      for (let i = 0; i < 60; i++) {
        const query = new SpatialQuery({ distance: 100 + i });
        await service.executeQuery(query, context);
      }

      // Cache should have been pruned (implementation detail)
      // We just verify it doesn't crash
      expect(mockConn.query).toHaveBeenCalledTimes(60);
    });
  });

  describe("context requirements", () => {
    it("should require serviceIdField in context", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry"
        // Missing serviceIdField
      };

      const result = await service.executeQuery(query, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("serviceIdField");
    });

    it("should handle missing optional context fields", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: true,
        geometryField: "geometry",
        serviceIdField: "serviceId"
        // No operatorFields, modeField - that's OK
      };

      const result = await service.executeQuery(query, context);

      expect(result.success).toBe(true);
    });
  });

  describe("table name selection", () => {
    it("should use routes_with_bbox view when bbox generated from geometry", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: false,
        bboxReady: true,
        bboxFields: {
          minx: "bbox_minx",  // Generated bbox
          miny: "bbox_miny",
          maxx: "bbox_maxx",
          maxy: "bbox_maxy"
        },
        serviceIdField: "serviceId"
      };

      await service.executeQuery(query, context);

      const sqlCall = mockConn.query.mock.calls[0][0];
      expect(sqlCall).toContain("routes_with_bbox");
    });

    it("should use parquet file when bbox is native", async () => {
      const service = createSpatialService(mockDb);
      const query = new SpatialQuery({ distance: 500 });
      const context = {
        point: { lat: 0, lng: 0 },
        spatialReady: false,
        bboxReady: true,
        bboxFields: {
          minx: "minx",  // Native bbox fields
          miny: "miny",
          maxx: "maxx",
          maxy: "maxy"
        },
        serviceIdField: "serviceId"
      };

      await service.executeQuery(query, context);

      const sqlCall = mockConn.query.mock.calls[0][0];
      expect(sqlCall).toContain("read_parquet");
    });
  });
});
