# Spatial Query Implementation Plan

## Current State Assessment (2025-12-26)

### ✅ Completed
1. **UI Layer (Complete)**
   - Full visual query builder in `public/js/spatial/builder.js` (438 lines)
   - Builder/Templates tabs
   - Find/That/Dist/Of controls
   - Include/Also Include/Exclude block system with structured operators
   - Plain-English summary generation
   - Color-coded pills with tooltips (tooltips have a bug - NetworkView-5iz)
   - Scrollable blocks container (has overflow bug - NetworkView-8z1)
   - Template presets (Proximity, Overlap, Catchment, Route Link)
   - Integration in `public/index.html` with feature flag `spatialQuery: true`

2. **State Management (Complete)**
   - Spatial state in `public/js/state/manager.js`
   - Point selection tracking
   - Match set storage
   - Builder instance registration

3. **Map Integration (Partial)**
   - Spatial point marker overlay
   - Radius circle visualization
   - Point picker interaction (`spatialLogicPickPoint` click handler)
   - Overlay update on query changes

### ❌ Not Working / Incomplete

1. **DuckDB Spatial Extension (BLOCKER)**
   - **Issue**: NetworkView-3uh.1 - DuckDB spatial extension not loading
   - Console errors: `st_point not in catalog`, `enable_external_access` errors
   - Spatial queries fail silently or return no results
   - This blocks ALL spatial query execution

2. **Query Execution Pipeline (Stub)**
   - `public/js/spatial/runner.js` returns `null` (1 line stub)
   - `public/js/spatial/execute.js` exists but expects compiled query from runner
   - No SQL generation from builder state
   - No DuckDB query execution
   - No match set population

3. **Block Operator Translation (Missing)**
   - Blocks compile to data structure but don't generate SQL
   - Operators (Near point, Touches boundary, Inside boundary) not mapped to ST_ functions
   - Exclude by operator/mode not wired to attribute filters
   - Distance parameters not translated to ST_DWithin

4. **Integration Bugs**
   - NetworkView-4mh: Simple filters broken after spatial logic changes
   - serviceIdsActive gating may interfere with normal filters
   - Spatial match set may not clear properly when tool inactive

## Critical Path to Working Implementation

### Phase 1: Fix DuckDB Spatial Extension (BLOCKER)
**Bead**: NetworkView-3uh.1
**Priority**: P1 (blocks everything else)

**Investigation needed**:
1. Verify DuckDB-WASM version supports spatial extension
2. Check if spatial extension bundle is correctly loaded
3. Test spatial extension installation in browser environment
4. Consider fallback: bounding box calculations without ST_ functions

**Acceptance**:
- `SELECT ST_Point(0, 0)` works in browser DuckDB
- No console errors about spatial extension
- OR: documented fallback strategy if spatial unavailable

**Files to check**:
- `public/js/duckdb/init.js` - extension loading
- `public/duckdb/extensions/` - bundled extension files
- `tools/fetch_duckdb_spatial_extension.sh` - extension fetch script

**Workaround Option** (if spatial extension blocked):
- Use bbox columns (`min_lon`, `min_lat`, `max_lon`, `max_lat`) for point-in-bounds checks
- Approximate distance with Haversine formula in JavaScript
- Disable "Touches boundary" and "Inside boundary" operators
- Keep "Near point" using bbox expansion

---

### Phase 2: Implement Query Compilation
**Dependencies**: Phase 1 must be resolved OR fallback strategy chosen

**Task 1: SQL Generator for Point + Distance**
Create `public/js/spatial/sql.js` (or enhance existing stub)

```javascript
/**
 * Generates DuckDB SQL for spatial query
 * @param {object} compiled - Builder compiled state
 * @param {object} point - {lat, lng} selected point
 * @returns {string} SQL WHERE clause
 */
export const buildSpatialWhere = (compiled, point) => {
  // Main block: find routes within/intersecting distance of target
  const { find, relation, target, distance, blocks } = compiled;

  let conditions = [];

  // Main condition
  if (target === 'selected_point' && point) {
    if (relation === 'within') {
      // ST_DWithin(geometry, ST_Point(lng, lat), distance)
      // OR fallback: bbox check
      conditions.push(buildPointDistanceCondition(point, distance));
    } else if (relation === 'intersects') {
      // ST_Intersects(geometry, ST_Buffer(ST_Point(lng, lat), distance))
      conditions.push(buildPointIntersectsCondition(point, distance));
    }
  } else if (target === 'boundary') {
    // Use boundary geometry from state
    conditions.push(buildBoundaryCondition(relation));
  }

  // Additional blocks
  blocks.slice(1).forEach(block => {
    const blockCondition = buildBlockCondition(block, point);
    if (blockCondition) {
      if (block.type === 'exclude') {
        conditions.push(`NOT (${blockCondition})`);
      } else {
        // Include/Also Include = OR
        conditions.push(blockCondition);
      }
    }
  });

  return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
};
```

