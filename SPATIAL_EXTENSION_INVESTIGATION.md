# DuckDB Spatial Extension Investigation

## Problem Statement
Spatial queries fail with error: `st_point not in catalog`
Spatial extension fails to load in DuckDB-WASM 1.28.0

## Current Code Analysis

### Extension Loading Attempt ([public/js/duckdb/client.js:200-220](public/js/duckdb/client.js#L200-L220))

```javascript
// Try to load spatial extension
let spatialReady = false;
try {
  try {
    await conn.query("SET home_directory='/'");
    await conn.query("SET extension_directory='/'");
  } catch (homeError) {
    // Non-fatal; continue with default directories.
  }
  await conn.query("LOAD spatial");
  spatialReady = true;
} catch (loadError) {
  try {
    await conn.query("INSTALL spatial");
    await conn.query("LOAD spatial");
    spatialReady = true;
  } catch (error) {
    spatialReady = false;
  }
}
setSpatialReady(spatialReady);
```

**Current behavior**:
- First tries `LOAD spatial`
- If that fails, tries `INSTALL spatial` then `LOAD spatial`
- If both fail, sets `spatialReady = false` and continues silently

## Root Cause Analysis

### Issue 1: DuckDB-WASM Spatial Extension Availability

**DuckDB-WASM 1.28.0 spatial extension status**:
- The spatial extension for DuckDB-WASM requires pre-compiled WASM binaries
- Browser environment cannot download/compile extensions like CLI DuckDB
- `INSTALL spatial` likely fails because browser can't download extension files
- Extension directory setup (`SET extension_directory='/'`) may not work in WASM

### Issue 2: Missing Extension Files

```bash
$ ls public/duckdb/extensions/
Directory does not exist
```

The plan.md mentions:
> "Bundled DuckDB spatial extension under `public/duckdb/extensions/v0.9.1/wasm_mvp/`"

But these files don't exist in the current repo.

### Issue 3: Extension Version Mismatch

- Code tries to load spatial extension for DuckDB 1.28.0
- plan.md references `v0.9.1/wasm_mvp/` (old DuckDB version)
- Extension binaries must match DuckDB-WASM version exactly

## Solutions

### Solution 1: Pre-bundle Spatial Extension ⭐ (Recommended if Available)

**IF** DuckDB-WASM 1.28.0 has spatial extension available:

1. Download pre-compiled spatial extension WASM files
2. Place in `public/duckdb/extensions/v1.28.0/wasm_mvp/spatial.duckdb_extension.wasm`
3. Configure extension loading:

```javascript
// In initDuckDb, before trying to load
const extensionUrl = '/duckdb/extensions/v1.28.0/wasm_mvp/spatial.duckdb_extension.wasm';
try {
  await state.db.registerFileURL('spatial.duckdb_extension.wasm', extensionUrl);
  await conn.query(`LOAD '${extensionUrl}'`);
  spatialReady = true;
} catch (error) {
  console.warn('Spatial extension unavailable:', error);
  spatialReady = false;
}
```

**Problem**: DuckDB-WASM spatial extension may not exist for all versions!

### Solution 2: Use Bounding Box Fallback ⭐⭐ (Most Reliable)

**Current bbox support already exists!**

