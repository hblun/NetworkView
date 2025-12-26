# AGENTS.md

## Purpose
Document the run-time rules and expectations codified for agents working in the NetworkView repo.

## Primary instructions
- Treat `plan.md` as the authoritative roadmap for product priorities and intent. It describes phases, definitions, and risks. It is not the task tracker.
- The `public/` folder contains the entire network view runtime: `index.html`, `styles.css`, and modular JavaScript. See **Modular Architecture** section below for structure.
- Any work reviewing or extending the viewer should also check `README.md` for quick-start scripts and data-generation helpers.
- Baseline documentation should live alongside the roadmap to capture dataset expectations, runtime dependencies, and verification steps.

## Modular Architecture (Important!)

The codebase has been refactored into a **modular architecture**. Understanding this structure is critical for effective work.

### Module Structure

```
public/js/
├── config/
│   └── constants.js          # Application constants (COLORS, LAYER_IDS, etc.)
├── state/
│   └── manager.js             # Centralized state management
├── utils/
│   ├── sql.js                 # SQL query building (escapeSql, quoteIdentifier)
│   ├── colors.js              # Color generation (generateColor, rgbaToHex)
│   ├── dom.js                 # DOM utilities (clearElement, escapeHtml)
│   ├── url.js                 # URL manipulation (joinUrl, addCacheBuster)
│   └── geometry.js            # Spatial utilities (getFeaturesBbox, isValidBbox)
├── duckdb/
│   └── client.js              # DuckDB initialization and queries
├── map/
│   └── utils.js               # Map rendering utilities
├── filters/
│   └── builder.js             # Filter logic and WHERE clause construction
├── table/                     # (Future) Table rendering
└── exports/                   # (Future) Export functionality
```

### How Modules Connect

**Dependency Flow** (lower modules have no dependencies on higher ones):
```
constants.js  ← No dependencies (foundation)
    ↓
utils/*.js    ← Import constants only
    ↓
state.js      ← Import constants + utils
    ↓
duckdb/       ← Import state + utils
filters/      ← Import state + utils
map/          ← Import state + utils
    ↓
app.js        ← Imports all modules
```

### Using Modules

**Always use imports at the top of files**:
```javascript
// Import from modules (NOT from app.js)
import { escapeSql, quoteIdentifier } from "./js/utils/sql.js";
import { state, setConfig, setMap } from "./js/state/manager.js";
import { COLORS, LAYER_IDS } from "./js/config/constants.js";
import { generateColor, rgbaToHex } from "./js/utils/colors.js";
import { buildWhere } from "./js/filters/builder.js";
```

**Key Modules to Know**:

1. **constants.js** - All magic values live here
   - Use `COLORS.DEFAULT_ROUTE` instead of `"#d6603b"`
   - Use `LAYER_IDS.BASE` instead of `"routes-line"`

2. **state/manager.js** - Access application state
   - Read: `state.config`, `state.map`, `state.duckdbReady`
   - Write: Use setters like `setMap()`, `setConfig()`, `setSelectedFeature()`
   - Debug: `window.__NV_STATE` in browser console

3. **utils/sql.js** - Build safe SQL queries
   - `escapeSql()` - Prevent SQL injection
   - `quoteIdentifier()` - Quote column/table names
   - `buildInClause()` - Build IN clauses

4. **filters/builder.js** - Filter logic
   - `buildWhere(filters)` - Construct WHERE clause
   - `buildCombinedWhere()` - Combine attribute + bbox filters

5. **duckdb/client.js** - Database operations
   - `initDuckDb(config, duckdb, setStatus)` - Initialize DuckDB
   - `executeQuery(sql)` - Run queries
   - `detectSchemaFields(columns)` - Auto-detect schema

6. **map/utils.js** - Map operations
   - `fitMapToBbox(map, bbox)` - Fit to bounds
   - `buildMapFilter(filters, tileFields)` - MapLibre filter expressions
   - `detectTileFieldsFromRendered(map, layerId)` - Detect tile schema

### Testing

**All utility modules are 100% tested**. When modifying code:

1. **Run existing tests**: `npm test`
2. **Add tests for new functions** in `tests/`
3. **Verify coverage**: `npm run test:coverage`

