# Refactoring Playbook

This document contains detailed guidelines and patterns for safely refactoring the NetworkView codebase, particularly when working with the modular architecture.

## Critical Rules for Refactoring & Integration Work

When performing module integration, code migration, or large-scale refactoring, follow these strict rules to avoid common pitfalls.

### 1. Never Delete Without Verification ⚠️

**ALWAYS verify code is truly duplicate before removing it:**

```bash
# WRONG: Aggressive deletion without checking
sed -n '1,1000p; 2000,$p' app.js > app_clean.js  # DANGER!

# RIGHT: Verify each function exists in modules first
grep -n "^const functionName\|^function functionName" public/js/**/*.js
# Only delete if found in a module
```

**Lessons Learned:**
- In Phase 3, we accidentally deleted 12 essential functions that were unique to app.js
- These weren't duplicates - they were UI-specific functions that shouldn't have been modularized
- Required git archaeology and careful restoration

**Protection Strategy:**
1. Create a backup before any large deletions: `cp app.js /tmp/app_backup.js`
2. Use grep to verify each function exists in modules
3. Delete incrementally, not in bulk
4. Run tests after each deletion batch

### 2. Function Signature Migration Pattern 🔄

When migrating from closure-based to parameter-based functions, you MUST update ALL call sites.

**Old Pattern (Closure-based):**
```javascript
// In app.js - uses closure to access elements
const buildWhere = () => {
  const modes = getSelectedValues(elements.modeFilter);  // Direct access
  const operators = getSelectedOperators();
  // ...
};

// Called without parameters
const where = buildWhere();  // No parameters needed
```

**New Pattern (Module with Parameters):**
```javascript
// In filters/builder.js - requires explicit parameters
export const buildWhere = (filters) => {
  const modes = filters.modes || [];  // Expects parameter
  const operators = filters.operators || [];
  // ...
};

// MUST pass filters object
const filters = getCurrentFilters();  // Helper to gather state
const where = buildWhere(filters);    // Pass parameters
```

**Required Steps:**
1. **Create Helper Function** - Bridge the gap between UI state and module parameters:
   ```javascript
   const getCurrentFilters = () => ({
     modes: getSelectedValues(elements.modeFilter),
     operators: getSelectedOperators(),
     timeBands: getSelectedTimeBands(),
     serviceSearch: getServiceSearchValue(),
     laValue: getSelectedValue(elements.laFilter),
     rptValue: getSelectedValue(elements.rptValue)
   });
   ```

2. **Update ALL Call Sites** - Search exhaustively:
   ```bash
   # Find ALL calls to the function
   grep -n "buildWhere\(" public/app.js

   # Update each one to pass parameters
   # Before: buildWhere()
   # After:  buildWhere(getCurrentFilters())
   ```

3. **Verify Signatures Match** - Check the module definition:
   ```bash
   # Check module signature
   grep -A 5 "export const buildWhere" public/js/filters/builder.js

   # Ensure all calls match the signature
   ```

**Common Functions Requiring This Pattern:**
- `buildWhere(filters)` - Filter WHERE clause construction
- `buildMapFilter(filters, tileFields)` - MapLibre filter expressions
- `hasAttributeFilters(filters)` - Check if filters are active
- `renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, filters)` - Table rendering
- `fitMapToBbox(map, bbox, reason, setStatus)` - Map bounds fitting
- `fitMapToScope(map, reason, setStatus, bboxFilterActive)` - Map scope fitting
- `detectTileFieldsFromRendered(map, layerId)` - Tile schema detection

### 3. Comprehensive Call Site Auditing 🔍

**After any refactoring, ALWAYS perform exhaustive verification:**

```bash
# 1. Search for all function calls
grep -n "functionName\(" public/app.js

# 2. Check each call has correct parameters
# Compare against module signature

# 3. Look for event handler bindings
grep -n "addEventListener.*functionName" public/app.js

# 4. Verify function is defined or imported
grep -n "^const functionName\|^function functionName\|import.*functionName" public/app.js
```

