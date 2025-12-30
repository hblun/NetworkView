# Spatial Query Module Documentation

**Last Updated**: 2025-12-30
**Status**: Extension working, architecture requires refactoring

---

## Table of Contents

1. [Extension Setup & Status](#extension-setup--status)
2. [Current Implementation Status](#current-implementation-status)
3. [Architecture Review](#architecture-review)
4. [Refactoring Execution Guide](#refactoring-execution-guide)

---

## Extension Setup & Status

### Current Status: ⚠️ Using MVP Bundle (Spatial Extension Limited)

DuckDB is running with the **MVP (Minimum Viable Product)** bundle for maximum compatibility.

### Bundle Configuration

**Current Setup**: No cross-origin isolation headers
File: `tools/dev_server.py:96-99`

```python
# Cross-origin headers removed to use MVP bundle (maximum compatibility)
# EH/COI bundles require cross-origin isolation which blocks external CDN resources
# MVP bundle works without these headers but loses spatial extension support
```

**Why MVP Bundle?**
- ✅ External CDN resources load (Tailwind, Google Fonts, MapLibre)
- ✅ No cross-origin isolation complexity
- ✅ Maximum browser compatibility
- ❌ Spatial extension may not work (requires EH/COI bundle)
- ❌ No multi-threading support

**Trade-off**: Styling works, but DuckDB spatial functions (ST_Point, ST_DWithin, etc.) may not be available.

**Alternative Configuration (For Spatial Extension)**

If you need spatial extension support, you can try:

```python
# In tools/dev_server.py - add these headers back
self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
self.send_header("Cross-Origin-Opener-Policy", "same-origin")
```

This enables the EH bundle but **may block external CDN resources** depending on browser implementation.

**Fallback Strategy**
File: `public/js/spatial/runner.js`

Client-side post-filtering using Haversine distance calculation works regardless of which bundle is active.

### Troubleshooting

**If styling isn't loading:**
1. **Hard refresh**: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows)
2. **Check console** for errors blocking external resources
3. **Verify no cross-origin headers**: `curl -I http://127.0.0.1:5137/` should NOT show COEP/COOP headers

**If you need spatial extension:**
1. Add cross-origin headers back (see Alternative Configuration above)
2. **Risk**: May break external CDN resources
3. **Test manually** in browser console:
   ```javascript
   const conn = await state.db.connect();
   const result = await conn.query("SELECT ST_Point(0, 0) as geom");
   console.log("✅ Spatial extension works!", result.toArray());
   await conn.close();
   ```

### Why This Works

**MVP Bundle** (current):
- No cross-origin isolation needed
- Works with all external CDN resources
- Maximum browser compatibility
- Single-threaded, basic WASM features only

**The Problem**:
- Cross-origin headers (`COEP: require-corp` or `COEP: credentialless`) enable better DuckDB bundles
- BUT they can block external resources that don't send proper CORS headers
- Tailwind, Google Fonts, and MapLibre CSS from CDNs can be blocked
- Result: Site loads but has no styling

---

## Current Implementation Status

### ✅ Complete

1. **UI Layer**
   - Full visual query builder in `public/js/spatial/builder.js`
   - Builder/Templates tabs
   - Find/That/Dist/Of controls
   - Include/Also Include/Exclude block system
   - Plain-English summary generation
   - Color-coded pills with tooltips
   - Template presets (Proximity, Overlap, Catchment, Route Link)
   - Feature flag: `spatialQuery: true`

2. **State Management**
   - Spatial state in `public/js/state/manager.js`
   - Point selection tracking
   - Match set storage
   - Builder instance registration

3. **Map Integration**
   - Spatial point marker overlay
   - Radius circle visualization
   - Point picker interaction
   - Overlay updates

4. **DuckDB Spatial Extension**
   - ✅ Extension loading with EH bundle
   - ✅ Cross-origin isolation headers
   - ✅ Bbox post-filtering fallback

### ⚠️ Architecture Issues

The spatial query module works but has **architectural brittleness** where "every fix breaks something" due to:
- Unclear separation of concerns
- Complex state dependencies
- Tight coupling between UI and query logic

See [Architecture Review](#architecture-review) for detailed analysis.

### 🚧 Known Issues

- **NetworkView-5iz** (P2) - Tooltips not working properly
- **NetworkView-8z1** (P2) - Block overflow CSS issue
- **NetworkView-4mh** (P1) - Simple filters integration

---

## Architecture Review

### Executive Summary

**Current State:** 5 modules (~800 LOC), passing tests (34/34), but brittle integration
**Key Issues:** Unclear separation of concerns, complex state dependencies, tight coupling
**Impact:** High development friction, regression risk, blocks SLB feature development

### Current Architecture

```
public/js/spatial/
├── builder.js (515 LOC)  - UI + state + validation + compilation
├── sql.js     (278 LOC)  - SQL WHERE clause generation
├── runner.js  (260 LOC)  - DuckDB query execution + post-filtering
├── execute.js  (24 LOC)  - Wrapper for setting match set
└── evidence.js (13 LOC)  - Evidence string generation
```

### Data Flow (Current)

```
User Interaction
    ↓
builder.js (UI events)
    ↓
compile() → compiled object
    ↓
┌───────────────┬─────────────────┐
│  onChange     │     onRun       │
↓               ↓                 ↓
applySpatialLogic()    runner.run(compiled, point, db)
    ↓                       ↓
setSpatialMatchSet()   buildSpatialWhere(compiled, point)
    ↓                       ↓
state.spatialMatchSet  DuckDB query → serviceIds
    ↓                       ↓
filters/table/map     setSpatialMatchSet()
                           ↓
                      state.spatialMatchSet
```

### Core Architectural Problems

#### 1. **Separation of Concerns Violations**

**Problem**: `builder.js` handles too many responsibilities:
- DOM rendering & event handling
- State management & validation
- Query compilation
- Evidence string generation
- State mutation (via callbacks)

**Impact**: Changes ripple unpredictably. Adding a new operator requires touching UI, compilation, SQL generation, and state management.

**Solution**: Separate into layers:
- **Presentation Layer**: UI-only (DOM, events, rendering)
- **Domain Layer**: Pure business logic (validation, compilation)
- **Infrastructure Layer**: External interactions (DuckDB, state)
- **Service Layer**: Orchestration

#### 2. **State Dependencies Create Fragility**

**Problem**: Multiple state objects with unclear ownership:
```javascript
// Who owns what?
state.spatialQuery = { point, compiled, distance }
state.spatialMatchSet = Set<string>
builder._state = { blocks, templates }
```

**Impact**: State can become inconsistent. Clearing one piece doesn't guarantee others clear.

**Solution**: Single source of truth with clear mutation paths:
```javascript
state.spatial = {
  query: { compiled, point, distance },  // Query definition
  results: { matchSet, evidence }        // Query results
}
```

#### 3. **Tight Coupling to Global State**

**Problem**: Builder directly calls `setSpatialMatchSet()`, `setSpatialDistance()`, etc.

**Impact**: Cannot test builder in isolation. Cannot reuse builder for different state backends.

**Solution**: Dependency injection - pass callbacks/dependencies explicitly:
```javascript
const builder = createBuilder({
  onQueryChange: (compiled) => { /* ... */ },
  onRun: (compiled) => { /* ... */ },
  getPoint: () => state.spatial.point
});
```

#### 4. **Complex Callback Chains**

**Problem**:
```
onChange (builder.js)
  → passed to createBuilder
  → triggers applySpatialLogic (app.js)
  → calls setSpatialMatchSet
  → may trigger re-render
  → may retrigger onChange
```

**Impact**: Circular dependencies, race conditions, hard to debug.

**Solution**: Unidirectional data flow:
```
User Action → Service Layer → Update State → Re-render UI
```

#### 5. **Mixed Abstraction Levels**

**Problem**: `builder.js` has both high-level concepts (templates, blocks) and low-level DOM manipulation (`addEventListener`, `innerHTML`).

**Impact**: Hard to understand what the module "does" vs "how it does it".

**Solution**: Extract rendering helpers:
```javascript
// High-level (builder.js)
const renderBlocks = (blocks) => {
  return blocks.map(renderBlock).join('');
};

// Low-level (dom-helpers.js)
const createPill = (text, color) => { /* ... */ };
```

#### 6. **Query Execution Scattered Across Modules**

**Problem**: Query logic split between:
- `builder.js` - compiles to intermediate format
- `sql.js` - converts to SQL
- `runner.js` - executes query
- `execute.js` - updates state

**Impact**: No single place to understand "how does a spatial query work?"

**Solution**: Service layer encapsulates the full flow:
```javascript
// service/spatial-query.js
export const executeSpatialQuery = async (compiled, point, db) => {
  const sql = buildSpatialWhere(compiled, point);
  const results = await runQuery(sql, db);
  return { matchSet, evidence };
};
```

#### 7. **Testing Challenges**

**Problem**: Tests must set up:
- DuckDB instance
- Global state
- DOM structure
- Event listeners

**Impact**: Tests are slow, brittle, hard to maintain.

**Solution**: Layer isolation enables focused tests:
- **Domain tests**: Pure functions, no dependencies
- **Service tests**: Mock DuckDB, no DOM
- **UI tests**: Mock service layer, test rendering only

### Proposed Architecture

#### Layered Design

```
┌─────────────────────────────────────────┐
│   Presentation Layer (UI Components)    │  ← builder.js (UI only)
│   - DOM rendering                       │
│   - Event handling                      │
│   - User input capture                  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│   Service Layer (Orchestration)         │  ← spatial-query-service.js
│   - Coordinate domain + infrastructure  │
│   - Handle errors & edge cases          │
│   - Manage async flows                  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│   Domain Layer (Business Logic)         │  ← query-compiler.js
│   - Query validation                    │     sql-builder.js
│   - Query compilation                   │     query-validator.js
│   - Evidence generation                 │     evidence-builder.js
│   - Pure functions                      │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│   Infrastructure Layer (External I/O)   │  ← duckdb-runner.js
│   - DuckDB queries                      │     state-repository.js
│   - State persistence                   │
│   - External APIs                       │
└─────────────────────────────────────────┘
```

#### Module Responsibilities

**Presentation Layer** (`builder-ui.js`):
- Render builder UI from state
- Capture user interactions
- Emit events (no business logic)

**Service Layer** (`spatial-query-service.js`):
- Orchestrate query execution
- Handle concurrency & cancellation
- Error handling & recovery
- Coordinate state updates

**Domain Layer**:
- `query-compiler.js` - Compile blocks → intermediate format
- `sql-builder.js` - Generate SQL from compiled query
- `query-validator.js` - Validate query constraints
- `evidence-builder.js` - Generate human-readable descriptions

**Infrastructure Layer**:
- `duckdb-runner.js` - Execute queries against DuckDB
- `state-repository.js` - Read/write spatial state

### Architectural Principles

1. **Separation of Concerns**: Each module has ONE clear responsibility
2. **Dependency Injection**: Pass dependencies explicitly, no globals
3. **Pure Functions**: Domain logic has no side effects
4. **Unidirectional Data Flow**: State changes flow one direction
5. **Layer Independence**: Lower layers don't know about upper layers
6. **Explicit Interfaces**: Clear contracts between modules
7. **Testability**: Each layer testable in isolation

### Performance Considerations

**Query Cancellation**:
```javascript
let currentQuery = null;

export const executeQuery = async (...) => {
  // Cancel previous query
  if (currentQuery) currentQuery.cancel();

  currentQuery = createCancellableQuery(...);
  return await currentQuery.run();
};
```

**Result Caching**:
```javascript
const queryCache = new Map();

const cacheKey = (compiled, point) =>
  `${JSON.stringify(compiled)}:${point.lat},${point.lng}`;

if (queryCache.has(key)) {
  return queryCache.get(key);
}
```

**Debouncing**:
```javascript
// Don't re-execute on every keystroke
const debouncedExecute = debounce(executeQuery, 300);
```

---

## Refactoring Execution Guide

### Context

The spatial query module requires architectural refactoring across 6 phases to transform from a brittle, tightly-coupled system into a robust, testable architecture.

### Critical Documents to Read First

**BEFORE starting, read:**

1. **AGENTS.md** - Project runtime rules and refactoring practices
   - Code housekeeping requirements (CRITICAL)
   - 10 refactoring rules you MUST follow
   - Function signature migration patterns
   - Call site auditing procedures
   - Git workflow for refactors

2. **plan.md** - Product roadmap and discovery log
   - Project context and goals
   - Current state and priorities

3. **Beads Task** - Specific phase instructions
   ```bash
   bd show NetworkView-[TASK-ID]
   ```

### Refactoring Phases

**Epic:** NetworkView-p5s (Spatial Query Module: Architectural Refactoring)

#### Phase 1: Extract Core Domain (4-6h, LOW RISK)
**Bead**: NetworkView-eij

- Extract pure functions from builder.js
- Create domain/ directory structure
- Move validation & compilation logic
- No behavior changes, only code movement
- Tests must remain passing

#### Phase 2: Extract Infrastructure (6-8h, MEDIUM RISK)
**Bead**: NetworkView-94q

- Extract DuckDB interactions
- Create infrastructure layer
- Isolate state mutations
- Add repository pattern

#### Phase 3: Create Service Layer (4-6h, MEDIUM RISK)
**Bead**: NetworkView-5tx

- Create orchestration service
- Coordinate domain + infrastructure
- Handle async flows & errors
- Implement query cancellation

#### Phase 4: Refactor UI Layer (8-12h, HIGHER RISK)
**Bead**: NetworkView-cni

- Simplify builder.js to UI-only
- Remove business logic
- Dependency injection
- Event-driven architecture

#### Phase 5: Consolidate State (6-8h, HIGHER RISK)
**Bead**: NetworkView-p0f

- Single source of truth
- Clear ownership model
- Immutable state updates
- State validation

#### Phase 6: Testing & Documentation (6-8h, LOW RISK)
**Bead**: NetworkView-2ax

- Unit tests for each layer
- Integration tests
- API documentation
- Migration guide

### Non-Negotiable Requirements

1. **Tests Must Pass**: Run `npm test` after EVERY change
2. **No Behavior Changes**: Users should see no difference
3. **Incremental Changes**: Small commits, frequent verification
4. **Git Hygiene**: Clear commit messages, logical grouping
5. **Documentation**: Update as you go, not at the end

### Refactoring Workflow

```bash
# 1. Create branch for phase
git checkout -b refactor/spatial-phase-N

# 2. Make changes incrementally
# Edit files
npm test          # Verify tests pass
git add .
git commit -m "Extract validation from builder.js"

# 3. Push and create PR
git push -u origin refactor/spatial-phase-N
gh pr create --title "Phase N: [Description]"

# 4. After approval, merge and move to next phase
```

### Risk Mitigation

- **LOW RISK phases**: Can be done in single session
- **MEDIUM RISK**: Break into smaller tasks, commit frequently
- **HIGHER RISK**: Pair with another agent, extra review

### Success Criteria

After all phases complete:

- ✅ All tests passing (34/34)
- ✅ No regressions in functionality
- ✅ Each layer independently testable
- ✅ Clear separation of concerns
- ✅ Documentation complete
- ✅ Performance maintained or improved

### Coordination

**File Reservations**: Use `.beads/working/` to coordinate with other agents
**State Preservation**: Never break the main branch
**Communication**: Update Bead comments with progress

---

## Additional Resources

- **DuckDB WASM Extensions**: https://duckdb.org/docs/api/wasm/extensions
- **Spatial Extension Docs**: https://duckdb.org/docs/extensions/spatial
- **Cross-Origin Isolation**: https://web.dev/coop-coep/
- **Project Roadmap**: See `plan.md`
- **Runtime Rules**: See `AGENTS.md`