Test files mirror module structure:
```
tests/
├── sql.test.js          # Tests for utils/sql.js
├── colors.test.js       # Tests for utils/colors.js
├── dom.test.js          # Tests for utils/dom.js
└── geometry.test.js     # Tests for utils/geometry.js
```

### Documentation

**Essential reading** (in order):
1. **README.md** - Setup and quick start
2. **MODULARIZATION_GUIDE.md** - Complete module architecture guide
3. **DEPLOYMENT.md** - Deployment procedures
4. **REFACTORING_PROGRESS.md** - Current state and metrics

### Best Practices for Agents

**DO**:
✅ Import from modules, not from app.js
✅ Use constants from `constants.js` instead of magic values
✅ Use state setters instead of direct mutation
✅ Write tests for new utility functions
✅ Keep modules under 300 lines
✅ Follow existing module patterns
✅ Check `MODULARIZATION_GUIDE.md` for examples

**DON'T**:
❌ Add code directly to app.js (use modules)
❌ Create circular dependencies between modules
❌ Mutate state directly (use setters)
❌ Use magic strings/numbers (add to constants.js)
❌ Skip writing tests for new functions
❌ Mix concerns in a single module

## Code Housekeeping & Structure Requirements

### Critical Rules for Refactoring & Integration Work

When performing module integration, code migration, or large-scale refactoring, follow these strict rules to avoid common pitfalls:

#### 1. **Never Delete Without Verification** ⚠️

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

#### 2. **Function Signature Migration Pattern** 🔄

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

#### 3. **Comprehensive Call Site Auditing** 🔍

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

#### 4. **Testing During Refactoring** 🧪

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

#### 5. **Import Statement Hygiene** 📦

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

#### 6. **Namespace Migration for Constants** 🏷️

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

#### 7. **Git Workflow for Large Refactors** 🌿

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

#### 8. **Recovery Strategies** 🔧

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

#### 9. **Browser Cache Issues** 🔄

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

#### 10. **Documentation During Refactoring** 📝

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

### Summary Checklist for Large Refactors

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

### Common Patterns

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

## Skills referenced by this repo
- `skill-creator`: located at `/Users/home/.codex/skills/.system/skill-creator/SKILL.md`. Use when the user asks to author a new skill or extend capability-specific guidance.
- `skill-installer`: located at `/Users/home/.codex/skills/.system/skill-installer/SKILL.md`. Use when the user requests installing/listing skills or pulling a skill from another repo.

## Agent behavior notes
- Only load additional files when directly relevant; the config and public assets usually provide enough context.
- When multiple skills are triggered (e.g., by name or by a task that matches a description), execute them in the order they are mentioned and note the sequence.
- If a skill named in the request cannot be found, call it out briefly and default to standard repo tooling.
- Update `plan.md` with any discoveries, blockers, or doc work product; the plan doubles as the decision log for prioritization conversations.
- Track open work in Beads: issues live in `.beads/issues.jsonl` and are managed with the `bd` CLI (`bd list`, `bd create`, `bd update`, `bd close`). Beads is the source of truth for actionable tasks; `plan.md` stays as the roadmap and intent.
- When creating Beads issues, include enough detail to act without reopening `plan.md`: phase, scope, acceptance criteria, risks/dependencies, and any relevant files/commands.
- After working on a Beads task, add a `bd comment` summarizing what you did, key files touched, and any follow-ups.

## Task Tracking, Bugs, and Features with Beads

### Overview

**Beads** is the task tracking system for NetworkView. All actionable work items (tasks, bugs, features, tech debt) are tracked as Beads issues in `.beads/issues.jsonl`.

**Key Principle:** `plan.md` = strategic roadmap, Beads = tactical execution

### When to Create Beads Issues

**ALWAYS create a Bead when:**

1. **During Refactoring** - You discover work that should be done later
   ```bash
   # Example: During Phase 3, you notice table sorting is broken
   bd create --title "Fix table sorting after modularization" \
     --type bug \
     --body "Table column sorting broken after Phase 3 refactor. Click handlers may not be bound correctly."
   ```

