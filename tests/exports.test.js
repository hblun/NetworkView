import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCsvColumns, confirmLargeExport, downloadFile } from "../public/js/exports/handlers.js";
import { state } from "../public/js/state/manager.js";

describe("Export Handlers", () => {
  describe("getCsvColumns", () => {
    it("should return all columns except geometry columns", () => {
      state.columns = ["serviceName", "mode", "geometry", "geojson", "operatorCode"];
      const result = getCsvColumns();
      expect(result).toEqual(["serviceName", "mode", "operatorCode"]);
    });

    it("should handle empty columns", () => {
      state.columns = [];
      const result = getCsvColumns();
      expect(result).toEqual([]);
    });

    it("should exclude geom column", () => {
      state.columns = ["serviceName", "geom", "mode"];
      const result = getCsvColumns();
      expect(result).toEqual(["serviceName", "mode"]);
    });

    it("should handle null columns", () => {
      state.columns = null;
      const result = getCsvColumns();
      expect(result).toEqual([]);
    });
  });

  describe("confirmLargeExport", () => {
    it("should return true for small exports", async () => {
      const result = await confirmLargeExport(100, "csv");
      expect(result).toBe(true);
    });

    it("should prompt for large exports", async () => {
      global.confirm = vi.fn(() => true);
      const result = await confirmLargeExport(50000, "csv");
      expect(global.confirm).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should return false if user cancels", async () => {
      global.confirm = vi.fn(() => false);
      const result = await confirmLargeExport(50000, "csv");
      expect(result).toBe(false);
    });
  });

  describe("downloadFile", () => {
    it("should create blob and trigger download", () => {
      global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      global.URL.revokeObjectURL = vi.fn();

      const mockLink = {
        click: vi.fn(),
        href: "",
        download: ""
      };
      document.createElement = vi.fn(() => mockLink);

      downloadFile("test content", "test.csv", "text/csv");

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toBe("test.csv");
    });
  });
});
