import { state, setSpatialBuilder } from "../state/manager.js";

/**
 * Initializes the Spatial Logic Builder UI and state management
 * @param {HTMLElement} container - The spatial logic tool container element
 * @param {object} handlers - Event handlers { onChange, onRun }
 * @param {object} runner - Optional spatial logic runner instance
 * @returns {object} Builder instance with state and methods
 */
export const initSpatialLogicBuilder = (container, handlers = {}, runner = null) => {
  if (!container) {
    return null;
  }

  // Get all UI elements
  const elements = {
    tabBuilder: document.getElementById("slb-tab-builder"),
    tabTemplates: document.getElementById("slb-tab-templates"),
    builderPanel: document.getElementById("slb-builder-panel"),
    templatesPanel: document.getElementById("slb-templates-panel"),
    find: document.getElementById("slb-find"),
    conditionIntersect: document.getElementById("slb-condition-intersect"),
    conditionWithin: document.getElementById("slb-condition-within"),
    distance: document.getElementById("slb-distance"),
    target: document.getElementById("slb-target"),
    summary: document.getElementById("slb-summary"),
    pointSection: document.getElementById("slb-point-section"),
    addBlockPills: document.querySelectorAll(".slb-add-block-pill"),
    blocksContainer: document.getElementById("slb-blocks-container"),
    clear: document.getElementById("slb-clear"),
    run: document.getElementById("slb-run"),
    templates: document.querySelectorAll(".slb-template")
  };

  // Builder state
  const state = {
    find: "routes",
    condition: "intersect",
    distance: 300,
    target: "selected_point",
    blocks: [] // Additional Include/Exclude/Also Include blocks
  };

  let blockIdCounter = 0;

  // Update summary text
  const updateSummary = () => {
    const findLabel = elements.find.options[elements.find.selectedIndex].text;
    const conditionLabel = state.condition === "intersect" ? "intersecting" : "within";
    const targetLabel = elements.target.options[elements.target.selectedIndex].text;

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

  // Show/hide point picker based on target
  const updatePointSectionVisibility = () => {
    if (elements.pointSection) {
      elements.pointSection.style.display =
        state.target === "selected_point" ? "block" : "none";
    }
  };

  // Toggle condition button styles
  const updateConditionButtons = () => {
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

  // Get operator options based on block type
  const getOperatorOptions = (blockType) => {
    if (blockType === "exclude") {
      return {
        operator: `<option value="operator">Operator</option><option value="mode">Mode</option>`,
        valueSelect: `<select class="block-value-select text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 focus:ring-1 focus:ring-primary">
          <option value="">Select...</option>
          <option value="FirstBus">FirstBus</option>
          <option value="Stagecoach">Stagecoach</option>
          <option value="Bus">Bus</option>
          <option value="Rail">Rail</option>
        </select>`
      };
    } else {
      return {
        operator: `<option value="near_point">Near point</option><option value="touches_boundary">Touches boundary</option><option value="inside_boundary">Inside boundary</option>`,
        valueSelect: `<input type="number" class="block-distance-input w-16 text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 focus:ring-1 focus:ring-primary" value="300" min="0" step="50" /><span class="text-[9px] text-text-tertiary">m</span>`
      };
    }
  };

  // Create a block pill element
  const createBlockPill = (block) => {
    const pill = document.createElement("div");
    pill.className = "flex items-center gap-2 bg-white border border-slate-200 rounded-lg pl-3 pr-2 py-1.5 text-xs group hover:border-primary transition-colors";
    pill.dataset.blockId = block.id;

    const typeColors = {
      include: "bg-green-100 text-green-700",
      exclude: "bg-red-100 text-red-700",
      "also-include": "bg-blue-100 text-blue-700"
    };

    const operatorOpts = getOperatorOptions(block.type);
    const isExclude = block.type === "exclude";

    pill.innerHTML = `
      <select class="block-type-select text-[10px] font-bold px-1.5 py-0.5 rounded ${typeColors[block.type]} border-0 focus:ring-1 focus:ring-primary">
        <option value="include" ${block.type === "include" ? "selected" : ""}>Include</option>
        <option value="also-include" ${block.type === "also-include" ? "selected" : ""}>Also Include</option>
        <option value="exclude" ${block.type === "exclude" ? "selected" : ""}>Exclude</option>
      </select>
      <select class="block-operator-select text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 focus:ring-1 focus:ring-primary">
        ${operatorOpts.operator}
      </select>
      <div class="block-value-container flex items-center gap-1">
        ${operatorOpts.valueSelect}
      </div>
      <button class="block-remove opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded-full">
        <span class="material-symbols-outlined text-[16px] text-red-600">close</span>
      </button>
    `;

    // Event listeners
    const typeSelect = pill.querySelector(".block-type-select");
    const operatorSelect = pill.querySelector(".block-operator-select");
    const valueContainer = pill.querySelector(".block-value-container");
    const removeBtn = pill.querySelector(".block-remove");

    typeSelect.addEventListener("change", (e) => {
      block.type = e.target.value;
      typeSelect.className = `block-type-select text-[10px] font-bold px-1.5 py-0.5 rounded ${typeColors[block.type]} border-0 focus:ring-1 focus:ring-primary`;

      // Update operator options
      const newOpts = getOperatorOptions(block.type);
      operatorSelect.innerHTML = newOpts.operator;
      valueContainer.innerHTML = newOpts.valueSelect;

      updateSummary();
    });

    operatorSelect.addEventListener("change", () => {
      block.operator = operatorSelect.value;
      updateSummary();
    });

    // Handle value changes (works for both input and select)
    valueContainer.addEventListener("input", (e) => {
      if (e.target.classList.contains("block-distance-input")) {
        block.distance = Number(e.target.value);
      }
      updateSummary();
    });

    valueContainer.addEventListener("change", (e) => {
      if (e.target.classList.contains("block-value-select")) {
        block.value = e.target.value;
      }
      updateSummary();
    });

    removeBtn.addEventListener("click", () => {
      removeBlock(block.id);
    });

    // Initialize block data
    block.operator = operatorSelect.value;
    if (isExclude) {
      block.value = valueContainer.querySelector(".block-value-select")?.value || "";
    } else {
      block.distance = Number(valueContainer.querySelector(".block-distance-input")?.value) || 300;
    }

    return pill;
  };

  // Add a new block
  const addBlock = (type = "also-include") => {
    const block = {
      id: ++blockIdCounter,
      type,
      operator: type === "exclude" ? "operator" : "near_point",
      value: "",
      distance: 300
    };

    state.blocks.push(block);
    const pill = createBlockPill(block);
    elements.blocksContainer.appendChild(pill);
    updateSummary();
  };

  // Remove a block
  const removeBlock = (blockId) => {
    state.blocks = state.blocks.filter((b) => b.id !== blockId);
    const pill = elements.blocksContainer.querySelector(`[data-block-id="${blockId}"]`);
    if (pill) {
      pill.remove();
    }
    updateSummary();
  };

  // Compile current state to query object
  const compile = () => {
    const mainBlock = {
      find: state.find,
      relation: state.condition === "within" ? "within" : "intersects",
      target: state.target,
      distance: state.distance
    };

    return {
      find: state.find,
      condition: state.condition,
      distance: state.distance,
      target: state.target,
      relation: state.condition === "within" ? "within" : "intersects",
      blocks: [mainBlock, ...state.blocks.map(b => ({
        type: b.type,
        operator: b.operator,
        value: b.value,
        distance: b.distance
      }))]
    };
  };

  // Tab switching
  const switchTab = (tab) => {
    const isBuilder = tab === "builder";

    // Update tab styles
    const builderActiveClass = "bg-surface text-primary shadow-sm";
    const tabInactiveClass = "text-text-secondary hover:bg-slate-200";

    elements.tabBuilder.className = `flex-1 px-3 py-1 text-xs font-semibold rounded-full transition-all ${isBuilder ? builderActiveClass : tabInactiveClass}`;
    elements.tabTemplates.className = `flex-1 px-3 py-1 text-xs font-semibold rounded-full transition-all ${!isBuilder ? builderActiveClass : tabInactiveClass}`;

    // Show/hide panels
    if (isBuilder) {
      elements.builderPanel.classList.remove("hidden");
      elements.templatesPanel.classList.add("hidden");
    } else {
      elements.builderPanel.classList.add("hidden");
      elements.templatesPanel.classList.remove("hidden");
    }
  };

  // Apply template preset
  const applyTemplate = (templateName) => {
    const templates = {
      proximity: {
        find: "routes",
        condition: "within",
        distance: 300,
        target: "selected_point"
      },
      overlap: {
        find: "routes",
        condition: "intersect",
        distance: 0,
        target: "boundary"
      },
      catchment: {
        find: "stops",
        condition: "within",
        distance: 800,
        target: "selected_point"
      },
      "route-link": {
        find: "routes",
        condition: "within",
        distance: 500,
        target: "selected_point"
      }
    };

    const template = templates[templateName];
    if (template) {
      Object.assign(state, template);

      // Update UI
      elements.find.value = state.find;
      elements.distance.value = state.distance;
      elements.target.value = state.target;

      updateConditionButtons();
      updateSummary();
      updatePointSectionVisibility();

      // Switch back to builder tab
      switchTab("builder");
    }
  };

  // Event listeners
  elements.tabBuilder?.addEventListener("click", () => switchTab("builder"));
  elements.tabTemplates?.addEventListener("click", () => switchTab("templates"));

  elements.find?.addEventListener("change", (e) => {
    state.find = e.target.value;
    updateSummary();
  });

  elements.conditionIntersect?.addEventListener("click", () => {
    state.condition = "intersect";
    updateConditionButtons();
    updateSummary();
  });

  elements.conditionWithin?.addEventListener("click", () => {
    state.condition = "within";
    updateConditionButtons();
    updateSummary();
  });

  elements.distance?.addEventListener("input", (e) => {
    state.distance = Number(e.target.value) || 0;
    updateSummary();
  });

  elements.target?.addEventListener("change", (e) => {
    state.target = e.target.value;
    updateSummary();
    updatePointSectionVisibility();
  });

  // Add block pill buttons
  elements.addBlockPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const blockType = pill.dataset.blockType;
      addBlock(blockType);
    });
  });

  elements.clear?.addEventListener("click", () => {
    // Reset to defaults
    state.find = "routes";
    state.condition = "intersect";
    state.distance = 300;
    state.target = "selected_point";
    state.blocks = [];

    elements.find.value = state.find;
    elements.distance.value = state.distance;
    elements.target.value = state.target;
    elements.blocksContainer.innerHTML = "";

    updateConditionButtons();
    updateSummary();
    updatePointSectionVisibility();

    if (handlers.onChange) {
      handlers.onChange(null);
    }
  });

  elements.run?.addEventListener("click", async () => {
    const compiled = compile();
    builder.compiled = compiled;

    if (handlers.onRun) {
      await handlers.onRun(compiled);
    }
  });

  // Template buttons
  elements.templates.forEach((btn) => {
    btn.addEventListener("click", () => {
      const templateName = btn.dataset.template;
      if (templateName) {
        applyTemplate(templateName);
      }
    });
  });

  // Builder instance
  const builder = {
    container,
    runner,
    state,
    compiled: null,
    setCompiled: (compiled) => {
      builder.compiled = compiled;
      if (handlers.onChange) {
        handlers.onChange(compiled);
      }
    },
    getState: () => ({ ...state }),
    run: async () => {
      const compiled = compile();
      builder.compiled = compiled;
      if (handlers.onRun) {
        return handlers.onRun(compiled);
      }
      return null;
    }
  };

  // Initialize UI
  updateSummary();
  updatePointSectionVisibility();
  updateConditionButtons();

  setSpatialBuilder(builder);
  return builder;
};
