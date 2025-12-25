# Network View (MapLibre + deck.gl + Vite)

A web-based route visualization platform built with MapLibre, deck.gl, and DuckDB-WASM.
Now includes Vibe Kanban Web Companion for enhanced development workflow.

## Quick start (development)

1) Install dependencies:

```bash
npm install
```

2) Copy the sample config (if needed):

```bash
cp public/config.sample.json public/config.json
```

3) Start the Vite dev server:

```bash
npm run dev
```

The app will open at `http://localhost:5137` with hot module reloading enabled.

### Features

- **Vibe Kanban Web Companion**: Point-and-click edit functionality for rapid development
  - Enabled by default via `features.vibeKanbanWebCompanion` flag in `config.json`
  - Works seamlessly with Vite's React integration
- **MapLibre + PMTiles**: Efficient vector tile rendering
- **DuckDB-WASM**: Client-side data analysis and exports
- **deck.gl**: Advanced data visualization overlays

### Available Scripts

- `npm run dev` - Start Vite development server with HMR
- `npm run build` - Build production bundle to `dist/`
- `npm run preview` - Preview production build locally
- `npm run type-check` - Run TypeScript type checking

## Legacy development (static files)

For development without the build pipeline:

1) Download DuckDB-WASM assets locally (avoids cross-origin worker errors):

```bash
bash tools/fetch_duckdb_assets.sh
```

2) Start a local server (Range-enabled):

```bash
python3 -m tools.dev_server --directory public --port 5137
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

1) Build the production bundle:

```bash
npm run build
```

2) Upload data artifacts to an R2 bucket:
   - `routes.pmtiles`
   - `routes.parquet`
   - `metadata.json`

3) Enable CORS + Range requests on the bucket.

4) Update `public/config.json`:

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

**Note**: Set `features.vibeKanbanWebCompanion` to `false` in production to disable the companion.

5) Deploy the `dist/` directory to Cloudflare Pages.

## Notes
- If `pmtilesFile` is empty, the map renders the basemap only.
- GeoJSON export and bbox filtering require the DuckDB spatial extension.
