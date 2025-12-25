/**
 * DuckDB-WASM client initialization and connection management
 */

import { state, setDuckDBConnection, setSpatialReady, setColumns } from "../state/manager.js";
import { toAbsoluteUrl, joinUrl } from "../utils/url.js";

/**
 * Rebases DuckDB bundle URLs to local or custom base URL
 * @param {object} bundles - DuckDB bundle object
 * @param {string} baseUrl - Base URL for assets
 * @returns {object} Rebased bundle object
 */
const rebaseBundles = (bundles, baseUrl) => {
  if (!baseUrl) {
    return bundles;
  }
  const rebased = {};
  for (const [key, bundle] of Object.entries(bundles)) {
    rebased[key] = {
      ...bundle,
      mainModule: joinUrl(baseUrl, bundle.mainModule.split("/").pop()),
      mainWorker: joinUrl(baseUrl, bundle.mainWorker.split("/").pop()),
      pthreadWorker: bundle.pthreadWorker
        ? joinUrl(baseUrl, bundle.pthreadWorker.split("/").pop())
        : undefined
    };
  }
  return rebased;
};

/**
 * Finds a column in the schema by checking candidates
 * @param {string[]} columns - Available columns
 * @param {string[]} candidates - Candidate column names to search for
 * @returns {string|null} Found column name or null
 */
export const findColumn = (columns, candidates) => {
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const candidate of candidates) {
    const hit = lower.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
};

/**
 * Detects schema fields from parquet columns
 * @param {string[]} columns - Available column names
 */
export const detectSchemaFields = (columns) => {
  const modeCandidates = ["mode", "transport_mode", "Mode"];
  const operatorCandidates = ["operatorCode", "operatorName", "operator"];
  const laCodeCandidates = ["la_code", "laCode", "la"];
  const laNameCandidates = ["la_name", "laName", "local_authority"];
  const laCodesCandidates = ["la_codes", "laCodes", "la_list"];
  const laNamesCandidates = ["la_names", "laNames", "local_authorities"];
  const rptCodeCandidates = ["rpt_code", "rptCode", "rpt"];
  const rptNameCandidates = ["rpt_name", "rptName"];
  const rptCodesCandidates = ["rpt_codes", "rptCodes", "rpt_list"];
  const rptNamesCandidates = ["rpt_names", "rptNames"];

  state.modeField = findColumn(columns, modeCandidates);
  state.operatorFields = operatorCandidates.map((name) => findColumn(columns, [name])).filter(Boolean);
  state.laField = findColumn(columns, laCodeCandidates);
  state.laNameField = findColumn(columns, laNameCandidates);
  state.laCodesField = findColumn(columns, laCodesCandidates);
  state.laNamesField = findColumn(columns, laNamesCandidates);
  state.rptField = findColumn(columns, rptCodeCandidates);
  state.rptNameField = findColumn(columns, rptNameCandidates);
  state.rptCodesField = findColumn(columns, rptCodesCandidates);
  state.rptNamesField = findColumn(columns, rptNamesCandidates);

  // Detect time band fields
  const timeBandOptions = [
    { key: "weekday", candidates: ["runs_weekday", "runsWeekday", "runs_weekday_flag"] },
    { key: "saturday", candidates: ["runs_saturday", "runsSaturday", "runs_sat", "runsSat"] },
    { key: "sunday", candidates: ["runs_sunday", "runsSunday", "runs_sun", "runsSun"] },
    { key: "evening", candidates: ["runs_evening", "runsEvening"] },
    { key: "night", candidates: ["runs_night", "runsNight"] }
  ];

  state.timeBandFields = {};
  timeBandOptions.forEach((option) => {
    const field = findColumn(columns, option.candidates);
    if (field) {
      state.timeBandFields[option.key] = field;
    }
  });

  state.geojsonField = findColumn(columns, ["geojson"]);

  // Detect bbox fields
  const bboxFields = {
    minx: findColumn(columns, ["bbox_minx", "minx", "xmin", "min_lon", "min_lng"]),
    miny: findColumn(columns, ["bbox_miny", "miny", "ymin", "min_lat"]),
    maxx: findColumn(columns, ["bbox_maxx", "maxx", "xmax", "max_lon", "max_lng"]),
    maxy: findColumn(columns, ["bbox_maxy", "maxy", "ymax", "max_lat"])
  };
  state.bboxFields = bboxFields;
  state.bboxReady = Boolean(
    bboxFields.minx && bboxFields.miny && bboxFields.maxx && bboxFields.maxy
  );
};

