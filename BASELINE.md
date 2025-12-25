# Baseline — Network View (2025-12-25)

## Runtime snapshot
- The viewer is a static bundle in `public/` (`index.html`, `styles.css`, `app.js`) that runs entirely in the browser. There is no build step; everything is served as plain files.
- `app.js` imports `maplibre-gl@3.6.2`, `pmtiles@3.0.6`, `@deck.gl/mapbox`, `@deck.gl/layers`, and `@duckdb/duckdb-wasm@1.28.0` directly from CDNs and wires up MapLibre + deck.gl overlays, filter UIs, and DuckDB-WASM exports (CSV/GeoJSON).
- User interactions include mode/operator/bbox filtering, Deck-highlighted preview updates, selection cards, and dataset stats. Sample preview geoJSON is embedded for offline testing from `sampleGeojson()`.

## Data assets
- The current dataset lives in `public/` as `routes.pmtiles` (8.1 MB), `routes.parquet` (50 MB), `boundaries_la.pmtiles` (2.3 MB), `boundaries_rpt.pmtiles` (1.3 MB), and `metadata.json`. Metadata reports 2,784 routes, supported modes (`BUS`, `COACH`, `FERRY`), and the operators used to populate the filter selects.
- Tokens such as `metadata.generatedAt` and `metadata.lastUpdated` are now both `2025-12-25T15:33:08.971721+00:00`, reflecting the latest artefact refresh.
- Config-driven endpoints point to `https://pub-68f801c9ef774a729dd19c234b46593b.r2.dev` and expect `routes.pmtiles`, `routes.parquet`, `metadata.json`, plus boundary PMTiles when clipping is enabled.

## Configuration
- `public/config.json` defines the live URLs (`dataBaseUrl`, `vectorLayer`, `duckdbBaseUrl`, `basemapStyle`) as well as the default view (center, zoom). `config.sample.json` mirrors these fields but is meant for local sample previews (it leaves `pmtilesFile` blank so the map shows basemap only until actual tiles are downloaded).
- The viewer also references `config.ui` in `public/config.sample.json` for display text (kicker, heading, badge) that can be overridden per deployment.

## Local development
1. Copy the sample config: `cp frontend/public/config.sample.json frontend/public/config.json`.
2. Fetch DuckDB-WASM assets via `bash tools/fetch_duckdb_assets.sh`. The frontend expects a `/duckdb` folder with `*.worker.js`.
3. Run `python3 -m tools.dev_server --directory frontend/public --port 5137` and open `http://localhost:5137`.
4. Click **Load sample preview** to check the UI without the full dataset.
5. To exercise the full dataset, download and replace `routes.pmtiles`, `routes.parquet`, and `metadata.json` (or point `config.json` to your Cloudflare R2 bucket).

## Known gaps & manual checks
- No bundler / build pipeline / tests exist; the only verification is manual interaction via the sample UI.
- There is no automated way to refresh `routes.parquet` or ensure `metadata.json` aligns with the tiles, so updates should follow the README’s `tools/build_frontend_data.sh` script paired with manual metadata inspection.
- Time-band filtering relies on available flags in the Parquet dataset; the UI currently enables the bbox filter (with spatial extension) and falls back to a geojson/bbox column combo if spatial support is missing.
- LA/RPT assignments are derived from polygon intersection with a nearest-LA fallback for routes that do not intersect land polygons (notably ferry services). Argyll & Bute is treated as fully HITRANS until a sub-LA boundary for Helensburgh + Lomond is supplied.

## Follow-up priorities
- If the dataset changes, confirm that `metadata.generatedAt`/`lastUpdated` update, the R2 bucket has `"metadata.json"`, and `config.json` still points at that bucket.
- Capture any future smoke tests or linting needed to keep the repo aligned with the Phase 4 performance hardening goals.
