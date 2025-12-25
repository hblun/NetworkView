# Network View (MapLibre + deck.gl + React)

This application renders transport routes with MapLibre + deck.gl and supports client-side filtering + exports using DuckDB-WASM. The app now uses Vite + React for development with the Vibe Kanban Web Companion integration.

## Quick start (development with Vite)

1) Install dependencies:

```bash
npm install
```

2) Copy the sample config (if not already present):

```bash
cp public/config.sample.json public/config.json
```

3) Start the Vite development server:

```bash
npm run dev
```

4) Open in your browser:

```
http://localhost:5137
```

The Vibe Kanban Web Companion will be available in development mode for point-and-click editing.

## Alternative: Legacy Static Server

If you prefer the original static approach without the build system:

1) Download DuckDB-WASM assets locally (avoids cross-origin worker errors):

```bash
bash tools/fetch_duckdb_assets.sh
```

2) Start a local server (Range-enabled):

```bash
python3 -m tools.dev_server --directory public --port 5137
```

3) Open `public/index.original.html` directly or navigate to http://localhost:5137

Note: The Vibe Kanban Web Companion will not be available in this mode.

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

## Production Build

Build the optimized production bundle:

```bash
npm run build
```

This creates a `dist/` directory with:
- Optimized and minified JavaScript bundles
- All assets from `public/` (PMTiles, Parquet, config, etc.)
- Tree-shaken code (Vibe Kanban Web Companion is excluded from production)

Preview the production build locally:

```bash
npm run preview
```

## Deploy to Cloudflare Pages + R2

### Option 1: Deploy the built app (recommended)
1) Upload artifacts to an R2 bucket:
   - `routes.pmtiles`
   - `routes.parquet`
   - `metadata.json`
2) Enable CORS + Range requests on the bucket.
3) Update `public/config.json`:

```json
{
  "dataBaseUrl": "https://<your-r2-public-url>",
  "pmtilesFile": "routes.pmtiles",
  "parquetFile": "routes.parquet",
  "metadataFile": "metadata.json",
  "vectorLayer": "routes",
  "duckdbBaseUrl": "duckdb",
  "features": {
    "vibeKanbanWebCompanion": false
  }
}
```

4) Run `npm run build` to create the production bundle
5) Deploy the `dist/` directory to Cloudflare Pages

### Option 2: Deploy static files (legacy)
Deploy `public/` directory directly to Cloudflare Pages (no build step required)

## Notes
- If `pmtilesFile` is empty, the map renders the basemap only.
- GeoJSON export and bbox filtering require the DuckDB spatial extension.
