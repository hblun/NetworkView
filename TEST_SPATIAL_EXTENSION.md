# Testing DuckDB Spatial Extension

## Current Status

According to [DuckDB Extensions in WASM (Dec 2023)](https://duckdb.org/2023/12/18/duckdb-extensions-in-wasm), the spatial extension IS supported in DuckDB-WASM.

Our code in `public/js/duckdb/client.js:200-221` attempts to load it via:
```javascript
await conn.query("LOAD spatial");
// If that fails:
await conn.query("INSTALL spatial");
await conn.query("LOAD spatial");
```

## Why It Might Be Failing

1. **Network Issues**: Extensions are fetched from `extensions.duckdb.org` - needs CORS
2. **Version Mismatch**: We're using DuckDB-WASM 1.28.0, latest is 1.33.0
3. **Spatial Not Available**: Spatial might not be in the WASM extensions list

## How to Test

### Test 1: Check Console Logs
Open browser console after app loads and look for:
```
[DuckDB] Installing spatial extension...
[DuckDB] Spatial extension installed and loaded successfully
```
OR
```
[DuckDB] Spatial extension unavailable: [error message]
[DuckDB] Using bbox fallback for spatial queries
```

### Test 2: Manual Test in Browser Console
After app loads, run:
```javascript
const conn = await state.db.connect();
try {
  await conn.query("INSTALL spatial");
  await conn.query("LOAD spatial");
  const result = await conn.query("SELECT ST_Point(0, 0) as geom");
  console.log("✅ Spatial extension works!", result.toArray());
  await conn.close();
} catch (err) {
  console.error("❌ Spatial extension failed:", err.message);
  await conn.close();
}
```

### Test 3: Check Extension Availability
```javascript
const conn = await state.db.connect();
const result = await conn.query(`
  SELECT * FROM duckdb_extensions() WHERE extension_name = 'spatial'
`);
console.log("Spatial extension info:", result.toArray());
await conn.close();
```

## Possible Solutions

### Solution 1: Upgrade DuckDB-WASM
Update to latest version in `public/app.js`:
```javascript
// Current:
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

// Try latest:
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/+esm";
```

**Risk**: May have breaking changes

### Solution 2: Pre-install Extension
According to [Sparkgeo blog](https://sparkgeo.com/blog/a-duckdb-wasm-web-mapping-experiment-with-parquet/), you can:
1. Download spatial extension WASM file
2. Host it locally
3. Install from local URL:
```javascript
await conn.query("INSTALL spatial FROM '/duckdb/extensions/spatial.duckdb_extension.wasm'");
await conn.query("LOAD spatial");
```

### Solution 3: Check CORS on extensions.duckdb.org
The extension download might be blocked by CORS. Check network tab in browser DevTools.

### Solution 4: Use Different Bundle
Try different DuckDB bundle (eh vs mvp):
```javascript
// In config.json:
{
  "duckdbBundle": "eh" // or "mvp", "coi"
}
```

## Expected Behavior if Working

If spatial extension loads successfully:
1. `state.spatialReady` will be `true`
2. Console shows: `[DuckDB] Spatial extension loaded successfully`
3. Spatial queries will use `ST_DWithin`, `ST_Intersects`, etc.
4. Boundary operators (Touches/Inside) will work

## Expected Behavior if Not Working

If spatial extension fails:
1. `state.spatialReady` will be `false`
2. Console shows: `[DuckDB] Using bbox fallback for spatial queries`
3. Spatial queries will use bbox approximation
4. Boundary operators will throw errors

## Next Steps

1. **Run tests above** to determine exact failure mode
2. **Check browser console** for error messages
3. **Try upgrading DuckDB-WASM** to latest version
4. **Report findings** back to determine if spatial is truly available

## Sources

- [DuckDB Extensions in WASM (Dec 2023)](https://duckdb.org/2023/12/18/duckdb-extensions-in-wasm)
- [DuckDB-WASM Extensions Docs](https://duckdb.org/docs/stable/clients/wasm/extensions)
- [Load spatial extension in JavaScript (GitHub Discussion)](https://github.com/duckdb/duckdb-wasm/discussions/1621)
- [DuckDB-WASM GitHub](https://github.com/duckdb/duckdb-wasm)
- [Sparkgeo DuckDB-WASM Mapping Experiment](https://sparkgeo.com/blog/a-duckdb-wasm-web-mapping-experiment-with-parquet/)
