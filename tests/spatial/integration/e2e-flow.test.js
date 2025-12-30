import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSpatialIntegration } from "../../../public/js/spatial/integration/adapter.js";

describe("Spatial E2E Integration Flow", () => {
  let mockDb;
  let mockContainer;
  let mockCallbacks;
  let mockAppState;

  beforeEach(() => {
    // Mock DuckDB with realistic query results
    mockDb = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          toArray: vi.fn().mockReturnValue([
            { spatial_service_id: "route1" },
            { spatial_service_id: "route2" },
            { spatial_service_id: "route3" }
          ])
        }),
        close: vi.fn().mockResolvedValue(undefined)
      })
    };

    // Mock DOM container with all required elements
    mockContainer = document.createElement("div");
    mockContainer.innerHTML = `
      <select id="slb-find">
        <option value="routes" selected>Routes</option>
        <option value="stops">Stops</option>
      </select>
      <button id="slb-condition-intersect" class="active">Intersect</button>
      <button id="slb-condition-within">Within</button>
      <input id="slb-distance" type="number" value="300" />
      <select id="slb-target">
        <option value="selected_point" selected>Selected Point</option>
        <option value="boundary">Boundary</option>
      </select>
      <div id="slb-summary"></div>
      <div id="slb-point-section"></div>
      <div id="slb-blocks-container"></div>
      <button id="slb-clear">Clear</button>
      <button id="slb-run">Run</button>
    `;
    document.body.appendChild(mockContainer);

    // Mock app state with all required fields
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
        serviceIds: [],
        pickingPoint: false
      }
    };

    // Track callback invocations
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

  describe("Complete Query Execution Flow", () => {
    it("should execute full flow from UI to state update", async () => {
      // 1. Initialize system
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      expect(system.service).toBeDefined();
      expect(system.ui).toBeDefined();
      expect(system.builderAdapter).toBeDefined();

      // 2. User clicks Run button
      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Verify execution flow
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith("Running spatial query...");
      expect(mockCallbacks.setSpatialMatchSet).toHaveBeenCalled();

      // 4. Verify results
      const matchSet = mockCallbacks.setSpatialMatchSet.mock.calls[0][0];
      expect(matchSet).toBeInstanceOf(Set);
      expect(matchSet.size).toBe(3);
      expect(Array.from(matchSet)).toEqual(["route1", "route2", "route3"]);

      // 5. Verify UI updates
      expect(mockCallbacks.updateEvidence).toHaveBeenCalled();
      expect(mockCallbacks.updateSpatialPointOverlay).toHaveBeenCalled();
      expect(mockCallbacks.onApplyFilters).toHaveBeenCalledWith({ autoFit: true });

      // 6. Verify status message
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        expect.stringContaining("3 routes found")
      );
    });

    it("should handle UI state changes", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Change distance
      const distanceInput = mockContainer.querySelector("#slb-distance");
      distanceInput.value = "500";
      distanceInput.dispatchEvent(new Event("input"));

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify overlay updates
      expect(mockCallbacks.updateSpatialPointOverlay).toHaveBeenCalled();

      // Verify UI state changed
      const uiState = system.ui.getState();
      expect(uiState.distance).toBe(500);
    });

    it("should handle clear action", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Change some values
      const distanceInput = mockContainer.querySelector("#slb-distance");
      distanceInput.value = "1000";
      distanceInput.dispatchEvent(new Event("input"));

      await new Promise(resolve => setTimeout(resolve, 10));

      // Clear
      const clearButton = mockContainer.querySelector("#slb-clear");
      clearButton.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify state reset
      const uiState = system.ui.getState();
      expect(uiState.distance).toBe(300); // Default value
      expect(uiState.find).toBe("routes"); // Default value
    });
  });

  describe("Point Selection Flow", () => {
    it("should require point before execution", async () => {
      // Remove point from state
      mockAppState.spatialQuery.point = null;

      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Try to run
      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should show error
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        "Please select a point on the map first."
      );
      expect(mockCallbacks.setSpatialMatchSet).not.toHaveBeenCalled();
    });

    it("should execute after point is set", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Run with point
      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should execute successfully
      expect(mockCallbacks.setSpatialMatchSet).toHaveBeenCalled();
      expect(mockCallbacks.onApplyFilters).toHaveBeenCalled();
    });
  });

  describe("Error Handling Flow", () => {
    it("should handle database errors gracefully", async () => {
      const errorDb = {
        connect: vi.fn().mockRejectedValue(new Error("Database connection failed"))
      };

      const system = createSpatialIntegration(errorDb, mockContainer, mockCallbacks);

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should show error
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        expect.stringContaining("failed")
      );
    });

    it("should handle validation errors", async () => {
      // Mock database with empty results (simulating validation issue)
      mockDb.connect = vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          toArray: vi.fn().mockReturnValue([])
        }),
        close: vi.fn().mockResolvedValue(undefined)
      });

      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should complete without crashing
      expect(mockCallbacks.setStatus).toHaveBeenCalled();
    });
  });

  describe("Backward Compatibility", () => {
    it("should expose backward-compatible interface", () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Old interface methods should exist
      expect(typeof system.builderAdapter.getState).toBe("function");
      expect(typeof system.builderAdapter.setCompiled).toBe("function");
      expect(typeof system.builderAdapter.run).toBe("function");

      // Should have compiled property
      expect(system.builderAdapter.compiled).toBeDefined();
    });

    it("should maintain state structure", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      // Change UI state
      const distanceInput = mockContainer.querySelector("#slb-distance");
      distanceInput.value = "500";
      distanceInput.dispatchEvent(new Event("input"));

      await new Promise(resolve => setTimeout(resolve, 10));

      // UI state should be accessible
      const uiState = system.builderAdapter.uiState;
      expect(uiState).toBeDefined();
      expect(uiState.distance).toBe(500);

      // getState should work
      const state = system.builderAdapter.getState();
      expect(state.distance).toBe(500);
    });
  });

  describe("Filter Integration", () => {
    it("should update filters after query execution", async () => {
      const system = createSpatialIntegration(mockDb, mockContainer, mockCallbacks);

      const runButton = mockContainer.querySelector("#slb-run");
      runButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // onApplyFilters should be called to refresh filters
      expect(mockCallbacks.onApplyFilters).toHaveBeenCalledWith({ autoFit: true });

      // Match set should be updated
      expect(mockCallbacks.setSpatialMatchSet).toHaveBeenCalled();
      const matchSet = mockCallbacks.setSpatialMatchSet.mock.calls[0][0];
      expect(matchSet).toBeInstanceOf(Set);
    });
  });
});
