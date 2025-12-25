# Phase 3: Module Integration Plan

**Branch**: `phase-3-integration`
**Goal**: Integrate extracted modules into app.js and remove duplicated code
**Target**: Reduce app.js from 4,354 lines to <1,000 lines

## Current State

- ✅ 13 modules extracted and tested (Phase 2 complete)
- ✅ 107 tests passing
- ⚠️ app.js still contains duplicated implementations
- ⚠️ app.js not yet importing modules

## Integration Strategy

### Step 1: Add Module Imports (Low Risk)
Add imports at the top of app.js without removing existing code. This allows gradual migration with fallback.

**Files to import**:
```javascript
// Constants
import { COLORS, LAYER_IDS, ROUTE_LINE_WIDTH, SELECTED_LINE_WIDTH, NONE_OPTION_VALUE, TIME_BAND_OPTIONS, FIELD_CANDIDATES, TABLE_CONFIG, EXPORT_LIMITS } from "./js/config/constants.js";

// State management
import { state, setConfig, setMap, setDuckDBConnection, setSpatialReady, setSelectedFeature, clearSelectedFeature, setTableRows, setColumns } from "./js/state/manager.js";

// Utilities
import { escapeSql, quoteIdentifier, buildInClause, escapeLikePattern } from "./js/utils/sql.js";
import { generateColor, rgbaToHex, hslToRgb, hashString } from "./js/utils/colors.js";
import { clearElement, escapeHtml, getProp, getSelectedValues, getSelectedValue, formatCount, toNumber } from "./js/utils/dom.js";
import { joinUrl, toAbsoluteUrl, addCacheBuster } from "./js/utils/url.js";
import { getGeometryCoordinates, getFeaturesBbox, isValidBbox } from "./js/utils/geometry.js";

// Domain modules
import { initDuckDb, executeQuery, countRows, detectSchemaFields } from "./js/duckdb/client.js";
import { buildWhere, buildBboxFilter, buildCombinedWhere, hasAttributeFilters, getSelectedOperators, getSelectedTimeBands, getServiceSearchValue } from "./js/filters/builder.js";
import { fitMapToBbox, fitMapToScope, buildMapFilter, detectTileFieldsFromRendered } from "./js/map/utils.js";
import { renderTable, renderTableHead, getTableColumns, fetchTablePage, ensureTablePageFor, queryTable } from "./js/table/renderer.js";
import { queryCsv, queryGeoJson, downloadFile, confirmLargeExport, onDownloadCsv, onDownloadGeojson } from "./js/exports/handlers.js";
```

**Risk**: Low - Adding imports doesn't break existing code

### Step 2: Replace Function Calls (Medium Risk)
Replace calls to inline functions with module imports, one module at a time.

**Order of replacement** (least to most risky):
1. SQL utilities (simple, pure functions)
2. Color utilities (simple, pure functions)
3. DOM utilities (simple, pure functions)
4. Geometry utilities (simple, pure functions)
5. URL utilities (simple, pure functions)
6. Filter builders (moderate complexity)
7. Map utilities (moderate complexity)
8. Table rendering (high complexity, stateful)
9. Export handlers (moderate complexity)

**Testing**: Run `npm test -- --run` after each module replacement

### Step 3: Remove Duplicate Definitions (High Risk)
Remove inline function definitions that are now imported from modules.

**Strategy**:
- Comment out duplicates first, test
- If tests pass, delete commented code
- If tests fail, investigate discrepancies

**Expected removals**:
- ~200 lines: SQL/Color/DOM/Geometry/URL utilities
- ~300 lines: DuckDB client code
- ~250 lines: Filter building logic
- ~250 lines: Map utilities
- ~320 lines: Table rendering
- ~280 lines: Export handlers

**Total expected reduction**: ~1,600 lines

### Step 4: Verification (Critical)
After all changes, verify:

1. **All tests pass**: `npm test -- --run`
2. **Linting passes**: `npm run lint`
3. **Manual testing**:
   - App loads without errors
   - Filters work correctly
   - Table renders and pages
   - Map displays and updates
   - Exports generate files
   - Selection highlights work

### Step 5: Metrics and Documentation
- Measure final app.js line count
- Update REFACTORING_PROGRESS.md
- Create PHASE3_COMPLETION.md
- Document any issues encountered

## Risk Mitigation

1. **Incremental changes**: One module at a time
2. **Test after each change**: Catch regressions early
3. **Git commits**: Small, focused commits for easy rollback
4. **Branch protection**: Work stays on feature branch
5. **Code review**: PR review before merge to main

## Success Criteria

- ✅ app.js reduced to <1,000 lines
- ✅ All 107 tests passing
- ✅ Zero functionality regressions
- ✅ Linting passes
- ✅ Manual testing confirms all features work
- ✅ Documentation updated

## Timeline

**Estimated**: 2-3 hours for careful, tested integration

**Breakdown**:
- Step 1 (Imports): 15 minutes
- Step 2 (Replace calls): 60-90 minutes
- Step 3 (Remove duplicates): 30-45 minutes
- Step 4 (Verification): 30 minutes
- Step 5 (Documentation): 15 minutes

## Rollback Plan

If integration causes issues:
1. `git reset --hard HEAD` to undo uncommitted changes
2. `git revert <commit>` to undo specific commits
3. `git checkout main` to return to stable branch
4. Delete feature branch if necessary

## Next Steps After Phase 3

Once integration is complete and merged to main:
- **Phase 4**: Build pipeline (Vite, bundling, code splitting)
- **Phase 5**: Performance optimization (lazy loading, caching)

---

**Status**: Ready to begin
**Current Branch**: `phase-3-integration`
**Starting Line Count**: 4,354 lines
**Target Line Count**: <1,000 lines
**Expected Reduction**: ~3,400 lines (78%)
