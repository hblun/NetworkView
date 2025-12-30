/**
 * Integration adapter for spatial query system
 *
 * Bridges the new refactored modules (Phase 1-4) with the existing app.js.
 * Provides backward-compatible interfaces while using the new architecture.
 */

import { SpatialQuery } from "../core/query.js";
import { compileQuery } from "../core/compiler.js";
import { createSpatialService } from "../service/spatial-service.js";
import { createBuilderUI } from "../ui/builder-ui.js";

/**
 * Build query context object from application state
 * @param {object} appState - Application state object
 * @returns {object} Context object for service layer
 */
export const buildQueryContext = (appState) => {
  return {
    // Required fields
    serviceIdField: appState.serviceIdField,

    // Spatial capabilities
    spatialReady: appState.spatialReady,
    geometryField: appState.geometryField,

    // Bbox fallback
    bboxReady: appState.bboxReady,
    bboxFields: appState.bboxFields,

    // Attribute filtering
    operatorFields: appState.operatorFields,
    modeField: appState.modeField,

    // Post-filtering
    geojsonField: appState.geojsonField,

    // User selection
    point: appState.spatialQuery?.point,
    boundary: null, // Future enhancement

    // Metadata for UI (operators, modes)
    metadata: appState.metadata
  };
};

/**
 * Gather DOM elements for builder UI
 * @param {HTMLElement} container - Container element
 * @returns {object} DOM element references
 */
const gatherBuilderElements = (container) => {
  return {
    find: container.querySelector("#slb-find"),
    conditionIntersect: container.querySelector("#slb-condition-intersect"),
    conditionWithin: container.querySelector("#slb-condition-within"),
    distance: container.querySelector("#slb-distance"),
    target: container.querySelector("#slb-target"),
    summary: container.querySelector("#slb-summary"),
    pointSection: container.querySelector("#slb-point-section"),
    blocksContainer: container.querySelector("#slb-blocks-container"),
    clear: container.querySelector("#slb-clear"),
    run: container.querySelector("#slb-run")
  };
};

/**
 * Create spatial integration system
 *
 * Wires together UI, service, and state management layers.
 * Returns backward-compatible interface for app.js.
 *
 * @param {object} db - DuckDB instance
 * @param {HTMLElement} container - Spatial logic tool container
 * @param {object} callbacks - App callbacks
 * @param {Function} callbacks.getState - Get app state
 * @param {Function} callbacks.setStatus - Set status message
 * @param {Function} callbacks.setSpatialMatchSet - Update spatial matches
 * @param {Function} callbacks.updateEvidence - Update evidence display
 * @param {Function} callbacks.updateSpatialPointOverlay - Update map overlay
 * @param {Function} callbacks.onApplyFilters - Apply filters
 * @returns {object} Spatial system with service, ui, and builderAdapter
 */
export const createSpatialIntegration = (db, container, callbacks) => {
  // Create service layer
  const service = createSpatialService(db);

  // Gather DOM elements
  const elements = gatherBuilderElements(container);

  // Store current UI state for external access
  let currentUIState = null;
  let currentCompiled = null;

  // Create UI layer with handlers
  const ui = createBuilderUI(elements, {
    /**
     * onChange: Triggered when UI state changes
     * Compiles query but does NOT execute
     */
    onChange: (uiState) => {
      // Store current state
      currentUIState = uiState;

      // Compile for backward compatibility
      try {
        const query = new SpatialQuery(uiState);
        const context = buildQueryContext(callbacks.getState());
        currentCompiled = compileQuery(query, context);
      } catch (err) {
        console.warn("[Spatial Integration] Compilation warning:", err);
        currentCompiled = null;
      }

      // Update overlay (visual feedback only)
      callbacks.updateSpatialPointOverlay();
    },

    /**
     * onRun: Triggered when user clicks Run button
     * Executes spatial query via service layer
     */
    onRun: async (uiState) => {
      const appState = callbacks.getState();

      // Validate point selection
      if (!appState.spatialQuery?.point) {
        callbacks.setStatus("Please select a point on the map first.");
        return;
      }

      try {
        callbacks.setStatus("Running spatial query...");

        // Build query and context
        const query = new SpatialQuery(uiState);
        const context = buildQueryContext(appState);

        // Execute via service
        const result = await service.executeQuery(query, context);

        // Handle errors
        if (!result.success) {
          const errorMsg = result.error || result.errors?.join(", ") || "Unknown error";
          callbacks.setStatus(`Spatial query failed: ${errorMsg}`);
          return;
        }

        // Update state
        callbacks.setSpatialMatchSet(new Set(result.serviceIds));
        callbacks.setStatus(`Spatial query: ${result.count} routes found.`);

        // Update UI
        callbacks.updateEvidence();
        callbacks.updateSpatialPointOverlay();
        callbacks.onApplyFilters({ autoFit: true });

      } catch (err) {
        callbacks.setStatus(`Spatial query failed: ${err.message}`);
        console.error("[Spatial Integration] Query error:", err);
      }
    }
  });

  // Create backward-compatible adapter interface
  // This mimics the old builder.js interface that app.js expects
  const builderAdapter = {
    // Compiled query (for backward compatibility)
    get compiled() {
      return currentCompiled;
    },

    // UI state (current query parameters)
    get uiState() {
      return currentUIState;
    },

    // Get current UI state
    getState() {
      return ui.getState();
    },

    // Set compiled state (for backward compatibility)
    setCompiled(compiled) {
      currentCompiled = compiled;
    },

    // Execute query (backward compatible method)
    async run() {
      if (currentUIState) {
        // Trigger onRun handler
        await ui.render(); // Ensure UI is current
        // Note: Actual execution happens through onRun handler
      }
    }
  };

  return {
    service,
    ui,
    builderAdapter
  };
};

/**
 * Execute spatial query from point selection or dragging
 *
 * Helper function for map event handlers.
 *
 * @param {object} service - Spatial service instance
 * @param {object} uiState - Current UI state
 * @param {Function} getState - Get app state
 * @param {object} callbacks - Update callbacks
 * @returns {Promise<void>}
 */
export const executeFromPoint = async (service, uiState, getState, callbacks) => {
  const appState = getState();

  if (!uiState || !appState.spatialQuery?.point) {
    return;
  }

  try {
    const query = new SpatialQuery(uiState);
    const context = buildQueryContext(appState);
    const result = await service.executeQuery(query, context);

    if (result.success) {
      callbacks.setSpatialMatchSet(new Set(result.serviceIds));
      callbacks.onApplyFilters({ autoFit: false });
    }
  } catch (err) {
    console.error("[Spatial Integration] Point execution error:", err);
  }
};
