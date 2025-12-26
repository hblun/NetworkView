import { setSpatialBuilder } from "../state/manager.js";

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
    clear: document.getElementById("slb-clear"),
    run: document.getElementById("slb-run"),
    templates: document.querySelectorAll(".slb-template")
  };

  // Builder state
  const state = {
    find: "routes",
    condition: "intersect",
    distance: 300,
    target: "selected_point"
  };

  // Update summary text
  const updateSummary = () => {
    const findLabel = elements.find.options[elements.find.selectedIndex].text;
    const conditionLabel = state.condition === "intersect" ? "intersecting" : "within";
    const targetLabel = elements.target.options[elements.target.selectedIndex].text;

    const summary = `${findLabel} ${conditionLabel} ${state.distance}m of ${targetLabel}`;
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

  // Compile current state to query object
  const compile = () => {
    return {
      find: state.find,
      condition: state.condition,
      distance: state.distance,
      target: state.target,
      relation: state.condition === "within" ? "within" : "intersects",
      blocks: [{
        find: state.find,
        relation: state.condition === "within" ? "within" : "intersects",
        target: state.target,
        distance: state.distance
      }]
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

  elements.clear?.addEventListener("click", () => {
    // Reset to defaults
    state.find = "routes";
    state.condition = "intersect";
    state.distance = 300;
    state.target = "selected_point";

    elements.find.value = state.find;
    elements.distance.value = state.distance;
    elements.target.value = state.target;

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