**Checklist for Each Refactored Function:**
- [ ] Module export signature documented
- [ ] All call sites identified (use grep)
- [ ] Each call site updated with correct parameters
- [ ] Event handlers properly bound
- [ ] Tests updated for new signatures
- [ ] No undefined function errors in browser console

### 4. Testing During Refactoring 🧪

**NEVER assume code is working without verification:**

```bash
# Run after EVERY significant change
npm test -- --run

# If tests pass but browser fails, check:
# 1. Browser cache (hard refresh: Cmd+Shift+R)
# 2. Console errors (open DevTools)
# 3. Network tab (ensure latest JS loaded)
```

**Red Flags:**
- ✅ Tests passing BUT browser console shows errors → **Cache issue**
- ❌ Tests failing → **Code issue, fix immediately**
- ⚠️ New functions without tests → **Write tests before continuing**

### 5. Import Statement Hygiene 📦

**Keep imports organized and complete:**

```javascript
// GOOD: Organized by module type
// Constants and config
import { COLORS, LAYER_IDS, ROUTE_LINE_WIDTH } from "./js/config/constants.js";

// State management
import { state, setConfig, setMap } from "./js/state/manager.js";

// Utilities (alphabetical)
import { generateColor, rgbaToHex } from "./js/utils/colors.js";
import { clearElement, escapeHtml } from "./js/utils/dom.js";
import { getFeaturesBbox, isValidBbox } from "./js/utils/geometry.js";

// Domain modules
import { buildWhere, hasAttributeFilters } from "./js/filters/builder.js";
import { fitMapToBbox, buildMapFilter } from "./js/map/utils.js";
```

**After adding imports, verify:**
```bash
# Check for unused imports
grep "^import.*from" app.js | while read line; do
  func=$(echo "$line" | grep -o '{[^}]*}' | tr -d '{},' | xargs)
  echo "$func" | tr ' ' '\n' | while read f; do
    [ -n "$f" ] && grep -q "$f" app.js || echo "Unused: $f"
  done
done
```

### 6. Namespace Migration for Constants 🏷️

**When moving constants to a namespace, update ALL references:**

```bash
# Find all old constant references
grep -n "DEFAULT_ROUTE_COLOR\|PREVIEW_ROUTE_COLOR\|SELECTED_ROUTE_COLOR" public/app.js

# Replace with namespace
sed -i '' 's/DEFAULT_ROUTE_COLOR/COLORS.DEFAULT_ROUTE/g' public/app.js
sed -i '' 's/PREVIEW_ROUTE_COLOR/COLORS.PREVIEW_ROUTE/g' public/app.js
sed -i '' 's/SELECTED_ROUTE_COLOR/COLORS.SELECTED_ROUTE/g' public/app.js

# Verify no old references remain
grep -n "DEFAULT_ROUTE_COLOR" public/app.js  # Should return nothing
```

### 7. Git Workflow for Large Refactors 🌿

**Always work on a feature branch:**

```bash
# Create branch for refactoring work
git checkout -b phase-3-integration

# Commit incrementally, not in one giant commit
git add public/app.js
git commit -m "Add module imports to app.js"

git add public/app.js
git commit -m "Update buildWhere calls with filter parameters"

git add public/app.js
git commit -m "Restore accidentally deleted UI functions"

# Push frequently
git push -u origin phase-3-integration
```

**Commit Messages Should:**
- ✅ Describe WHAT changed ("Update buildWhere calls with filter parameters")
- ✅ Reference WHY if not obvious ("Fix undefined 'modes' errors")
- ✅ Be atomic (one logical change per commit)
- ❌ Be vague ("fix stuff", "updates")

**Worktree Hygiene (Avoid "Git Mess"):**
- ✅ Use `git add -p` to split changes by concern (UI vs. data vs. docs).
- ✅ Keep local-only settings in `public/config.json` and mark with:
  `git update-index --skip-worktree public/config.json`
