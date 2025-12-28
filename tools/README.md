# Build Tools

This directory contains scripts for building frontend data artifacts.

## build_frontend_data.py

Enriches route data with spatial joins to Local Authority (LA) and Regional Transport Partnership (RTP) boundaries.

### Features

**Performance Optimizations:**
- Configurable thread count for DuckDB (`--threads`)
- Adjustable memory limit (`--memory-limit`)
- Progress tracking with timestamps and metrics
- Resume capability to skip existing outputs (`--resume`)

**Resilience:**
- Auto-download LA boundaries from SpatialHub WFS with retry logic
- Error handling and validation
- Detailed progress logging with timing information

**Configurability:**
- Custom output directories
- Membership filters (min length and route share)
- Optional tile generation (`--skip-tiles`)

### Quick Start

```bash
# Basic usage (auto-downloads LA boundaries)
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson
```

### Usage Examples

```bash
# With custom LA boundaries
python3 tools/build_frontend_data.py data/scotland-routes.geojson \
  --la-geojson data/boundaries_la.geojson \
  data/boundaries_rpt_clean.geojson

# Performance tuning
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson \
  --threads 8 \
  --memory-limit 16GB

# Skip tiles (faster for testing)
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson \
  --skip-tiles

# With membership filters
python3 tools/build_frontend_data.py data/scotland-routes.geojson data/boundaries_rpt_clean.geojson \
  --min-length-m 100 \
  --min-share 0.01
```

### Input Files

- **routes_geojson**: Route geometries (LineString/MultiLineString) in GeoJSON format
- **rpt_geojson**: RTP boundary polygons in GeoJSON format
- **la_geojson** (optional): LA boundary polygons - auto-downloaded from SpatialHub if not provided

### Output Files

Generated in `data/parquet/`:
- `routes.parquet` - Enriched route data with LA/RTP assignments
- `operators.parquet` - Unique operators lookup table

Generated in `public/`:
- `routes.pmtiles` - Vector tiles for map rendering

Generated in `data/`:
- `routes_enriched.geojson` - Enriched routes in GeoJSON format
- `la_boundaries.geojson` - Cached LA boundaries (if auto-downloaded)

### Schema

The output `routes.parquet` includes:

**Geographic Assignments:**
- `la_code`, `la_name` - Primary Local Authority
- `rpt_code`, `rpt_name` - Primary Regional Transport Partnership
- `la_codes`, `la_names` - Pipe-delimited multi-membership (e.g., `|S12000017|S12000023|`)
- `rpt_codes`, `rpt_names` - Pipe-delimited multi-membership

**Route Attributes:**
- `operatorCode`, `operatorName` - Service operator
- `geometry` - Route linestring
- All original route attributes

### Testing

Run the test suite to validate output:

```bash
python3 tests/test_build_output.py
```

Tests verify:
- Required parquet files exist
- Schema includes all necessary columns
- Filter queries work correctly
- Multi-membership format is valid
- Geometry is valid
- Coverage statistics (most routes have LA/RPT assignments)

### Performance Notes

**Typical Runtime** (on MacBook M1):
- 2,784 routes × 32 LAs × 7 RPTs
- ~30-60 seconds for spatial joins
- ~30 seconds for tile generation
- Total: ~2 minutes

**Memory Usage:**
- Default 8GB limit is sufficient for Scotland dataset
- Increase to 16GB for larger datasets

**Optimization Tips:**
- Use `--threads` to match your CPU cores
- Use `--skip-tiles` during development
- Use `--resume` to skip regenerating existing files

### Troubleshooting

**No LA/RPT intersections found:**
- Check CRS of input files (should be EPSG:4326)
- Verify geometries are valid
- Check geometry types match (routes=LineString, boundaries=Polygon)

**Out of memory:**
- Increase `--memory-limit` (e.g., `16GB`, `32GB`)
- Reduce thread count if swapping occurs

**Slow spatial joins:**
- Ensure DuckDB spatial extension is installed
- Check input file sizes and complexity
- Consider pre-simplifying complex geometries

### Data Sources

**LA Boundaries:**
- Source: SpatialHub Scotland WFS service
- Layer: `sh_las:pub_las`
- Auto-downloaded with authentication
- Cached to `data/la_boundaries.geojson`

**RTP Boundaries:**
- Derived from LA boundaries by dissolving
- 7 RTPs in Scotland (HITRANS, SPT, NESTRANS, etc.)
- Provided as input file

### Why Pre-compute Joins?

The script pre-computes spatial joins rather than doing them in the browser because:

1. **Performance**: Spatial operations are expensive; doing them once ahead of time is much faster than on every query
2. **Browser Limitations**: DuckDB-WASM has limited memory and CPU
3. **User Experience**: Filters can use simple string matching instead of spatial operations
4. **Network Efficiency**: Enriched parquet includes assignments, no additional data to load

### Related Files

- `tests/test_build_output.py` - Validation test suite
- `../DEPLOYMENT.md` - Deployment guide including build step
- `../README.md` - Project overview
