# Frontend (MapLibre + deck.gl)

This folder contains a static frontend that renders routes with MapLibre + deck.gl
and supports client-side filtering + exports using DuckDB-WASM.

## Quick start (sample data)
1) Copy the sample config:

```
cp frontend/public/config.sample.json frontend/public/config.json
```

2) Download DuckDB-WASM assets locally (avoids cross-origin worker errors):

```
bash tools/fetch_duckdb_assets.sh
```

3) Start a local server (Range-enabled):

```
python3 -m tools.dev_server --directory frontend/public --port 5137
```

4) Open:

```
http://localhost:5137
```

Use **Load sample preview** to see routes without any large data files.

## Build full data artifacts
Use the helper script to generate metadata + parquet + pmtiles:

```
./tools/build_frontend_data.sh data/scotland-bus-routes.geojson frontend/public
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