Looking at the code:
- [public/js/duckdb/client.js:94-103](public/js/duckdb/client.js#L94-L103): Detects bbox fields
- [public/js/filters/builder.js](public/js/filters/builder.js): Has `buildBboxFilter` with fallback
- Routes parquet has bbox columns: `min_lon`, `min_lat`, `max_lon`, `max_lat`

**Strategy**: Use bbox columns for spatial operations

```javascript
// Instead of ST_DWithin(geometry, ST_Point(lng, lat), distance)
// Use bbox expansion:

const expandBbox = (point, distanceMeters) => {
  // Approximate: 1 degree latitude ≈ 111,320 meters
  // 1 degree longitude ≈ 111,320 * cos(latitude) meters
  const latDelta = distanceMeters / 111320;
  const lngDelta = distanceMeters / (111320 * Math.cos(point.lat * Math.PI / 180));

  return {
    minLon: point.lng - lngDelta,
    minLat: point.lat - latDelta,
    maxLon: point.lng + lngDelta,
    maxLat: point.lat + latDelta
  };
};

// SQL WHERE clause:
const bbox = expandBbox(point, distance);
const whereClause = `
  max_lon >= ${bbox.minLon} AND min_lon <= ${bbox.maxLon} AND
  max_lat >= ${bbox.minLat} AND min_lat <= ${bbox.maxLat}
`;
```

**Advantages**:
- ✅ Works immediately (bbox columns already in parquet)
- ✅ No extension required
- ✅ Fast (indexed bbox checks)
- ✅ No browser compatibility issues

**Limitations**:
- ❌ Less accurate (bbox intersection, not true distance)
- ❌ Returns more results than exact spatial (acceptable for most use cases)
- ❌ Can't do "Touches boundary" or "Inside boundary" without geometries

### Solution 3: Client-Side Haversine Refinement

Combine bbox with client-side distance calculation:

```javascript
// 1. Query with bbox (over-selects)
const sql = `SELECT * FROM routes WHERE ${bboxWhere}`;
const results = await conn.query(sql);

// 2. Filter by exact distance in JavaScript
const filtered = results.filter(route => {
  const distance = haversineDistance(point, routeCentroid(route));
  return distance <= targetDistance;
});
```

**Haversine formula** (already partially exists in [public/js/utils/geometry.js:96-132](public/js/utils/geometry.js#L96-L132)):

```javascript
const haversineDistance = (point1, point2) => {
  const R = 6371000; // Earth radius in meters
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};
```

### Solution 4: Try DuckDB-WASM Newer Version

Check if newer DuckDB-WASM versions have better spatial support:
- DuckDB 1.28.0 (current)
- Latest: Check https://github.com/duckdb/duckdb-wasm/releases

**Risk**: May have breaking changes

## Recommended Approach

### Phase 1: Implement Bbox Fallback (Immediate)

1. **Update spatial SQL builder** to use bbox when `!spatialReady`
2. **Keep spatial extension attempt** for future compatibility
3. **Document limitation** in UI/evidence

**Code changes**:

```javascript
// public/js/spatial/sql.js (new file)
export const buildPointDistanceWhere = (point, distanceMeters, spatialReady = false) => {
  if (spatialReady && state.geometryField) {
    // Use true spatial functions
    return `ST_DWithin(${state.geometryField}, ST_Point(${point.lng}, ${point.lat}), ${distanceMeters})`;
  } else if (state.bboxReady) {
    // Fallback to bbox
    const latDelta = distanceMeters / 111320;
    const lngDelta = distanceMeters / (111320 * Math.cos(point.lat * Math.PI / 180));

    return `
      max_lon >= ${point.lng - lngDelta} AND
      min_lon <= ${point.lng + lngDelta} AND
      max_lat >= ${point.lat - latDelta} AND
      min_lat <= ${point.lat + latDelta}
    `;
  } else {
    throw new Error('Neither spatial extension nor bbox fields available');
  }
};
```

### Phase 2: Client-Side Refinement (Nice-to-have)

After bbox query, refine with Haversine if result set is manageable (<10K rows).

### Phase 3: Investigate Spatial Extension Bundle

Research if DuckDB-WASM 1.28.0 or newer has spatial extension:
- Check official docs
- Check GitHub releases
- Test with latest version

## Implementation Plan

### Task 1: Create Spatial SQL Generator with Bbox Fallback
**File**: `public/js/spatial/sql.js`
**Status**: New file needed
**Priority**: P1

### Task 2: Update Runner to Use SQL Generator
**File**: `public/js/spatial/runner.js`
**Status**: Replace stub
**Priority**: P1

### Task 3: Disable Boundary Operators When Spatial Unavailable
**File**: `public/js/spatial/builder.js`
**Status**: Update getOperatorOptions
**Priority**: P2

```javascript
const getOperatorOptions = (blockType) => {
  if (blockType === "exclude") {
    return { /* operator/mode */ };
  } else {
    // Only show operators that work without spatial extension
    const baseOperators = [
      `<option value="near_point">Near point</option>`
    ];

    if (state.spatialReady && state.geometryField) {
      baseOperators.push(
        `<option value="touches_boundary">Touches boundary</option>`,
        `<option value="inside_boundary">Inside boundary</option>`
      );
    }

    return {
      operator: baseOperators.join(''),
      valueSelect: /* ... */
    };
  }
};
```

### Task 4: Add Status Message About Spatial Limitation
**File**: `public/js/spatial/builder.js` or UI
**Priority**: P2

```javascript
if (!state.spatialReady) {
  // Show info message: "Using approximate bbox matching (spatial extension unavailable)"
}
```

## Testing Strategy

### Test 1: Bbox Query
```javascript
// In browser console after DuckDB init:
const conn = await state.db.connect();
const result = await conn.query(`
  SELECT service_id, min_lon, min_lat, max_lon, max_lat
  FROM routes
  WHERE max_lon >= -4.5 AND min_lon <= -4.0
    AND max_lat >= 55.5 AND min_lat <= 56.0
  LIMIT 10
`);
console.log(result.toArray());
```

### Test 2: Verify spatialReady State
```javascript
console.log('Spatial ready:', state.spatialReady);
console.log('Bbox ready:', state.bboxReady);
console.log('Bbox fields:', state.bboxFields);
```

### Test 3: Spatial Extension Attempt
```javascript
const conn = await state.db.connect();
try {
  await conn.query("SELECT ST_Point(0, 0)");
  console.log("✅ Spatial extension works!");
} catch (err) {
  console.log("❌ Spatial extension error:", err.message);
}
```

## Decision Matrix

| Solution | Works Now | Accurate | Fast | Maintenance |
|----------|-----------|----------|------|-------------|
| Pre-bundle extension | ❓ Unknown | ✅ Yes | ✅ Yes | ⚠️ Version sync |
| Bbox fallback | ✅ Yes | ⚠️ Approximate | ✅ Yes | ✅ Low |
| Bbox + Haversine | ✅ Yes | ✅ Exact | ⚠️ Slower | ⚠️ Medium |
| Upgrade DuckDB | ❓ Unknown | ✅ Yes | ✅ Yes | ⚠️ Breaking changes |

## Recommendation

**Use Bbox Fallback (Solution 2)** as primary implementation:

1. ✅ Immediate solution (no external dependencies)
2. ✅ Good enough accuracy for most planning use cases
3. ✅ Fast and reliable
4. ✅ Already have bbox columns in data
5. ⚠️ Document "approximate within X meters" in UI

Keep spatial extension attempt in code for future when/if it becomes available.

## Next Steps

1. ✅ Create this investigation document
2. ⏭️ Implement `public/js/spatial/sql.js` with bbox fallback
3. ⏭️ Update `public/js/spatial/runner.js` to execute queries
4. ⏭️ Test with real data
5. ⏭️ Add UI messaging about approximation
6. ⏭️ Update NetworkView-3uh.1 with findings
