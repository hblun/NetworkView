const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`;
const HEADLESS = process.env.HEADLESS !== "false";

const waitForServer = async (url, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch (err) {
      // ignore until timeout
    }
    await delay(250);
  }
  return false;
};

const getSelectedOptions = async (page, selector) => {
  return page.$eval(selector, (sel) => Array.from(sel.selectedOptions).map((opt) => opt.value));
};

const getSelectableOptions = async (page, selector) => {
  return page.$eval(selector, (sel) =>
    Array.from(sel.options)
      .map((opt) => opt.value)
      .filter((v) => v && v !== "__NONE__")
  );
};

const run = async () => {
  const server = spawn(
    "python3",
    ["-m", "tools.dev_server", "--public-dir", "public", "--data-dir", "data", "--port", String(PORT)],
    { stdio: "inherit" }
  );

  let browser;
  try {
    const ready = await waitForServer(BASE_URL);
    if (!ready) {
      throw new Error(`Dev server not reachable at ${BASE_URL}`);
    }

    browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 50 });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message || String(err));
    });

    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    await page.waitForSelector("#mode-filter");
    await page.waitForSelector("#operator-filter");
    await page.waitForSelector("#la-filter");
    await page.waitForSelector("#rpt-filter");
    await page.waitForSelector("#apply-filters");
    await page.waitForSelector("#clear-filters");

    await page.waitForFunction(() => document.querySelector("#mode-filter")?.options?.length > 1);
    await page.waitForFunction(() => document.querySelector("#operator-filter")?.options?.length > 0);
    await page.waitForFunction(() => document.querySelector("#la-filter")?.options?.length > 0);
    await page.waitForFunction(() => document.querySelector("#rpt-filter")?.options?.length > 0);

    const modeOptions = await getSelectableOptions(page, "#mode-filter");
    if (!modeOptions.length) {
      throw new Error("No selectable mode options found.");
    }

    for (const mode of modeOptions) {
      await page.selectOption("#mode-filter", [mode]);
      await page.click("#apply-filters");
      await page.waitForTimeout(1200);
      const selectedModes = await getSelectedOptions(page, "#mode-filter");
      if (!selectedModes.includes(mode)) {
        throw new Error(`Mode ${mode} not selected after apply.`);
      }
      await page.click("#clear-filters");
      await page.waitForTimeout(600);
    }

    const operatorOptions = await getSelectableOptions(page, "#operator-filter");
    if (!operatorOptions.length) {
      throw new Error("No selectable operator options found.");
    }
    await page.selectOption("#operator-filter", [operatorOptions[0]]);
    await page.click("#apply-filters");
    await page.waitForTimeout(1200);
    const selectedOperators = await getSelectedOptions(page, "#operator-filter");
    if (!selectedOperators.includes(operatorOptions[0])) {
      throw new Error("Operator selection not retained after apply.");
    }
    await page.click("#clear-filters");
    await page.waitForTimeout(600);

    const laOptions = await getSelectableOptions(page, "#la-filter");
    if (!laOptions.length) {
      throw new Error("No selectable LA options found.");
    }
    await page.selectOption("#la-filter", laOptions[0]);
    await page.click("#apply-filters");
    await page.waitForTimeout(1200);
    const selectedLA = await getSelectedOptions(page, "#la-filter");
    if (!selectedLA.includes(laOptions[0])) {
      throw new Error("LA selection not retained after apply.");
    }
    await page.click("#clear-filters");
    await page.waitForTimeout(600);

    const rptOptions = await getSelectableOptions(page, "#rpt-filter");
    if (!rptOptions.length) {
      throw new Error("No selectable RPT options found.");
    }
    await page.selectOption("#rpt-filter", rptOptions[0]);
    await page.click("#apply-filters");
    await page.waitForTimeout(1200);
    const selectedRPT = await getSelectedOptions(page, "#rpt-filter");
    if (!selectedRPT.includes(rptOptions[0])) {
      throw new Error("RPT selection not retained after apply.");
    }
    await page.click("#clear-filters");
    await page.waitForTimeout(600);

    if (consoleErrors.length) {
      throw new Error(`Console errors detected: ${consoleErrors.join(" | ")}`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    server.kill("SIGTERM");
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