2. **Bug Discovery** - You find a bug while working
   ```bash
   bd create --title "Map doesn't fit to bounds on initial load" \
     --type bug \
     --priority high \
     --body "Steps to reproduce:
   1. Load app with fresh dataset
   2. Map shows default view instead of fitting to data bounds

   Expected: Map should fit to dataset.bbox from metadata.json
   Actual: Shows London default view

   Files: public/app.js line 2891 (loadInitialDatasetView)
   Root cause: fitMapToBbox called before map 'load' event fires"
   ```

3. **Feature Ideas** - You think of improvements while working
   ```bash
   bd create --title "Add keyboard shortcuts for filter actions" \
     --type feature \
     --body "Add keyboard shortcuts:
   - Cmd+Enter: Apply filters
   - Cmd+K: Clear filters
   - Cmd+/: Focus search box

   Would improve UX for power users.
   Dependencies: None
   Files to modify: public/app.js event listeners section"
   ```

4. **Tech Debt** - You notice code that needs cleanup
   ```bash
   bd create --title "Refactor updateEvidence into evidence module" \
     --type task \
     --body "The updateEvidence function (400+ lines) should be extracted to public/js/evidence/builder.js

   Benefits:
   - Reduces app.js size
   - Makes evidence logic testable
   - Follows modular architecture pattern

   Blocked by: Phase 3 completion
   Estimated effort: Medium (2-3 hours)"
   ```

5. **Session Continuation** - You run out of time/context
   ```bash
   bd create --title "Complete Phase 3 integration - remove remaining duplicates" \
     --type task \
     --body "Continue Phase 3 module integration work.

   Status: 25% code reduction achieved, 115 tests passing

   Remaining work:
   - [ ] Remove duplicate helper functions (lines 800-1200)
   - [ ] Extract evidence rendering to module
   - [ ] Extract overlay rendering to module
   - [ ] Update PHASE3_PROGRESS.md with final metrics

   Branch: phase-3-integration (pushed to remote)
   Context: See conversation summary in .beads/phase3_context.md"
   ```

6. **Test Coverage Gaps** - Missing or incomplete tests
   ```bash
   bd create --title "Add tests for spatial query builder" \
     --type task \
     --body "New spatial query modules need test coverage:

   Files needing tests:
   - public/js/spatial/builder.js (0% coverage)
   - public/js/spatial/execute.js (0% coverage)
   - public/js/spatial/runner.js (0% coverage)

   Test file locations:
   - tests/spatial-builder.test.js
   - tests/spatial-execute.test.js
   - tests/spatial-runner.test.js

   Target: 80%+ coverage for all modules"
   ```

### Bead Types and When to Use Them

```bash
# Bug - Something is broken
bd create --type bug --title "Filter chips don't clear on reset"

# Feature - New functionality request
bd create --type feature --title "Add export to Shapefile format"

# Task - General work item (refactoring, cleanup, documentation)
bd create --type task --title "Extract table module from app.js"

# Epic - Large multi-part work (collections of related tasks)
bd create --type epic --title "Phase 4: Evidence panel modularization"
```

### Priority Levels

```bash
# Critical - Blocking, security issue, data loss, app crashes
bd create --priority critical --title "App crashes when loading large datasets"

# High - Significant impact, user-facing bugs, performance issues
bd create --priority high --title "Filter application takes 10+ seconds"

# Medium - Standard priority (default)
bd create --priority medium --title "Add loading spinner to export button"

# Low - Nice to have, minor improvements
bd create --priority low --title "Update favicon to match brand colors"
```

### Essential Bead Metadata

**Minimum required information:**
```bash
bd create \
  --title "Clear, specific title describing the work" \
  --type [bug|feature|task|epic] \
  --body "Detailed description with:
- What needs to be done
- Why it's important
- Relevant files/functions
- Steps to reproduce (for bugs)
- Acceptance criteria
- Dependencies or blockers"
```

**Additional helpful metadata:**
```bash
# Link to related issues
bd create --title "Fix table pagination" \
  --body "Fixes pagination after Phase 3 refactor. Related to #42"

# Assign to yourself for active work
bd update <issue-id> --assign @me

# Add labels for categorization
bd label <issue-id> phase-3 refactoring frontend

# Set milestone
bd update <issue-id> --milestone "v1.0 Release"
```

### Bead Workflow During Development