/**
 * Initializes DuckDB-WASM with configuration
 * @param {object} config - Application configuration
 * @param {object} duckdb - DuckDB module (imported from CDN)
 * @param {Function} setStatus - Status update callback
 * @returns {Promise<object>} Connection object
 */
export const initDuckDb = async (config, duckdb, setStatus) => {
  setStatus("Initializing DuckDB...");
  state.duckdbReady = false;

  const baseUrl = config.duckdbBaseUrl || "";

  const pickBundle = async (bundles) => {
    if (config.duckdbBundle && bundles[config.duckdbBundle]) {
      return bundles[config.duckdbBundle];
    }
    if (typeof window !== "undefined" && !window.crossOriginIsolated && bundles.mvp) {
      return bundles.mvp;
    }
    return duckdb.selectBundle(bundles);
  };

  const rebasedBundles = rebaseBundles(duckdb.getJsDelivrBundles(), baseUrl);
  let bundle = await pickBundle(rebasedBundles);

  const createDb = async (selected) => {
    setStatus("Loading DuckDB worker...");
    let worker = null;

    if (config.duckdbWorkerMode !== "blob") {
      try {
        worker = new Worker(selected.mainWorker, { type: "module" });
      } catch (error) {
        worker = null;
      }
    }

    if (!worker) {
      worker = await duckdb.createWorker(selected.mainWorker);
    }

    const workerError = new Promise((_, reject) => {
      const onError = (event) => {
        const message = event?.message || "DuckDB worker failed to start.";
        reject(new Error(message));
      };
      worker.addEventListener("error", onError, { once: true });
      worker.addEventListener("messageerror", onError, { once: true });
    });

    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger("error"), worker);

    const timeout = 15000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("DuckDB initialization timed out")), timeout);
    });

    await Promise.race([
      db.instantiate(selected.mainModule, selected.pthreadWorker),
      workerError,
      timeoutPromise
    ]);

    return db;
  };

  const loadWithFallback = async () => {
    try {
      state.db = await createDb(bundle);
      return;
    } catch (error) {
      if (baseUrl) {
        setStatus("DuckDB local assets missing; retrying via CDN...");
        const cdnBundles = duckdb.getJsDelivrBundles();
        bundle = await pickBundle(cdnBundles);
        state.db = await createDb(bundle);
        return;
      }
      throw error;
    }
  };

  try {
    await loadWithFallback();
  } catch (error) {
    const hint = baseUrl
      ? `DuckDB worker failed to load from '${baseUrl}'. Add DuckDB assets or set duckdbBaseUrl:'' to use CDN.`
      : "DuckDB worker failed to load. Add DuckDB assets under public/duckdb or set duckdbBaseUrl:''.";
    throw new Error(hint);
  }

  const conn = await state.db.connect();

  // Try to load spatial extension
  let spatialReady = false;
  try {
    await conn.query("LOAD spatial");
    spatialReady = true;
  } catch (loadError) {
    try {
      await conn.query("INSTALL spatial");
      await conn.query("LOAD spatial");
      spatialReady = true;
    } catch (error) {
      spatialReady = false;
    }
  }
  setSpatialReady(spatialReady);

  // Register parquet file
  const parquetUrl = toAbsoluteUrl(joinUrl(config.dataBaseUrl, config.parquetFile));
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
  const preferBuffer = Boolean(config.parquetPreferBuffer);

  if (!preferBuffer) {
    await state.db.registerFileURL("routes.parquet", parquetUrl);
  }

  const describeParquet = async () => {
    const result = await conn.query("DESCRIBE SELECT * FROM read_parquet('routes.parquet')");
    const columns = result.toArray().map((row) => row.column_name || row.name || row[0]);
    setColumns(columns);
    detectSchemaFields(columns);

    const columnLookup = new Map(columns.map((name) => [String(name).toLowerCase(), name]));
    state.geometryField = columnLookup.get("geometry") || columnLookup.get("geom") || "";

    return columns;
  };

  try {
    if (preferBuffer) {
      throw new Error("Parquet buffer preferred");
    }
    await describeParquet();
  } catch (error) {
    const message = String(error?.message || "");
    const isTooSmall = message.toLowerCase().includes("too small to be a parquet file");

    if (isTooSmall) {
      setStatus(`Parquet URL read failed. Downloading full file...`);
    }

    const maxBufferMb = config.parquetBufferMaxMb ?? 200;
    let canBuffer = preferBuffer || isTooSmall || isLocalHost;
    let rangeUnsupported = false;
    let contentLength = 0;

    if (!canBuffer) {
      try {
        const head = await fetch(parquetUrl, { method: "HEAD" });
        contentLength = Number(head.headers.get("content-length") || 0);
        const acceptRanges = (head.headers.get("accept-ranges") || "").toLowerCase();
        rangeUnsupported = acceptRanges !== "bytes";
        if (rangeUnsupported) {
          setStatus("Parquet server lacks Range support. Downloading full file (consider tools/dev_server).");
        }
        const maxBytes = maxBufferMb * 1024 * 1024;
        canBuffer = !contentLength || contentLength <= maxBytes || rangeUnsupported;
      } catch (headError) {
        canBuffer = false;
      }
    }

    if (canBuffer) {
      try {
        await state.db.dropFile("routes.parquet");
      } catch (dropError) {
        // Ignore if not registered yet
      }

      if (preferBuffer || isLocalHost) {
        setStatus("Downloading routes parquet for local access...");
      }

      const response = await fetch(parquetUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Parquet download failed (${response.status})`);
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.length < 1024 * 1024) {
        throw new Error("Parquet download failed (file too small)");
      }

      await state.db.registerFileBuffer("routes.parquet", buffer);
      await describeParquet();
    } else {
      if (rangeUnsupported) {
        throw new Error(
          "Parquet server does not support Range requests and file is too large to buffer. Use tools/dev_server or set parquetPreferBuffer."
        );
      }
      throw error;
    }
  }

  setDuckDBConnection(conn, state.db);
  state.duckdbReady = true;

  const geojsonAvailable = Boolean(state.geojsonField || (spatialReady && state.geometryField));
  const bboxAvailable = spatialReady || state.bboxReady;

  if (spatialReady) {
    setStatus("DuckDB ready with spatial support.");
  } else if (geojsonAvailable) {
    setStatus("DuckDB ready. Using precomputed GeoJSON for previews.");
  } else {
    setStatus("DuckDB ready. Spatial extension unavailable.");
  }

  return conn;
};

/**
 * Executes a DuckDB query
 * @param {string} sql - SQL query to execute
 * @returns {Promise<Array>} Query results as array
 */
export const executeQuery = async (sql) => {
  if (!state.conn) {
    throw new Error("DuckDB connection not initialized");
  }
  const result = await state.conn.query(sql);
  return result.toArray();
};

/**
 * Counts rows matching a WHERE clause
 * @param {string} whereClause - SQL WHERE clause (without WHERE keyword)
 * @returns {Promise<number>} Row count
 */
export const countRows = async (whereClause = "") => {
  const where = whereClause ? `WHERE ${whereClause}` : "";
  const sql = `SELECT COUNT(*) as count FROM read_parquet('routes.parquet') ${where}`;
  const result = await executeQuery(sql);
  return result[0]?.count ?? 0;
};
