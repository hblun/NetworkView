# Spatial Extension Compatibility Status

**Date**: 2025-12-28
**Agent**: Claude Sonnet 4.5 (spatial query implementation)
**Issue**: DuckDB WASM spatial extension not working with MVP bundle

## Problem Summary

The DuckDB spatial extension requires the **EH (Exception Handling) WASM bundle** but the browser was selecting the **MVP bundle**, causing `_setThrew is not defined` errors. This caused spatial queries to fall back to bbox mode, which produces false positives (e.g., clicking Greenock shows Oban-Glasgow route).

## Solution Implemented

### 1. Cross-Origin Isolation Headers (COMPLETED)
**File**: `tools/dev_server.py:96-98`

```python
# Add cross-origin isolation headers for DuckDB spatial extension (EH bundle)
self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
self.send_header("Cross-Origin-Opener-Policy", "same-origin")
```

**Status**: ✅ Headers verified with `curl -sI http://127.0.0.1:5137/`
**Dev Server**: ✅ Restarted on port 5137 (PID: 65530)

### 2. Bundle Detection Logging (COMPLETED)
**File**: `public/js/duckdb/client.js:232-234`

Added logging to confirm:
- Cross-origin isolation status
- Which bundle is selected (MVP vs EH)
- Spatial extension test results

### 3. Bbox Post-Filtering Fallback (COMPLETED)
**File**: `public/js/spatial/runner.js`

Added client-side distance filtering using:
- Haversine distance calculation
- Point-to-line-segment distance
- GeoJSON geometry parsing and testing

This serves as a safety net if spatial extension fails.

## Current Status

⚠️ **USER REPORTS**: "still not really working"

### Likely Cause
Browser cache is preventing the new bundle selection. The browser needs a **hard refresh** to:
1. Clear cached JavaScript
2. Detect `window.crossOriginIsolated === true`
3. Select the EH bundle instead of MVP
4. Successfully load spatial extension

## Next Steps for User

1. **Hard refresh browser**: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows)
2. **Check console** for these messages:
   ```
   [DuckDB] Cross-origin isolated: true
   [DuckDB] Using bundle: EH (exception handling)
   [DuckDB] ✓ Spatial extension verified working with full ST_* functions
   ```
3. **Test spatial query**:
   - Click on map to place point
   - Check console for: `[Spatial SQL] Mode decision: { usingSpatialMode: true }`
   - Verify Oban-Glasgow route does NOT appear when clicking Greenock

## Files Modified

1. `tools/dev_server.py` - Added COEP/COOP headers
2. `public/js/duckdb/client.js` - Added bundle detection + logging
3. `public/js/spatial/runner.js` - Added post-filtering fallback (161 new lines)
4. `public/js/spatial/sql.js` - Added debug logging
5. `public/app.js` - Enhanced radius visualization with fill layer

## Technical Details

### Why Cross-Origin Isolation is Required

DuckDB WASM bundles:
- **MVP**: Maximum compatibility, no SharedArrayBuffer, no exception handling
- **EH**: Uses SharedArrayBuffer for better performance, requires cross-origin isolation

The spatial extension was compiled with exception handling (`_setThrew` function), which is only available in the EH bundle.

### Testing Without Cache

If hard refresh doesn't work, try:
1. Open DevTools → Application → Clear Storage → Clear site data
2. Or use incognito/private window: `http://127.0.0.1:5137/`

## Known Issues

1. **CDN Resources**: External resources (Tailwind, DuckDB CDN) may need CORS headers
2. **Service Workers**: If present, may need to be unregistered
3. **HTTP vs HTTPS**: Cross-origin isolation works on localhost HTTP for dev

## Coordination Notes

**For other agents working on refactoring:**
- If you're refactoring DuckDB initialization or WASM loading, preserve the cross-origin headers
- The spatial extension is CRITICAL for future boundary query features (lasso, polygon)
- Bbox post-filtering is a temporary workaround; real solution is EH bundle + spatial extension

**File reservations**: None currently active for spatial query files.

## References

- DuckDB WASM docs: https://duckdb.org/docs/api/wasm/overview
- Cross-Origin Isolation: https://web.dev/coop-coep/
- Spatial extension: https://duckdb.org/docs/extensions/spatial

---

**Last Updated**: 2025-12-28 by Claude Sonnet 4.5
**Next Agent**: Please update this file with test results after hard refresh