**Task 2: Implement Runner**
Update `public/js/spatial/runner.js`:

```javascript
import { buildSpatialWhere } from './sql.js';

export const loadSpatialLogicRunner = async (config, setStatus) => {
  // Return runner instance with run method
  return {
    async run(compiled, point, duckdb) {
      if (!compiled || !point) {
        return { serviceIds: [], count: 0 };
      }

      try {
        const whereClause = buildSpatialWhere(compiled, point);
        const sql = `
          SELECT DISTINCT service_id
          FROM routes
          WHERE ${whereClause}
        `;

        const conn = await duckdb.connect();
        const result = await conn.query(sql);
        const serviceIds = result.toArray().map(row => row.service_id);
        await conn.close();

        return { serviceIds, count: serviceIds.length };
      } catch (err) {
        setStatus(`Spatial query error: ${err.message}`);
        return { serviceIds: [], count: 0 };
      }
    }
  };
};
```

**Task 3: Wire Runner to Builder**
Update builder's `run` event handler in `public/app.js`:

```javascript
onRun: async (compiled) => {
  if (!spatialLogicRunner || !state.spatialQuery?.point) {
    setStatus('Please select a point on the map first.');
    return;
  }

  const result = await spatialLogicRunner.run(
    compiled,
    state.spatialQuery.point,
    state.duckdb
  );

  setSpatialMatchSet(new Set(result.serviceIds));
  setStatus(`Spatial query: ${result.count} routes found.`);
  onApplyFilters({ autoFit: true });
}
```

**Files to create/update**:
- `public/js/spatial/sql.js` (new or update existing stub)
- `public/js/spatial/runner.js` (replace stub)
- `public/app.js` (update onRun handler)

---

### Phase 3: Fix Integration Issues

**Task 1: Fix Simple Filters (NetworkView-4mh)**
Ensure spatial match set doesn't interfere with normal filters:

In `public/js/filters/builder.js`:
```javascript
// Only apply spatial match set if spatial query is active
const spatialActive = state.spatialBuilder?.compiled !== null;
if (spatialActive && state.spatialMatchSet?.size > 0) {
  // Apply spatial filter
} else {
  // Normal filters only
}
```

**Task 2: Clear Spatial State Properly**
Ensure "Clear" button resets everything:
- Builder state
- Match set
- Point selection
- Map overlays

**Task 3: Point Selection Flow**
Verify map click → point selection → label update → overlay render chain works:
1. Click "Pick Point on Map"
2. Map click handler sets point in state
3. Label updates with coordinates
4. Point marker appears
5. User can adjust distance
6. User clicks "Run Query"
7. Results appear in table/map

---

### Phase 4: Operator Implementation

**Task 1: Spatial Operators**
Implement each spatial operator:

1. **Near point** (distance-based)
   ```sql
   ST_DWithin(geometry, ST_Point(?, ?), ?)
   -- Fallback: bbox expansion check
   ```

2. **Touches boundary** (boundary intersection)
   ```sql
   ST_Touches(geometry, ST_GeomFromText(?))
   ```

3. **Inside boundary** (containment)
   ```sql
   ST_Within(geometry, ST_GeomFromText(?))
   ```

**Task 2: Attribute Operators (Exclude)**
Map operator/mode exclusions to WHERE clauses:

```javascript
if (block.operator === 'operator' && block.value) {
  return `operator = '${block.value}'`;
} else if (block.operator === 'mode' && block.value) {
  return `mode = '${block.value}'`;
}
```

**Task 3: Block Logic Combination**
Implement Include/Also Include/Exclude boolean logic:
- Include: AND
- Also Include: OR
- Exclude: AND NOT

---

## Bead Reconciliation

### Blockers
- **NetworkView-3uh.1** (P1) - DuckDB spatial extension → **Phase 1**
- **NetworkView-4mh** (P1) - Simple filters broken → **Phase 3 Task 1**

