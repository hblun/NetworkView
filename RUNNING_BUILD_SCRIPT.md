# How to Run the Build Script

## Quick Start

The simplest way to run the build script with your existing data:

```bash
cd /Users/home/Devwork/NetworkView

python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson
```

## What This Does

The script will:
1. ✅ Load 2,784 routes from `scotland-routes.geojson`
2. ✅ Load 32 LA boundaries from `boundaries_la_clean.geojson`
3. ✅ Load 7 RTP boundaries from `boundaries_rpt_clean.geojson`
4. ✅ Compute spatial intersections between routes and boundaries
5. ✅ Assign primary LA/RTP to each route
6. ✅ Create multi-membership lists for routes crossing multiple areas
7. ✅ Generate output files:
   - `data/parquet/routes.parquet` - Enriched route data for DuckDB queries
   - `data/parquet/operators.parquet` - Unique operators
   - `data/routes_enriched.geojson` - Routes with LA/RTP assignments
   - `public/routes.pmtiles` - Vector tiles for map

## Expected Runtime

On a typical modern machine:
- **1-2 minutes** for spatial joins
- **30 seconds** for tile generation
- **~2-3 minutes total**

## Common Use Cases

### 1. Standard Build (Recommended)
```bash
python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson
```

### 2. Faster Testing (Skip Tiles)
```bash
python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson \
  --skip-tiles
```

### 3. Performance Tuning (More Threads/Memory)
```bash
python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson \
  --threads 8 \
  --memory-limit 16GB
```

### 4. With Membership Filters
Only include boundary memberships where route intersects >100m and >1% of route length:
```bash
python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson \
  --min-length-m 100 \
  --min-share 0.01
```

## Understanding the Output

The script logs detailed progress with timestamps:

```
[13:05:23] Initializing DuckDB...
[13:05:23] Loading spatial extension...
[13:05:23] Reading routes...
[13:05:33] Loaded 2,784 routes in 9.7s
[13:05:33] Computing route lengths and transforming to EPSG:27700...
[13:05:42] Computing LA intersections (2,784 routes × 32 LAs)...
[13:05:45] Found 8,234 LA intersections in 3.2s
[13:05:45] Assigned 2,756 routes to primary LAs
[13:05:45] Warning: 28 routes have no LA assignment
...
[13:07:12] Build complete!
```

## Validation

After the build completes, validate the output:

```bash
python3 tests/test_build_output.py
```

This will verify:
- ✅ All required files exist
- ✅ Schema is correct for frontend filters
- ✅ Sample queries work (LA filter, RTP filter, operator filter)
- ✅ Geometry is valid
- ✅ Coverage is acceptable (>80% of routes have assignments)

## Troubleshooting

### Script hangs on "Computing intersections"
- The spatial joins can be slow with complex geometries
- Try: `--threads 4` (sometimes fewer threads is faster)
- Try: Simplify input geometries first with `ogr2ogr` or QGIS

### Out of memory
- Increase: `--memory-limit 16GB`
- Or reduce threads: `--threads 2`

### No intersections found
- Check that all input files are in **EPSG:4326** (WGS84)
- Verify geometries are valid
- Ensure route geometries overlap with boundary polygons

### Wrong file paths
All paths are relative to the project root:
```
/Users/home/Devwork/NetworkView/
├── data/
│   ├── scotland-routes.geojson          ← Routes input
│   ├── boundaries_la_clean.geojson      ← LA boundaries input
│   ├── boundaries_rpt_clean.geojson     ← RTP boundaries input
│   ├── parquet/                         ← Generated parquet files
│   └── routes_enriched.geojson          ← Generated enriched routes
└── public/
    └── routes.pmtiles                   ← Generated tiles
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `routes_geojson` | (required) | Input routes GeoJSON file |
| `--la-geojson FILE` | Auto-download | LA boundaries GeoJSON (use existing file) |
| `rpt_geojson` | (required) | RTP boundaries GeoJSON file |
| `--output-dir DIR` | `public` | Where to write PMTiles |
| `--data-dir DIR` | `data` | Working directory |
| `--parquet-dir DIR` | `data/parquet` | Where to write parquet files |
| `--threads N` | Auto | DuckDB thread count |
| `--memory-limit SIZE` | `8GB` | DuckDB memory limit |
| `--skip-tiles` | Off | Skip PMTiles generation (faster) |
| `--min-length-m N` | `0` | Min intersection length (meters) |
| `--min-share N` | `0` | Min route share (0-1) for membership |
| `--resume` | Off | Skip existing output files |

## What Gets Generated

### 1. routes.parquet
Main data file for frontend queries. Contains:
- All original route attributes
- `la_code`, `la_name` - Primary LA assignment
- `rpt_code`, `rpt_name` - Primary RTP assignment
- `la_codes`, `la_names` - Pipe-delimited multi-membership (e.g., `|S12000017|S12000023|`)
- `rpt_codes`, `rpt_names` - Pipe-delimited multi-membership
- `geometry` - Route linestring

### 2. operators.parquet
Lookup table of unique operators:
- `operatorCode`
- `operatorName`

### 3. routes.pmtiles
Vector tiles for map rendering (if `--skip-tiles` not used)

### 4. routes_enriched.geojson
Full enriched dataset in GeoJSON format (intermediate file)

## Integration with Frontend

The frontend queries `routes.parquet` like this:

```javascript
// Filter by LA
const highlandRoutes = await conn.query(`
  SELECT * FROM routes.parquet
  WHERE la_code = 'S12000017' OR la_codes LIKE '%|S12000017|%'
`);

// Filter by RTP
const hitransRoutes = await conn.query(`
  SELECT * FROM routes.parquet
  WHERE rpt_code = 'HIT' OR rpt_codes LIKE '%|HIT|%'
`);

// Filter by operator
const operatorRoutes = await conn.query(`
  SELECT * FROM routes.parquet
  WHERE operatorCode = 'SCFI'
`);
```

The multi-membership fields allow filtering for routes that touch a boundary, even if it's not the primary assignment.

## Next Steps After Build

1. **Test locally**: Load `public/routes.pmtiles` and `data/parquet/routes.parquet` in the frontend
2. **Run validation**: `python3 tests/test_build_output.py`
3. **Deploy**: Upload to R2 bucket (see `DEPLOYMENT.md`)

## Notes

- The script auto-downloads LA boundaries from SpatialHub if `--la-geojson` is not provided
- **Recommended**: Always use `--la-geojson data/boundaries_la_clean.geojson` to use your existing, verified boundaries
- Progress is logged with timestamps so you can monitor long-running operations
- The script is idempotent - safe to run multiple times
