# Deployment Guide

## Overview

NetworkView is deployed as a static site with data artifacts hosted on object storage (Cloudflare R2 or similar). The deployment consists of:

1. **Static assets**: HTML, CSS, JavaScript files from `public/`
2. **Data artifacts**: PMTiles, Parquet files, metadata JSON
3. **Configuration**: `config.json` pointing to data artifact URLs

## Prerequisites

- Python 3.11+ with `duckdb` installed
- `tippecanoe` for PMTiles generation (optional but recommended)
- Cloudflare account with R2 bucket configured
- Node.js 20+ for running tests (development only)

## Building Data Artifacts

### 1. Prepare Source Data

Ensure you have:
- `data/routes_enriched.geojson` - Route lines with attributes
- `data/boundaries_la_clean.geojson` - Local Authority boundaries
- `data/boundaries_rpt_clean.geojson` - Regional Transport Partnership boundaries

### 2. Generate Artifacts

Run the build script:

```bash
./tools/build_frontend_data.sh \
  data/routes_enriched.geojson \
  data/boundaries_la_clean.geojson \
  data/boundaries_rpt_clean.geojson \
  public
```

This generates:
- `public/routes.pmtiles` (8-10MB)
- `data/parquet/routes.parquet` (50MB)
- `public/boundaries_la.pmtiles` (2-3MB)
- `public/boundaries_rpt.pmtiles` (1-2MB)
- `data/parquet/operators.parquet` (5KB)
- `data/routes_enriched.geojson` (updated with spatial joins)
- `public/metadata.json` (dataset version info)

### 3. Verify Build Output

Check that files exist and have reasonable sizes:

```bash
ls -lh public/*.pmtiles data/parquet/*.parquet
```

Expected sizes:
- `routes.pmtiles`: 8-10MB
- `routes.parquet`: 40-60MB
- `boundaries_*.pmtiles`: 1-3MB each

## Local Testing

### 1. Install Node Dependencies (for tests only)

```bash
npm install
```

### 2. Run Tests

```bash
npm test
```

All tests must pass before deploying.

### 3. Start Dev Server

```bash
npm run dev
# Or manually:
python3 -m tools.dev_server --public-dir public --data-dir data --port 5137
```

### 4. Manual Verification Checklist

Open http://localhost:5137 and verify:

- [ ] Map loads and shows basemap
- [ ] Routes PMTiles layer renders
- [ ] Boundary layers load (if enabled in config)
- [ ] Mode filter works (multi-select, updates map/table)
- [ ] Operator filter works
- [ ] LA/RPT filters work
- [ ] Service search works
- [ ] Click a route → selection panel populates
- [ ] Data Inspector table shows filtered results
- [ ] CSV export downloads successfully
- [ ] GeoJSON preview loads (if enabled)
- [ ] Evidence strip shows correct filter summary
- [ ] No console errors

## Deployment to Cloudflare

### 1. Upload Data Artifacts to R2

```bash
# Install wrangler CLI if not already installed
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Upload artifacts to R2 bucket
wrangler r2 object put networkview-data/routes.pmtiles --file public/routes.pmtiles
wrangler r2 object put networkview-data/routes.parquet --file data/parquet/routes.parquet
wrangler r2 object put networkview-data/boundaries_la.pmtiles --file public/boundaries_la.pmtiles
wrangler r2 object put networkview-data/boundaries_rpt.pmtiles --file public/boundaries_rpt.pmtiles
wrangler r2 object put networkview-data/operators.parquet --file data/parquet/operators.parquet
wrangler r2 object put networkview-data/metadata.json --file public/metadata.json
```

### 2. Configure CORS on R2 Bucket

Ensure R2 bucket allows:
- `GET` requests
- `HEAD` requests (for range queries)
- `Range` header
- Origins: your Pages domain

In Cloudflare dashboard:
1. Go to R2 → Your Bucket → Settings
2. Add CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://your-app.pages.dev"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Range", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

### 3. Update Config for Production

Edit `public/config.json`:

Ensure you set `parquetDir` to the directory where you uploaded the Parquet artifacts (for example `data/parquet`) so DuckDB can resolve the attribute table paths.

