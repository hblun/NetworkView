import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildQueryContext, createSpatialIntegration, executeFromPoint } from "../../../public/js/spatial/integration/adapter.js";

describe("Spatial Integration Adapter", () => {
  let mockDb;
  let mockContainer;
  let mockCallbacks;
  let mockAppState;

  beforeEach(() => {
    // Mock DuckDB
    mockDb = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          toArray: vi.fn().mockReturnValue([
            { spatial_service_id: "route1" },
            { spatial_service_id: "route2" }
          ])
        }),
        close: vi.fn().mockResolvedValue(undefined)
      })
    };

    // Mock DOM container
    mockContainer = document.createElement("div");
    mockContainer.innerHTML = `
      <select id="slb-find"><option value="routes">Routes</option></select>
      <button id="slb-condition-intersect">Intersect</button>
      <button id="slb-condition-within">Within</button>
      <input id="slb-distance" type="number" value="300" />
      <select id="slb-target"><option value="selected_point">Selected Point</option></select>
      <div id="slb-summary"></div>
      <div id="slb-point-section"></div>
      <div id="slb-blocks-container"></div>
      <button id="slb-clear">Clear</button>
      <button id="slb-run">Run</button>
    `;
    document.body.appendChild(mockContainer);

    // Mock app state
    mockAppState = {
      serviceIdField: "serviceId",
      spatialReady: true,
      geometryField: "geometry",
      bboxReady: false,
      bboxFields: null,
      operatorFields: ["operator"],
      modeField: "mode",
      geojsonField: "geojson",
      spatialQuery: {
        point: { lat: 55.9533, lng: -3.1883 },
        active: false,
        serviceIds: []
      }
    };

    // Mock callbacks
    mockCallbacks = {
      getState: vi.fn().mockReturnValue(mockAppState),
      setStatus: vi.fn(),
      setSpatialMatchSet: vi.fn(),
      updateEvidence: vi.fn(),
      updateSpatialPointOverlay: vi.fn(),
      onApplyFilters: vi.fn()
    };
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
  });

  describe("buildQueryContext", () => {
    it("should build context from app state", () => {
      const context = buildQueryContext(mockAppState);

      expect(context.serviceIdField).toBe("serviceId");
      expect(context.spatialReady).toBe(true);
      expect(context.geometryField).toBe("geometry");
      expect(context.point).toEqual({ lat: 55.9533, lng: -3.1883 });
    });

    it("should include all spatial capability fields", () => {
      const context = buildQueryContext(mockAppState);

      expect(context).toHaveProperty("spatialReady");
      expect(context).toHaveProperty("geometryField");
      expect(context).toHaveProperty("bboxReady");
      expect(context).toHaveProperty("bboxFields");
    });

    it("should include attribute filtering fields", () => {
      const context = buildQueryContext(mockAppState);

      expect(context.operatorFields).toEqual(["operator"]);
      expect(context.modeField).toBe("mode");
    });

    it("should handle missing point gracefully", () => {
      mockAppState.spatialQuery.point = null;
      const context = buildQueryContext(mockAppState);

      expect(context.point).toBeNull();
    });

    it("should set boundary to null (future enhancement)", () => {
      const context = buildQueryContext(mockAppState);

      expect(context.boundary).toBeNull();
    });
  });

  describe("createSpatialIntegration", () => {
    it("should create integration system", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(system).toBeDefined();
      expect(system.service).toBeDefined();
      expect(system.ui).toBeDefined();
      expect(system.builderAdapter).toBeDefined();
    });

    it("should create service instance", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(typeof system.service.executeQuery).toBe("function");
      expect(typeof system.service.cancel).toBe("function");
      expect(typeof system.service.clearCache).toBe("function");
    });

    it("should create UI instance", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(typeof system.ui.getState).toBe("function");
      expect(typeof system.ui.setState).toBe("function");
      expect(typeof system.ui.updateSummary).toBe("function");
    });

    it("should create backward-compatible builder adapter", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(typeof system.builderAdapter.getState).toBe("function");
      expect(typeof system.builderAdapter.setCompiled).toBe("function");
      expect(typeof system.builderAdapter.run).toBe("function");
    });

    it("should wire UI onChange to update overlay", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Trigger UI change
      const distanceInput = mockContainer.querySelector("#slb-distance");
      distanceInput.value = "500";
      distanceInput.dispatchEvent(new Event("input"));

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.updateSpatialPointOverlay).toHaveBeenCalled();
    });

    it("should wire UI onRun to execute query", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Trigger run
      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCallbacks.setStatus).toHaveBeenCalledWith("Running spatial query...");
      expect(mockCallbacks.setSpatialMatchSet).toHaveBeenCalled();
      expect(mockCallbacks.updateEvidence).toHaveBeenCalled();
      expect(mockCallbacks.onApplyFilters).toHaveBeenCalledWith({ autoFit: true });
    });

    it("should handle missing point in onRun", async () => {
      mockAppState.spatialQuery.point = null;
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        "Please select a point on the map first."
      );
      expect(mockCallbacks.setSpatialMatchSet).not.toHaveBeenCalled();
    });
  });

  describe("builderAdapter", () => {
    it("should expose compiled property", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(system.builderAdapter.compiled).toBeDefined();
    });

    it("should expose uiState property", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Trigger UI change to populate uiState
      const distanceInput = mockContainer.querySelector("#slb-distance");
      distanceInput.value = "500";
      distanceInput.dispatchEvent(new Event("input"));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(system.builderAdapter.uiState).toBeDefined();
      expect(system.builderAdapter.uiState.distance).toBe(500);
    });

    it("should allow getting current state", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      const state = system.builderAdapter.getState();

      expect(state).toBeDefined();
      expect(state.find).toBe("routes");
      expect(state.distance).toBe(300);
    });

    it("should allow setting compiled state", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      const compiled = { test: "data" };
      system.builderAdapter.setCompiled(compiled);

      expect(system.builderAdapter.compiled).toEqual(compiled);
    });
  });

  describe("executeFromPoint", () => {
    it("should execute query from point selection", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);
      const uiState = { find: "routes", distance: 300, target: "selected_point" };

      await executeFromPoint(
        system.service,
        uiState,
        mockCallbacks.getState,
        mockCallbacks
      );

      expect(mockCallbacks.setSpatialMatchSet).toHaveBeenCalled();
      expect(mockCallbacks.onApplyFilters).toHaveBeenCalledWith({ autoFit: false });
    });

    it("should handle missing uiState gracefully", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      await executeFromPoint(
        system.service,
        null,
        mockCallbacks.getState,
        mockCallbacks
      );

      expect(mockCallbacks.setSpatialMatchSet).not.toHaveBeenCalled();
    });

    it("should handle missing point gracefully", async () => {
      mockAppState.spatialQuery.point = null;
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);
      const uiState = { find: "routes", distance: 300 };

      await executeFromPoint(
        system.service,
        uiState,
        mockCallbacks.getState,
        mockCallbacks
      );

      expect(mockCallbacks.setSpatialMatchSet).not.toHaveBeenCalled();
    });

    it("should handle query errors gracefully", async () => {
      const errorDb = {
        connect: vi.fn().mockRejectedValue(new Error("DB error"))
      };
      const system = createSpatialIntegration(errorDb, mockContainer, mockCallbacks);
      const uiState = { find: "routes", distance: 300 };

      // Should not throw
      await expect(
        executeFromPoint(system.service, uiState, mockCallbacks.getState, mockCallbacks)
      ).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle service execution errors", async () => {
      const errorDb = {
        connect: vi.fn().mockRejectedValue(new Error("Connection failed"))
      };
      const system = createSpatialIntegration(errorDb, mockContainer, mockCallbacks);

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        expect.stringContaining("failed")
      );
    });

    it("should handle validation errors", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Modify mockDb to return validation error
      mockDb.connect = vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          toArray: vi.fn().mockReturnValue([])
        }),
        close: vi.fn().mockResolvedValue(undefined)
      });

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should complete without crashing
      expect(mockCallbacks.setStatus).toHaveBeenCalled();
    });
  });
});
