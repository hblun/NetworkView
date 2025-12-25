import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../public/app.js"), "utf8");

const expectNoMatch = (pattern, message) => {
  expect(pattern.test(appSource)).toBe(false);
  if (message && pattern.test(appSource)) {
    throw new Error(message);
  }
};

describe("app wiring", () => {
  it("passes required args to initDuckDb", () => {
    expect(appSource).toMatch(/initDuckDb\(\s*state\.config\s*,\s*duckdb\s*,\s*setStatus\s*\)/);
    expectNoMatch(/initDuckDb\(\s*state\.config\s*\)/, "initDuckDb called without duckdb/setStatus");
  });

  it("threads filter state into module helpers", () => {
    expect(appSource).toMatch(/getSelectedOperators\(elements\.operatorFilter\)/);
    expect(appSource).toMatch(/getSelectedTimeBands\(elements\.timeBandFilter\)/);
    expect(appSource).toMatch(/getServiceSearchValue\(elements\.serviceSearch\)/);

    expectNoMatch(/buildWhere\(\s*\)/, "buildWhere called without filters");
    expectNoMatch(/buildMapFilter\(\s*\)/, "buildMapFilter called without filters");
    expectNoMatch(/hasAttributeFilters\(\s*\)/, "hasAttributeFilters called without filters");
  });

  it("does not use legacy table wiring", () => {
    expectNoMatch(/renderTable\(elements,\s*getSelectedServiceId,\s*setStatus,\s*updateEvidence\s*\)/, "renderTable missing filters arg");
    expectNoMatch(/ensureTablePageFor\(\s*\d+\s*\)/, "ensureTablePageFor called without dependencies");
    expectNoMatch(/queryTable\(\s*state\.tableLimit,\s*0\s*\)/, "queryTable missing filters arg");
  });

  it("binds export handlers with dependencies", () => {
    expectNoMatch(/addEventListener\(\s*["']click["'],\s*onDownloadGeojson\s*\)/, "GeoJSON export handler missing deps");
    expectNoMatch(/addEventListener\(\s*["']click["'],\s*onDownloadCsv\s*\)/, "CSV export handler missing deps");
  });
});
