# Build Script Quick Reference

## The One Command You Need

```bash
python3 tools/build_frontend_data.py \
  data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson
```

## What It Does

Enriches routes with LA/RTP assignments using spatial joins:
- **Input**: Routes + LA boundaries + RTP boundaries
- **Output**: `data/parquet/routes.parquet` + `public/routes.pmtiles`
- **Time**: ~2-3 minutes

## Quick Variations

```bash
# Skip tiles (faster for testing)
python3 tools/build_frontend_data.py data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson data/boundaries_rpt_clean.geojson \
  --skip-tiles

# More performance
python3 tools/build_frontend_data.py data/scotland-routes.geojson \
  --la-geojson data/boundaries_la_clean.geojson data/boundaries_rpt_clean.geojson \
  --threads 8 --memory-limit 16GB
```

## Validate After Build

```bash
python3 tests/test_build_output.py
```

## Key Files

| File | Purpose |
|------|---------|
| `data/parquet/routes.parquet` | Main query data (has LA/RTP fields) |
| `data/parquet/operators.parquet` | Operator lookup |
| `public/routes.pmtiles` | Map tiles |

## Schema Added to Routes

- `la_code`, `la_name` - Primary LA
- `rpt_code`, `rpt_name` - Primary RTP
- `la_codes`, `la_names` - Multi-membership (pipe-delimited)
- `rpt_codes`, `rpt_names` - Multi-membership (pipe-delimited)

## Common Issues

**Hangs on intersections?**
→ Try `--threads 4` or simplify geometries

**Out of memory?**
→ Use `--memory-limit 16GB`

**No intersections found?**
→ Check inputs are EPSG:4326 and geometries are valid

## Full Docs

See `RUNNING_BUILD_SCRIPT.md` for complete guide