- ✅ Prefer a scratch worktree for experiments:
  `git worktree add ../NetworkView-scratch`
- ✅ If scope balloons, stash WIP with a name:
  `git stash push -u -m "wip spatial"`

### 8. Recovery Strategies 🔧

**If you accidentally delete important code:**

```bash
# 1. Find the commit before deletion
git log --oneline -20
# Look for commit before refactoring started

# 2. Extract the old file
git show <commit-hash>:public/app.js > /tmp/app_before_deletion.js

# 3. Find missing functions
# Compare current vs backup to identify what's missing

# 4. Extract specific functions by line number
sed -n '1234,1567p' /tmp/app_before_deletion.js >> public/app.js

# 5. Update any internal calls within restored functions
# Check for signature mismatches in restored code
```

### 9. Browser Cache Issues 🔄

**Code is correct but browser shows errors?**

```bash
# Verify code is actually correct
grep -n "buildMapFilter\(" public/app.js  # Check signatures

# Verify tests pass
npm test -- --run

# If both are good, it's cache
```

**Solutions:**
1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
2. Clear browser cache completely
3. Open DevTools → Network tab → Disable cache checkbox
4. Add cache busting to HTML: `<script src="app.js?v=2"></script>`

### 10. Documentation During Refactoring 📝

**Track your work as you go:**

Create or update progress tracking files:
- `PHASE3_PROGRESS.md` - Metrics and status
- Update `plan.md` - Document architectural decisions
- Comment in code - Explain non-obvious changes

**Example Progress Tracking:**
```markdown
## Phase 3: Module Integration

**Metrics:**
- Starting line count: 4,354 lines
- Current line count: 3,246 lines
- Reduction: 1,108 lines (25%)

**Functions Migrated:**
- ✅ buildWhere - 4 call sites updated
- ✅ buildMapFilter - 2 call sites updated
- ✅ renderTable - 15 call sites updated

**Functions Restored:**
- onApplyFilters (accidentally deleted, now restored)
- updateScopeChips (accidentally deleted, now restored)
[...]

**Tests:**
- 115 tests passing ✅
```

## Summary Checklist for Large Refactors

Before declaring refactoring work complete:

- [ ] All tests passing (`npm test`)
- [ ] No browser console errors (check DevTools)
- [ ] All function signatures verified against module definitions
- [ ] All call sites updated with correct parameters
- [ ] All event handlers properly bound
- [ ] No undefined function errors
- [ ] No old constant references (if renamed)
- [ ] Imports organized and complete
- [ ] Git commits are atomic and well-described
- [ ] Changes pushed to remote branch
- [ ] Documentation updated (progress, plan.md)
- [ ] Browser cache cleared if testing locally

## Common Patterns

**Building a SQL query**:
```javascript
import { escapeSql, quoteIdentifier, buildInClause } from "./js/utils/sql.js";

const modes = ["BUS", "COACH"];
const where = `WHERE ${quoteIdentifier("mode")} IN ${buildInClause(modes)}`;
```

**Accessing state**:
```javascript
import { state, setConfig } from "./js/state/manager.js";

setConfig(configData);  // Write with setter

if (state.duckdbReady) {  // Read directly
  // query data
}
```

**Working with colors**:
```javascript
import { generateColor, rgbaToHex } from "./js/utils/colors.js";

const color = generateColor("operator1");
const hex = rgbaToHex(color);
map.setPaintProperty("layer", "line-color", hex);
```

**Building filters**:
```javascript
import { buildWhere } from "./js/filters/builder.js";

const filters = {
  modes: ["BUS"],
  operators: [{value: "OP1", field: "operatorCode"}],
  laValue: "S12000033"
};

const whereClause = buildWhere(filters);
// Returns: "WHERE mode IN ('BUS') AND ..."
```
