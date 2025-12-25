# Frontend (MapLibre + deck.gl)

This folder contains a static frontend that renders routes with MapLibre + deck.gl
and supports client-side filtering + exports using DuckDB-WASM.

## Quick start (sample data)
1) Copy the sample config:

```
cp public/config.sample.json public/config.json
```

2) (Optional) Download DuckDB-WASM assets locally (avoids worker/CORS issues and reduces CDN dependency):

```
bash tools/fetch_duckdb_assets.sh
```

3) Start a local dev server (Range-enabled, also mounts `data/` at `/data/`):

```
python3 -m tools.dev_server --public-dir public --data-dir data --port 5137
```

4) Open:

```
http://localhost:5137
```

Use **Load GeoJSON preview** to stream a small subset from `config.geojsonFile` (useful when DuckDB isn’t available).
If you want to use the R2-hosted config instead, open:

```
http://localhost:5137/?config=config.r2.json
```

Note: R2 endpoints must have CORS + Range enabled or the browser will block requests.

## Feature flags
UI elements that aren’t ready yet are hidden behind `public/config.json` feature flags:
- `features.share`, `features.snapshot`
- `features.insightsTab`, `features.reportingTab`
- `features.layerToggles`
- `features.exportGeojson`, `features.exportCsv`
- `features.geojsonPreview`

## Build full data artifacts
Use the helper script to generate metadata + parquet + pmtiles:

```
./tools/build_frontend_data.sh data/scotland-bus-routes.geojson public
```

Requirements:
- `python3` with `duckdb` installed (`python3 -m pip install duckdb`)
- `tippecanoe` for PMTiles (optional, but recommended)
- DuckDB-WASM assets in `frontend/public/duckdb` (use `tools/fetch_duckdb_assets.sh`)

The build script also embeds:
- `geojson` column (for previews/exports without DuckDB spatial in the browser)
- `bbox_minx/bbox_miny/bbox_maxx/bbox_maxy` columns (for bbox filtering without spatial)

## Deploy to Cloudflare Pages + R2
1) Upload artifacts to an R2 bucket:
   - `routes.pmtiles`
   - `routes.parquet`
   - `metadata.json`
2) Enable CORS + Range requests on the bucket.
3) Update `frontend/public/config.json`:

```json
{
  "dataBaseUrl": "https://<your-r2-public-url>",
  "pmtilesFile": "routes.pmtiles",
  "parquetFile": "routes.parquet",
  "metadataFile": "metadata.json",
  "vectorLayer": "routes",
  "duckdbBaseUrl": "duckdb"
}
```

4) Deploy `frontend/public` to Cloudflare Pages (no build step).

## Notes
- If `pmtilesFile` is empty, the map renders the basemap only.
- GeoJSON export and bbox filtering require the DuckDB spatial extension.