**Start of session:**
```bash
# Check assigned work
bd list --assignee @me --status open

# Review high priority items
bd list --priority high --status open

# Pick an issue to work on
bd show <issue-id>  # Read full details

# Mark as in progress
bd update <issue-id> --status in-progress
```

**During work:**
```bash
# Add progress comments
bd comment <issue-id> "Started refactoring buildWhere function. Extracted to filters/builder.js"

bd comment <issue-id> "Found issue: 21 call sites need parameter updates. Creating helper function getCurrentFilters()"

bd comment <issue-id> "Tests passing. Pushed to branch phase-3-integration"
```

**When blocked:**
```bash
# Mark as blocked with reason
bd update <issue-id> --status blocked

bd comment <issue-id> "Blocked: Need clarification on whether to keep backward compatibility with old filter format. Asked user."
```

**When discovering new work:**
```bash
# Create related issues without stopping current work
bd create --title "Add type annotations to filter builder" \
  --type task \
  --body "While working on #42, noticed filter functions lack TypeScript/JSDoc types.

Related to: #42
Should do after: Phase 3 completion"

# Continue with current work
```

**On completion:**
```bash
# Close the issue
bd close <issue-id>

# Add completion summary
bd comment <issue-id> "COMPLETED
- Refactored buildWhere to filters/builder.js
- Updated 4 call sites with filter parameters
- Added 16 new tests (100% coverage)
- All 115 tests passing
- Pushed to phase-3-integration branch
- Updated AGENTS.md with refactoring guidelines"
```

**End of session:**
```bash
# Sync to git (if using remote Beads sync)
bd sync

# Review what you worked on
bd list --updated today

# Create continuation issue if needed
bd create --title "Continue work on Phase 3 integration" \
  --type task \
  --assignee @me \
  --body "Continuation from previous session. See #<previous-issue-id> for context."
```

### Best Practices for Bead Descriptions

**Good bug report:**
```markdown
## Bug: Filter chips show wrong count after clear

### Steps to Reproduce
1. Apply filters (mode: BUS, operator: ABC)
2. Click "Clear All"
3. Filter chips remain visible with count (2)

### Expected
All filter chips should disappear, count should show (0)

### Actual
Chips remain, showing stale filter count

### Root Cause
updateScopeChips() not called after onClearFilters()

### Files
- public/app.js:1682 (onClearFilters function)
- public/app.js:1062 (updateScopeChips function)

### Fix
Add updateScopeChips() call at end of onClearFilters()
```

**Good feature request:**
```markdown
## Feature: Export filtered results to CSV

### Description
Users should be able to export currently filtered table data to CSV format.

### User Story
As a data analyst, I want to export filtered network data to CSV so I can analyze it in Excel/Python.

### Acceptance Criteria
- [ ] "Export CSV" button appears when filters are active
- [ ] Export includes only filtered rows
- [ ] Export respects current table column selection
- [ ] Large exports (>10k rows) show confirmation dialog
- [ ] Download includes timestamp in filename (e.g., routes_2025-12-26.csv)

### Technical Notes
- Reuse queryCsv() from exports/handlers.js
- Add button next to existing GeoJSON export
- Use buildCombinedWhere() to get filter SQL

### Files to Modify
- public/app.js (add button and handler)
- public/index.html (add button UI)

### Dependencies
None - can implement immediately
```

**Good task/refactor request:**
```markdown
## Task: Extract overlay rendering to deck/overlay.js module

### Description
Extract Deck.gl overlay rendering logic from app.js into dedicated module following modular architecture.

### Current State
- updateOverlay() function is 150 lines in app.js (lines 1153-1227)
- Tightly coupled with state and map objects
- Not currently tested

### Proposed State
- New module: public/js/deck/overlay.js
- Export: updateOverlay(map, selectedFeature, tableRows)
- New test: tests/deck-overlay.test.js
- app.js reduced by ~150 lines

### Steps
1. Create public/js/deck/ directory
2. Create overlay.js with proper imports
3. Extract updateOverlay function
4. Update app.js to import from module
5. Write tests for overlay.js
6. Update MODULARIZATION_GUIDE.md

### Blockers
None - Phase 3 integration provides pattern to follow

### Estimated Effort
2-3 hours
```

### Searching and Filtering Beads

