import { describe, it, expect, beforeEach, vi } from "vitest";
import { createBuilderUI } from "../../../public/js/spatial/ui/builder-ui.js";

describe("Builder UI", () => {
  let container;
  let mockElements;

  beforeEach(() => {
    // Create minimal DOM structure
    container = document.createElement("div");
    container.innerHTML = `
      <select id="slb-find">
        <option value="routes">Routes</option>
        <option value="stops">Stops</option>
      </select>
      <button id="slb-condition-intersect">Intersect</button>
      <button id="slb-condition-within">Within</button>
      <input id="slb-distance" type="number" value="300" />
      <select id="slb-target">
        <option value="selected_point">Selected Point</option>
        <option value="boundary">Boundary</option>
      </select>
      <div id="slb-summary"></div>
      <div id="slb-point-section"></div>
      <div id="slb-blocks-container"></div>
      <button id="slb-clear">Clear</button>
      <button id="slb-run">Run</button>
    `;
    document.body.appendChild(container);

    mockElements = {
      find: document.getElementById("slb-find"),
      conditionIntersect: document.getElementById("slb-condition-intersect"),
      conditionWithin: document.getElementById("slb-condition-within"),
      distance: document.getElementById("slb-distance"),
      target: document.getElementById("slb-target"),
      summary: document.getElementById("slb-summary"),
      pointSection: document.getElementById("slb-point-section"),
      blocksContainer: document.getElementById("slb-blocks-container"),
      clear: document.getElementById("slb-clear"),
      run: document.getElementById("slb-run")
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe("createBuilderUI", () => {
    it("should create UI instance", () => {
      const ui = createBuilderUI(mockElements);

      expect(ui).toBeDefined();
      expect(typeof ui.updateSummary).toBe("function");
      expect(typeof ui.updateConditionButtons).toBe("function");
      expect(typeof ui.getState).toBe("function");
      expect(typeof ui.setState).toBe("function");
    });

    it("should return null if elements not provided", () => {
      const ui = createBuilderUI(null);
      expect(ui).toBeNull();
    });
  });

  describe("state management", () => {
    it("should initialize with default state", () => {
      const ui = createBuilderUI(mockElements);
      const state = ui.getState();

      expect(state.find).toBe("routes");
      expect(state.condition).toBe("intersect");
      expect(state.distance).toBe(300);
      expect(state.target).toBe("selected_point");
      expect(state.blocks).toEqual([]);
    });

    it("should allow setting state", () => {
      const ui = createBuilderUI(mockElements);

      ui.setState({
        find: "stops",
        distance: 500
      });

      const state = ui.getState();
      expect(state.find).toBe("stops");
      expect(state.distance).toBe(500);
      expect(state.target).toBe("selected_point"); // Unchanged
    });

    it("should sync state from DOM on initialization", () => {
      mockElements.find.value = "stops";
      mockElements.distance.value = "1000";
      mockElements.target.value = "boundary";

      const ui = createBuilderUI(mockElements);
      const state = ui.getState();

      expect(state.find).toBe("stops");
      expect(state.distance).toBe(1000);
      expect(state.target).toBe("boundary");
    });
  });

  describe("updateSummary", () => {
    it("should update summary text based on state", () => {
      const ui = createBuilderUI(mockElements);
      ui.updateSummary();

      const summaryText = mockElements.summary.textContent;
      expect(summaryText).toContain("Routes");
      expect(summaryText).toContain("intersecting");
      expect(summaryText).toContain("300m");
      expect(summaryText).toContain("Selected Point");
    });

    it("should include blocks in summary", () => {
      const ui = createBuilderUI(mockElements);
      ui.setState({
        blocks: [
          { type: "exclude", operator: "mode", value: "Rail" }
        ]
      });
      ui.updateSummary();

      const summaryText = mockElements.summary.textContent;
      expect(summaryText).toContain("excluding");
      expect(summaryText).toContain("mode");
      expect(summaryText).toContain("Rail");
    });

    it("should handle within condition", () => {
      const ui = createBuilderUI(mockElements);
      ui.setState({ condition: "within" });
      ui.updateSummary();

      const summaryText = mockElements.summary.textContent;
      expect(summaryText).toContain("within");
    });
  });

  describe("updateConditionButtons", () => {
    it("should style intersect button as active by default", () => {
      const ui = createBuilderUI(mockElements);
      ui.updateConditionButtons();

      expect(mockElements.conditionIntersect.className).toContain("bg-primary");
      expect(mockElements.conditionWithin.className).not.toContain("bg-primary");
    });

    it("should style within button as active when selected", () => {
      const ui = createBuilderUI(mockElements);
      ui.setState({ condition: "within" });
      ui.updateConditionButtons();

      expect(mockElements.conditionWithin.className).toContain("bg-primary");
      expect(mockElements.conditionIntersect.className).not.toContain("bg-primary");
    });
  });

  describe("updatePointSectionVisibility", () => {
    it("should show point section when target is selected_point", () => {
      const ui = createBuilderUI(mockElements);
      ui.setState({ target: "selected_point" });
      ui.updatePointSectionVisibility();

      expect(mockElements.pointSection.style.display).toBe("block");
    });

    it("should hide point section when target is boundary", () => {
      const ui = createBuilderUI(mockElements);
      ui.setState({ target: "boundary" });
      ui.updatePointSectionVisibility();

      expect(mockElements.pointSection.style.display).toBe("none");
    });
  });

  describe("event handling", () => {
    it("should emit onChange when state changes", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      ui.setState({ distance: 500 });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ distance: 500 })
      );
    });

    it("should emit onRun when run button clicked", () => {
      const onRun = vi.fn();
      const ui = createBuilderUI(mockElements, { onRun });

      mockElements.run.click();

      expect(onRun).toHaveBeenCalledWith(
        expect.objectContaining({ find: "routes" })
      );
    });

    it("should emit onChange when distance input changes", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      mockElements.distance.value = "1000";
      mockElements.distance.dispatchEvent(new Event("input"));

      expect(onChange).toHaveBeenCalled();
    });

    it("should emit onChange when find select changes", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      mockElements.find.value = "stops";
      mockElements.find.dispatchEvent(new Event("change"));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ find: "stops" })
      );
    });
  });

  describe("clear", () => {
    it("should reset state to defaults", () => {
      const ui = createBuilderUI(mockElements);

      ui.setState({
        find: "stops",
        distance: 1000,
        blocks: [{ type: "exclude", operator: "mode", value: "Rail" }]
      });

      ui.clear();

      const state = ui.getState();
      expect(state.find).toBe("routes");
      expect(state.distance).toBe(300);
      expect(state.blocks).toEqual([]);
    });

    it("should emit onChange after clearing", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      ui.setState({ distance: 1000 });
      onChange.mockClear();

      ui.clear();

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("addBlock", () => {
    it("should add block to state", () => {
      const ui = createBuilderUI(mockElements);

      ui.addBlock({ type: "exclude", operator: "mode", value: "Rail" });

      const state = ui.getState();
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0]).toMatchObject({
        type: "exclude",
        operator: "mode",
        value: "Rail"
      });
    });

    it("should emit onChange when block added", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      ui.addBlock({ type: "include", operator: "operator", value: "FirstBus" });

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("removeBlock", () => {
    it("should remove block from state", () => {
      const ui = createBuilderUI(mockElements);

      ui.addBlock({ id: "block1", type: "exclude", operator: "mode", value: "Rail" });
      ui.addBlock({ id: "block2", type: "include", operator: "operator", value: "FirstBus" });

      ui.removeBlock("block1");

      const state = ui.getState();
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0].id).toBe("block2");
    });

    it("should emit onChange when block removed", () => {
      const onChange = vi.fn();
      const ui = createBuilderUI(mockElements, { onChange });

      ui.addBlock({ id: "block1", type: "exclude", operator: "mode", value: "Rail" });
      onChange.mockClear();

      ui.removeBlock("block1");

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("render", () => {
    it("should update all UI elements", () => {
      const ui = createBuilderUI(mockElements);

      ui.setState({
        find: "stops",
        condition: "within",
        distance: 500,
        target: "boundary"
      });

      ui.render();

      expect(mockElements.find.value).toBe("stops");
      expect(mockElements.distance.value).toBe("500");
      expect(mockElements.target.value).toBe("boundary");
      expect(mockElements.summary.textContent).toContain("Stops");
      expect(mockElements.summary.textContent).toContain("within");
      expect(mockElements.pointSection.style.display).toBe("none");
    });
  });
});