### UI Bugs (Low Impact)
- **NetworkView-8z1** (P2) - Block overflow → CSS fix
- **NetworkView-5iz** (P2) - Tooltips not working → HTML title attribute issue

### Should Close (Already Done)
- **NetworkView-wrn** (P2) - SQ-01 UI shell + state → ✅ Complete
- **NetworkView-1tt.1** (P2) - SLB-01 Builder UI shell + state → ✅ Complete

### Epic Tracking
- **NetworkView-1tt** (P1) - Epic: Simplified Spatial Logic Builder
  - UI complete, execution blocked by Phase 1-2
- **NetworkView-3uh** (P1) - Epic: Spatial Query Tool (Point + Boundary)
  - Blocked by DuckDB spatial extension

### New Beads Needed

1. **Implement Spatial SQL Generator**
   - Priority: P1
   - Dependencies: NetworkView-3uh.1 resolution
   - Deliverable: `public/js/spatial/sql.js` with buildSpatialWhere
   - Acceptance: Builder state compiles to valid SQL

2. **Implement Spatial Query Runner**
   - Priority: P1
   - Dependencies: SQL generator
   - Deliverable: `public/js/spatial/runner.js` with DuckDB execution
   - Acceptance: Run button executes query and populates match set

3. **Wire Point Selection Flow**
   - Priority: P2
   - Deliverable: Complete map click → query → results pipeline
   - Acceptance: User can pick point, run query, see filtered results

4. **Implement Block Operator Logic**
   - Priority: P2
   - Deliverable: All operators generate correct SQL
   - Acceptance: Each operator type (Near point, Touches boundary, etc.) works

---

## Risk Assessment

### High Risk
1. **DuckDB Spatial Extension May Not Work in Browser**
   - Mitigation: Fallback to bbox + Haversine calculations
   - Impact: Loss of "Touches boundary" and "Inside boundary" operators
   - Timeline: Could delay by 1-2 weeks if fallback needed

### Medium Risk
2. **Performance with Large Result Sets**
   - Spatial queries may be slow on full dataset
   - Mitigation: Add result limits, show loading states
   - Consider pre-computing common queries

3. **Boundary Geometry Complexity**
   - LA/RPT boundaries may be too complex for browser ST_ functions
   - Mitigation: Simplify geometries in preprocessing

### Low Risk
4. **Block Logic Complexity**
   - Combining Include/Exclude with AND/OR/NOT
   - Mitigation: Well-defined in SLB spec, testable

---

## Testing Strategy

### Unit Tests
- SQL generator for each operator type
- Block compilation logic
- Match set intersection/union

### Integration Tests
- Point selection → query execution
- Spatial + attribute filter combination
- Clear/reset flows

### E2E Tests
- Full workflow: pick point → set distance → add blocks → run → verify results
- Regression: ensure simple filters still work

---

## Next Steps (Recommended Order)

1. **Investigate NetworkView-3uh.1** - DuckDB spatial extension issue
   - Determine if fixable or if fallback needed
   - Document findings and decision

2. **Create Phase 2 Beads** - SQL generator + runner implementation
   - Break into small, testable tasks
   - Assign priorities

3. **Fix NetworkView-4mh** - Simple filters regression
   - Quick win to restore basic functionality
   - May reveal spatial state issues

4. **Implement fallback strategy** (if spatial extension blocked)
   - Bbox + Haversine for "Near point"
   - Disable boundary operators
   - Update UI to show limitations

5. **Complete Phase 2** - Get basic point queries working
   - Focus on "Near point" operator first
   - Validate with single-block queries

6. **Complete Phase 3** - Wire everything together
   - Point selection flow
   - Result rendering
   - State management

7. **Complete Phase 4** - Full operator support
   - All spatial operators
   - Exclude logic
   - Complex multi-block queries

---

## Timeline Estimate

**Optimistic** (if spatial extension works):
- Phase 1: 2-3 days (investigation + fix)
- Phase 2: 3-5 days (SQL + runner)
- Phase 3: 2-3 days (integration)
- Phase 4: 3-4 days (operators)
- **Total: ~2 weeks**

**Realistic** (with blockers):
- Phase 1: 5-7 days (may need fallback)
- Phase 2: 5-7 days (fallback complexity)
- Phase 3: 3-4 days
- Phase 4: 4-5 days
- **Total: 3-4 weeks**

**Pessimistic** (major spatial issues):
- Fallback implementation: 10-14 days
- Limited operator support
- **Total: 4-6 weeks**