```bash
# List all open issues
bd list --status open

# List bugs only
bd list --type bug --status open

# Search by keyword
bd list --search "filter"

# High priority items
bd list --priority high

# Recently updated
bd list --updated "last week"

# By label
bd list --label refactoring

# Combination filters
bd list --type bug --priority high --status open --label phase-3
```

### When NOT to Create a Bead

**Skip Beads for:**
- ❌ Trivial typos you can fix immediately
- ❌ Work you're about to do right now in the same session
- ❌ Ideas that belong in `plan.md` as strategic direction
- ❌ Questions for the user (use AskUserQuestion instead)
- ❌ General notes or observations (add to plan.md or code comments)

**Create Beads for:**
- ✅ Work you can't finish in current session
- ✅ Bugs you discover but aren't fixing right now
- ✅ Features that need user approval first
- ✅ Tech debt you notice during other work
- ✅ Anything you want to track to completion

### Beads + Git Integration

**Commit messages should reference Beads:**
```bash
git commit -m "Fix filter chip count after clear

Resolves #42

- Call updateScopeChips() after clearing filters
- Add test for filter clear → chip update
- All 115 tests passing"
```

**Branch naming:**
```bash
# For feature work
git checkout -b feature/export-csv-42

# For bug fixes
git checkout -b fix/filter-chips-42

# For refactoring
git checkout -b refactor/overlay-module-89
```

### Example: Complete Refactoring Workflow

**Discovery during work:**
```bash
# You're working on Phase 3, notice evidence panel needs refactoring
bd create --title "Phase 4: Extract evidence panel to module" \
  --type epic \
  --body "Evidence rendering logic should be modularized.

Current: 400+ lines in app.js updateEvidence()
Target: public/js/evidence/ module with tests

Sub-tasks:
- Extract evidence HTML builder
- Extract SQL query builder
- Extract evidence formatting
- Add tests for evidence module

Blocked by: Phase 3 completion
Estimated: 4-6 hours"

# Continue with Phase 3 work
```

**Later, when starting Phase 4:**
```bash
# Find the issue
bd list --search "Phase 4"

# Review details
bd show <issue-id>

# Mark in progress
bd update <issue-id> --status in-progress

# Break into sub-tasks
bd create --title "Extract evidence HTML builder" \
  --type task \
  --body "First step of Phase 4 (#<epic-id>)

Extract evidence HTML generation from updateEvidence() to:
public/js/evidence/builder.js

Functions to extract:
- buildEvidenceHtml()
- formatEvidenceField()
- buildEvidenceRow()

Tests: tests/evidence-builder.test.js"

# Work, commit, comment
git checkout -b feature/phase-4-evidence
bd comment <issue-id> "Created branch, started extraction"
# ... do work ...
git commit -m "Extract evidence HTML builder (#<issue-id>)"
bd comment <issue-id> "Extraction complete, 45 tests added, all passing"

# Close when done
bd close <issue-id>
```

### Summary

**Beads are your external memory** - Use them to:
- 🎯 Track work you can't finish now
- 🐛 Document bugs for later fixing
- 💡 Capture feature ideas
- 🔧 Note technical debt
- 📋 Break large work into manageable chunks
- 💬 Communicate progress and blockers
- 🔗 Link commits to issues for traceability

**Always include:**
- Clear, specific title
- Detailed description with context
- Relevant files and line numbers
- Acceptance criteria or steps to reproduce
- Dependencies and blockers

## Runtime reminders
- The viewer pulls `maplibre-gl`, `pmtiles`, `deck.gl`, and `@duckdb/duckdb-wasm` directly from CDNs via ES module imports. Bundling or local caching is necessary for offline or restricted environments.
- `config.json` and `config.sample.json` control the R2 data endpoints, metadata, and basemap. Any data refresh must also update `public/routes.pmtiles`, `routes.parquet`, and `metadata.json` in tandem.
- For local exploration, follow `README.md`: copy `public/config.sample.json` → `public/config.json`, then run `python3 -m tools.dev_server --public-dir public --data-dir data --port 5137`.

## Review deliverables
- After reviewing the codebase, produce a short write-up of findings, create/refresh supporting documentation (e.g., `BASELINE.md`), and note any outstanding risks or needs directly inside `plan.md` so the team can revisit them later.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