```json
{
  "dataBaseUrl": "https://pub-YOUR-BUCKET-ID.r2.dev",
  "pmtilesFile": "routes.pmtiles",
  "parquetDir": "data/parquet",
  "parquetFile": "routes.parquet",
  ...
}
```

### 4. Deploy Static Assets to Cloudflare Pages

```bash
# From project root
wrangler pages deploy public --project-name networkview
```

Or connect GitHub repository in Cloudflare Pages dashboard:
1. Settings → Build & deployments
2. Framework preset: None
3. Build command: (leave empty)
4. Build output directory: `public`

### 5. Verify Production Deployment

Visit your production URL and repeat the manual verification checklist above.

## Cache Invalidation

When updating data artifacts:

1. Upload new files to R2 (they overwrite old ones)
2. Cloudflare Pages deployment isn't needed unless HTML/CSS/JS changed
3. Users may see cached data for up to 1 hour (R2 cache TTL)

To force cache clear:
- Change `tileCacheVersion` in `config.json` and redeploy static assets

## Rollback Procedure

### Rollback Data Artifacts

1. Download previous version from R2 (if backed up)
2. Re-upload to R2 bucket
3. Or: revert `config.json` to point to a previous versioned URL

### Rollback Application Code

Via Cloudflare Pages dashboard:
1. Deployments → Select previous deployment
2. "Rollback to this deployment"

Via Wrangler:
```bash
wrangler pages deployment list --project-name networkview
wrangler pages deployment rollback <deployment-id> --project-name networkview
```

## Monitoring

### Post-Deployment Checks

After each deployment, check:

1. **Load time**: Should be < 5s on 3G
2. **Console errors**: Should be zero
3. **Analytics**: Track usage patterns (if implemented)

### Error Tracking

Currently manual. Consider adding:
- Sentry for JavaScript errors
- Cloudflare Web Analytics for traffic monitoring

## Troubleshooting

### Issue: Map doesn't load routes

**Possible causes**:
- PMTiles file not uploaded to R2
- CORS not configured on R2 bucket
- Wrong `dataBaseUrl` in config.json

**Fix**:
1. Check browser console for errors
2. Verify R2 file exists: `wrangler r2 object get networkview-data/routes.pmtiles`
3. Test CORS with curl:
   ```bash
   curl -I -H "Origin: https://your-app.pages.dev" https://pub-ID.r2.dev/routes.pmtiles
   ```

### Issue: DuckDB fails to initialize

**Possible causes**:
- DuckDB WASM assets missing or blocked by CSP
- Parquet file too large or corrupted
- Range requests not working

**Fix**:
1. Check `duckdbBaseUrl` in config
2. Set `parquetPreferBuffer: true` in config to force full download
3. Verify parquet file integrity:
   ```bash
   python3 -c "import duckdb; duckdb.connect().execute('SELECT * FROM read_parquet(\"data/parquet/routes.parquet\") LIMIT 1').show()"
   ```

### Issue: Filters don't work

**Possible causes**:
- Column names in parquet don't match expected schema
- Tile properties missing from PMTiles

**Fix**:
1. Check metadata.json for available modes/operators
2. Verify parquet schema:
   ```bash
   python3 -c "import duckdb; duckdb.connect().execute('DESCRIBE SELECT * FROM read_parquet(\"data/parquet/routes.parquet\")').show()"
   ```
3. Regenerate artifacts with updated source data

## Version Management

Current versioning strategy:
- Manual version string in `boot.js` (e.g., `APP_VERSION = "2025-12-25-7"`)
- Metadata includes `generatedAt` timestamp

**Recommendation**: Implement semantic versioning:
- Use package.json version
- Auto-increment on release
- Include version in artifact filenames (e.g., `routes-v1.2.3.pmtiles`)

## Future Improvements

- [ ] Automated deployment script
- [ ] Blue/green deployment for zero-downtime updates
- [ ] Artifact versioning with automatic cleanup
- [ ] Smoke tests in CI/CD before production deployment
- [ ] Real-time monitoring dashboard
- [ ] Automated rollback on error threshold
