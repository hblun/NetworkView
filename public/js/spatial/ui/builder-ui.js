/**
 * Spatial query builder UI - presentation layer
 *
 * Handles DOM manipulation and user interactions only.
 * No business logic - delegates to service layer via events.
 */

/**
 * Create a builder UI instance
 * @param {object} elements - DOM element references
 * @param {object} handlers - Event handlers { onChange, onRun }
 * @returns {object|null} UI instance or null if elements not provided
 */
export const createBuilderUI = (elements, handlers = {}) => {
  if (!elements) {
    return null;
  }

  // UI state (what the user sees/interacts with)
  const state = {
    find: "routes",
    condition: "intersect",
    distance: 300,
    target: "selected_point",
    blocks: []
  };

  let blockIdCounter = 0;

  // Sync state from DOM on initialization
  const syncFromDOM = () => {
    if (elements.find) {
      state.find = elements.find.value;
    }
    if (elements.distance) {
      state.distance = parseInt(elements.distance.value, 10);
    }
    if (elements.target) {
      state.target = elements.target.value;
    }
    // Condition determined by which button is active (handled separately)
  };

  /**
   * Update summary text based on current state
   */
  const updateSummary = () => {
    if (!elements.summary) return;

    const findLabel = state.find === "routes" ? "Routes" : "Stops";
    const conditionLabel = state.condition === "intersect" ? "intersecting" : "within";
    const targetLabel = state.target === "selected_point" ? "Selected Point" : "Boundary";

    let summary = `${findLabel} ${conditionLabel} ${state.distance}m of ${targetLabel}`;

    // Add block descriptions
    state.blocks.forEach((block) => {
      const typeLabel = block.type === "include" ? "also including those" :
                       block.type === "exclude" ? "excluding those" :
                       "also including those";

      let operatorLabel = "";
      if (block.operator === "near_point") {
        operatorLabel = `near point (${block.distance || 300}m)`;
      } else if (block.operator === "touches_boundary") {
        operatorLabel = "touching boundary";
      } else if (block.operator === "inside_boundary") {
        operatorLabel = "inside boundary";
      } else if (block.operator === "operator") {
        operatorLabel = `with operator = ${block.value || "..."}`;
      } else if (block.operator === "mode") {
        operatorLabel = `with mode = ${block.value || "..."}`;
      }

      if (operatorLabel) {
        summary += `, ${typeLabel} ${operatorLabel}`;
      }
    });

    elements.summary.textContent = summary;
  };

  /**
   * Update condition button styling
   */
  const updateConditionButtons = () => {
    if (!elements.conditionIntersect || !elements.conditionWithin) return;

    const activeClasses = "bg-primary text-white border-primary shadow-sm";
    const inactiveClasses = "bg-slate-50 text-text-main border-slate-200 hover:bg-slate-100";

    if (state.condition === "intersect") {
      elements.conditionIntersect.className = `flex-1 text-xs font-bold px-2 py-1.5 rounded border ${activeClasses}`;
      elements.conditionWithin.className = `flex-1 text-xs font-bold px-2 py-1.5 rounded border ${inactiveClasses}`;
    } else {
      elements.conditionIntersect.className = `flex-1 text-xs font-bold px-2 py-1.5 rounded border ${inactiveClasses}`;
      elements.conditionWithin.className = `flex-1 text-xs font-bold px-2 py-1.5 rounded border ${activeClasses}`;
    }
  };

  /**
   * Update point section visibility
   */
  const updatePointSectionVisibility = () => {
    if (!elements.pointSection) return;

    elements.pointSection.style.display =
      state.target === "selected_point" ? "block" : "none";
  };

  /**
   * Emit onChange event with current state
   */
  const emitChange = () => {
    if (handlers.onChange) {
      handlers.onChange({ ...state });
    }
  };

  /**
   * Emit onRun event with current state
   */
  const emitRun = () => {
    if (handlers.onRun) {
      handlers.onRun({ ...state });
    }
  };

  /**
   * Render all UI elements based on state
   */
  const render = () => {
    // Update form elements
    if (elements.find) {
      elements.find.value = state.find;
    }
    if (elements.distance) {
      elements.distance.value = state.distance.toString();
    }
    if (elements.target) {
      elements.target.value = state.target;
    }

    // Update UI components
    updateSummary();
    updateConditionButtons();
    updatePointSectionVisibility();
  };

  // Event listeners
  if (elements.find) {
    elements.find.addEventListener("change", (e) => {
      state.find = e.target.value;
      updateSummary();
      emitChange();
    });
  }

  if (elements.distance) {
    elements.distance.addEventListener("input", (e) => {
      state.distance = parseInt(e.target.value, 10) || 0;
      updateSummary();
      emitChange();
    });
  }

  if (elements.target) {
    elements.target.addEventListener("change", (e) => {
      state.target = e.target.value;
      updatePointSectionVisibility();
      updateSummary();
      emitChange();
    });
  }

  if (elements.conditionIntersect) {
    elements.conditionIntersect.addEventListener("click", () => {
      state.condition = "intersect";
      updateConditionButtons();
      updateSummary();
      emitChange();
    });
  }

  if (elements.conditionWithin) {
    elements.conditionWithin.addEventListener("click", () => {
      state.condition = "within";
      updateConditionButtons();
      updateSummary();
      emitChange();
    });
  }

  if (elements.run) {
    elements.run.addEventListener("click", () => {
      emitRun();
    });
  }

  if (elements.clear) {
    elements.clear.addEventListener("click", () => {
      // Reset to defaults
      state.find = "routes";
      state.condition = "intersect";
      state.distance = 300;
      state.target = "selected_point";
      state.blocks = [];

      render();
      emitChange();
    });
  }

  // Initialize
  syncFromDOM();
  render();

  // Public API
  return {
    /**
     * Get current UI state
     * @returns {object} Current state
     */
    getState() {
      return { ...state };
    },

    /**
     * Set UI state (partial update)
     * @param {object} newState - State to merge
     */
    setState(newState) {
      Object.assign(state, newState);
      emitChange();
    },

    /**
     * Update summary text
     */
    updateSummary,

    /**
     * Update condition buttons
     */
    updateConditionButtons,

    /**
     * Update point section visibility
     */
    updatePointSectionVisibility,

    /**
     * Clear state to defaults
     */
    clear() {
      state.find = "routes";
      state.condition = "intersect";
      state.distance = 300;
      state.target = "selected_point";
      state.blocks = [];

      render();
      emitChange();
    },

    /**
     * Add a block to the query
     * @param {object} block - Block to add
     */
    addBlock(block) {
      const blockWithId = {
        ...block,
        id: block.id || `block-${blockIdCounter++}`
      };
      state.blocks.push(blockWithId);
      updateSummary();
      emitChange();
    },

    /**
     * Remove a block from the query
     * @param {string} blockId - ID of block to remove
     */
    removeBlock(blockId) {
      state.blocks = state.blocks.filter(b => b.id !== blockId);
      updateSummary();
      emitChange();
    },

    /**
     * Render all UI elements
     */
    render
  };
};
