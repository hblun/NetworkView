# NetworkView

Browser-based transport route mapping and analysis tool using MapLibre GL, DuckDB-WASM, and PMTiles.

## Features

- **Interactive map viewer** with route lines and administrative boundaries
- **Client-side filtering** by mode, operator, time bands, and geographic area
- **Data analysis** powered by DuckDB-WASM (runs entirely in browser)
- **Export capabilities** for CSV and GeoJSON
- **Static deployment** - no backend required

## Quick Start

### Prerequisites

**For local development**:
- Python 3.11+ (for dev server)
- Node.js 20+ (for tests only)

**For building data artifacts**:
- Python 3.11+ with `duckdb` installed: `pip install duckdb`
- `tippecanoe` for PMTiles generation (optional but recommended)
  - macOS: `brew install tippecanoe`
  - Ubuntu: Build from source ([mapbox/tippecanoe](https://github.com/felt/tippecanoe))

### Running Locally

1. **Clone the repository**

```bash
git clone <repository-url>
cd NetworkView
```

2. **Copy sample configuration**

```bash
cp public/config.sample.json public/config.json
```

3. **Start the development server**

```bash
python3 -m tools.dev_server --public-dir public --data-dir data --port 5137
```

4. **Open in browser**

```
http://localhost:5137
```

The app will load with sample data. Click "Load GeoJSON preview" to see a preview of routes.

### Using Production Data

To use the full dataset hosted on R2:

```
http://localhost:5137/?config=config.r2.json
```

Note: R2 endpoints must have CORS and Range requests enabled.

## Development

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
npm test              # Run tests once
npm run test:ui       # Run tests with UI
npm run test:coverage # Run tests with coverage report
```

### Run Linter

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### Project Structure

```
NetworkView/
├── public/           # Static frontend assets
│   ├── index.html    # Main HTML file
│   ├── app.js        # Main application code
│   ├── boot.js       # Bootstrap and error handling
│   ├── styles.css    # Styles
│   ├── js/           # Modularized JavaScript (new)
│   │   ├── utils/    # Utility functions
│   │   └── config/   # Configuration constants
│   ├── *.pmtiles     # Vector tile data
│   ├── *.parquet     # Attribute data for DuckDB
│   └── config.json   # Runtime configuration
├── tools/            # Build and dev server scripts
│   ├── dev_server.py           # Local dev server with Range support
│   ├── build_frontend_data.py  # Data artifact generator
│   └── build_frontend_data.sh  # Build script wrapper
├── data/             # Source data (not in git)
├── tests/            # Unit tests
└── .github/          # CI/CD workflows
```

## Building Data Artifacts

### 1. Prepare Source Data

Place your source files in the `data/` directory:
- `routes_enriched.geojson` - Route line geometries with attributes
- `boundaries_la_clean.geojson` - Local Authority boundaries
- `boundaries_rpt_clean.geojson` - Regional Transport Partnership boundaries

### 2. Run Build Script

```bash
./tools/build_frontend_data.sh \
  data/routes_enriched.geojson \
  data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson \
  public
```

This generates:
- `public/routes.pmtiles` - Route vector tiles
- `public/routes.parquet` - Route attributes for DuckDB queries
- `public/boundaries_la.pmtiles` - LA boundary tiles
- `public/boundaries_rpt.pmtiles` - RPT boundary tiles
- `public/operators.parquet` - Operator lookup table
- `public/metadata.json` - Dataset metadata and version info

### 3. Verify Output

```bash
ls -lh public/*.{pmtiles,parquet}
```

Expected file sizes:
- `routes.pmtiles`: 8-10MB
- `routes.parquet`: 40-60MB (depending on dataset)
- `boundaries_*.pmtiles`: 1-3MB each

## Configuration

The app is configured via `public/config.json`:

```json
{
  "dataBaseUrl": "",              // Base URL for data files (or "" for relative)
  "pmtilesFile": "routes.pmtiles", // Routes vector tiles
  "parquetFile": "routes.parquet", // Routes attribute table
  "metadataFile": "metadata.json", // Dataset metadata
  "basemapStyle": "https://...",  // MapLibre style URL
  "defaultView": {
    "center": [-3.5, 56.2],       // Map center [lon, lat]
    "zoom": 6.2                   // Initial zoom level
  },
  "features": {                   // Feature flags
    "exportCsv": true,
    "exportGeojson": false,
    "geojsonPreview": true,
    ...
  }
}
```

### Feature Flags

Control UI features via `features` in config:
- `share` - Share state button
- `snapshot` - Map snapshot export
- `exportGeojson` - GeoJSON export button
- `exportCsv` - CSV export button
- `geojsonPreview` - Load sample GeoJSON button
- `geocoder` - Place search
- `layerToggles` - Layer visibility controls

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions to Cloudflare Pages + R2.

Quick summary:

1. Build data artifacts (see above)
2. Upload PMTiles and Parquet files to R2 bucket
3. Configure CORS on R2 bucket (allow GET, HEAD, Range header)
4. Update `public/config.json` with R2 bucket URL
5. Deploy `public/` directory to Cloudflare Pages

## Testing

### Manual Testing Checklist

Before deploying, verify:

- [ ] Map loads and displays basemap
- [ ] Routes layer renders
- [ ] Filters work (Mode, Operator, LA, RPT)
- [ ] Service search filters routes
- [ ] Clicking a route shows selection panel
- [ ] Data table updates with filtered results
- [ ] CSV export downloads
- [ ] No console errors

### Automated Tests

Run the test suite:

```bash
npm test
```

Current test coverage includes:
- SQL utilities (escaping, quoting, query building)
- Color generation and conversion
- Configuration constants

**TODO**: Add integration tests for DuckDB queries and map interactions.

## Architecture

NetworkView uses a static, client-side architecture:

- **Frontend**: Vanilla JavaScript (ES modules), no build step required
- **Map rendering**: MapLibre GL with PMTiles protocol
- **Data queries**: DuckDB-WASM running in browser
- **Deployment**: Static files on CDN (Cloudflare Pages)
- **Data storage**: Object storage (R2) with CORS + Range support

### Technology Stack

- [MapLibre GL](https://maplibre.org/) - Map rendering
- [PMTiles](https://github.com/protomaps/PMTiles) - Vector tile format
- [DuckDB-WASM](https://duckdb.org/docs/api/wasm) - In-browser analytics
- [Deck.gl](https://deck.gl/) - Preview overlays
- Python + DuckDB - Data pipeline

## Contributing

### Code Quality Standards

- All JavaScript must pass ESLint
- All new utility functions must have unit tests
- Manual testing checklist must pass before merging
- Keep functions under 50 lines where possible
- Extract reusable logic into modules

### Pull Request Process

1. Create feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Run linter: `npm run lint:fix`
5. Update documentation if needed
6. Submit PR with clear description

## Troubleshooting

### Map doesn't load

**Check**:
- Browser console for errors
- `config.json` has correct URLs
- PMTiles files are accessible
- CORS is configured on data host

### DuckDB fails to initialize

**Check**:
- Parquet file is accessible
- File size is reasonable (< 100MB works best)
- Try setting `parquetPreferBuffer: true` in config
- Check browser console for WASM errors

### Filters don't work

**Check**:
- `metadata.json` contains expected modes/operators
- Parquet file has expected column names
- Browser console for SQL errors

### Performance issues

**Check**:
- Parquet file size (consider reducing data volume)
- Number of features in PMTiles (simplify geometry if needed)
- Browser memory usage (limit table rows with `tableLimit` config)

## Documentation

- [BASELINE.md](BASELINE.md) - Current system state and design decisions
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures and troubleshooting
- [plan.md](plan.md) - Product roadmap and feature planning
- [AGENTS.md](AGENTS.md) - Development workflow for AI agents

## License

[Add license information]

## Support

[Add support contact information]
