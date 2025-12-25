import { describe, it, expect, beforeEach } from "vitest";
import { buildWhere, buildBboxFilter, buildCombinedWhere } from "../public/js/filters/builder.js";
import { state } from "../public/js/state/manager.js";

describe("Filter Builder", () => {
  beforeEach(() => {
    // Reset state before each test
    state.modeField = "mode";
    state.operatorField = "operatorCode";
    state.operatorFields = ["operatorCode"];
    state.laField = "localAuthority";
    state.laCodesField = "laCodes";
    state.rptField = "rptCode";
    state.rptCodesField = "rptCodes";
    state.serviceNameField = "serviceName";
    state.serviceIdField = "serviceId";
    state.columns = ["serviceName", "serviceId", "operatorName", "mode", "operatorCode"];
    state.timeBandFields = {};
    state.geometryField = null;
    state.spatialReady = false;
  });

  describe("buildWhere", () => {
    it("should return empty WHERE for no filters", () => {
      const result = buildWhere({
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      });
      expect(result).toBe("");
    });

    it("should build WHERE for mode filter", () => {
      const result = buildWhere({
        modes: ["BUS", "COACH"],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("mode");
      expect(result).toContain("BUS");
      expect(result).toContain("COACH");
    });

    it("should build WHERE for operator filter", () => {
      const result = buildWhere({
        modes: [],
        operators: [{ value: "OP1", field: "operatorCode" }],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("operatorCode");
      expect(result).toContain("OP1");
    });

    it("should build WHERE for LA filter", () => {
      const result = buildWhere({
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "S12000033",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("localAuthority");
      expect(result).toContain("S12000033");
    });

    it("should build WHERE for service search", () => {
      const result = buildWhere({
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "X12",
        laValue: "",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("serviceName");
      expect(result).toContain("x12"); // Lowercase because search is case-insensitive
      expect(result).toContain("LOWER");
    });

    it("should combine multiple filters", () => {
      const result = buildWhere({
        modes: ["BUS"],
        operators: [{ value: "OP1", field: "operatorCode" }],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("mode");
      expect(result).toContain("operatorCode");
    });

    it("should handle NONE option value in modes", () => {
      const result = buildWhere({
        modes: ["__NONE__", "BUS"],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      });
      expect(result).toContain("WHERE");
      expect(result).toContain("mode");
      expect(result).toContain("IS NULL");
      expect(result).toContain("BUS");
    });

    it("should sanitize search input and convert to lowercase", () => {
      const result = buildWhere({
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "Test'Service",
        laValue: "",
        rptValue: ""
      });
      // Special characters are stripped, so Test'Service becomes TestService
      expect(result).toContain("testservice");
      expect(result).toContain("LOWER");
      expect(result).toContain("serviceName");
    });
  });

  describe("buildBboxFilter", () => {
    it("should return empty string for null map", () => {
      const result = buildBboxFilter(null);
      expect(result).toBe("");
    });

    it("should return empty string when bboxReady is false", () => {
      state.bboxReady = false;
      const mockMap = { getBounds: () => null };
      const result = buildBboxFilter(mockMap);
      expect(result).toBe("");
    });

    it("should build bbox filter when bboxReady and map has bounds", () => {
      state.bboxReady = true;
      state.bboxFields = { minx: "minLon", miny: "minLat", maxx: "maxLon", maxy: "maxLat" };
      const mockMap = {
        getBounds: () => ({
          getSouthWest: () => ({ lng: -5, lat: 50 }),
          getNorthEast: () => ({ lng: 5, lat: 60 })
        })
      };
      const result = buildBboxFilter(mockMap);
      expect(result).toContain("maxLon");
      expect(result).toContain(">=");
      expect(result).toContain("-5");
    });

    it("should build bbox filter using geometry when spatial is available", () => {
      state.spatialReady = true;
      state.geometryField = "geom";
      const mockMap = {
        getBounds: () => ({
          getSouthWest: () => ({ lng: -5, lat: 50 }),
          getNorthEast: () => ({ lng: 5, lat: 60 })
        })
      };
      const result = buildBboxFilter(mockMap);
      expect(result).toBe('ST_Intersects("geom", ST_MakeEnvelope(-5, 50, 5, 60))');
    });
  });
  describe("buildCombinedWhere", () => {
    const mockMap = {
      getBounds: () => ({
        getSouthWest: () => ({ lng: -5, lat: 50 }),
        getNorthEast: () => ({ lng: 5, lat: 60 })
      })
    };

    beforeEach(() => {
      state.bboxReady = true;
      state.bboxFields = { minx: "minLon", miny: "minLat", maxx: "maxLon", maxy: "maxLat" };
    });

    it("should combine attribute filters and bbox", () => {
      const filters = {
        modes: ["BUS"],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      };
      const result = buildCombinedWhere(filters, mockMap, true);
      expect(result).toContain("WHERE");
      expect(result).toContain("mode");
      expect(result).toContain("AND");
      expect(result).toContain("maxLon");
    });

    it("should handle bbox only when requested", () => {
      const filters = {
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      };
      const result = buildCombinedWhere(filters, mockMap, true);
      expect(result).toContain("WHERE");
      expect(result).toContain("maxLon");
      expect(result).not.toContain("mode");
    });

    it("should handle attribute filters only", () => {
      const filters = {
        modes: ["BUS"],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      };
      const result = buildCombinedWhere(filters, mockMap, false);
      expect(result).toContain("WHERE");
      expect(result).toContain("mode");
      expect(result).not.toContain("maxLon");
    });

    it("should return empty string for no filters", () => {
      const filters = {
        modes: [],
        operators: [],
        timeBands: [],
        serviceSearch: "",
        laValue: "",
        rptValue: ""
      };
      const result = buildCombinedWhere(filters, mockMap, false);
      expect(result).toBe("");
    });
  });
});
