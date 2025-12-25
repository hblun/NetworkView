import { describe, it, expect } from "vitest";
import { buildMapFilter } from "../public/js/map/utils.js";

describe("Map filter builder", () => {
  it("builds LA filter using string match", () => {
    const filters = { modes: [], operators: [], laValue: "S12000033", rptValue: "" };
    const tileFields = { laCode: "la_code" };
    const result = buildMapFilter(filters, tileFields);
    expect(result).toEqual([
      "all",
      ["==", ["to-string", ["get", "la_code"]], "S12000033"]
    ]);
  });

  it("builds RPT filter using string match", () => {
    const filters = { modes: [], operators: [], laValue: "", rptValue: "HIT" };
    const tileFields = { rptCode: "rpt_code" };
    const result = buildMapFilter(filters, tileFields);
    expect(result).toEqual([
      "all",
      ["==", ["to-string", ["get", "rpt_code"]], "HIT"]
    ]);
  });
});
