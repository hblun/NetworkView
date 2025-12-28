# Spatial Query Module: Architecture Review & Refactoring Roadmap

**Date:** 2025-12-28
**Status:** Critical - Requires Architectural Refactoring
**Priority:** High (blocks SLB epic NetworkView-1tt)

## Executive Summary

The spatial query module has grown organically through multiple bug fixes, resulting in a fragile architecture where "every fix seems to break things." This document identifies core architectural problems and proposes robust, repeatable principles to make the module resilient and flexible to change.

**Current State:** 5 modules (~800 LOC), passing tests (34/34), but brittle integration
**Key Issues:** Unclear separation of concerns, complex state dependencies, tight coupling
**Impact:** High development friction, regression risk, blocks SLB feature development

---

## Current Architecture (As-Built)

### Module Overview

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

### State Management (Current)

**Multiple State Objects:**
```javascript
// In state/manager.js
state.spatialBuilder      // Builder instance {state, compiled, run()}
state.spatialMatchSet     // Set<string> of service IDs
state.spatialQuery        // {active, serviceIds[], point, pickingPoint}

// In builder.js (local)
builder.state             // {find, condition, distance, target, blocks[]}
builder.compiled          // Compiled query object
```

**Problem:** Four different representations of spatial query state can drift out of sync.

---

## Architectural Problems

### 1. **Unclear Separation of Concerns** 🔴 CRITICAL

**Problem:** `builder.js` does too much

- ✗ UI rendering (DOM manipulation, event handling)
- ✗ Business logic (validation, compilation)
- ✗ State management (local state + global state mutation)
- ✗ External dependencies (directly accesses `state.metadata`)

**Impact:**
- Cannot test business logic without DOM
- Cannot reuse compilation logic outside UI
- Changes to UI break logic and vice versa

**Evidence:**
```javascript
// builder.js lines 1-514 mix all concerns:
const updateSummary = () => { /* DOM manipulation */ };
const compile = () => { /* business logic */ };
const getAvailableOperators = () => { /* external dependency */ };
elements.run?.addEventListener("click", async () => { /* event handler */ });
```

### 2. **Complex State Dependencies** 🔴 CRITICAL

**Problem:** Multiple overlapping state objects with unclear ownership

```
builder.state       ← User edits (find, distance, blocks)
    ↓ compile()
builder.compiled    ← Query definition
    ↓ onRun()
runner.run()        ← Execution
    ↓
state.spatialMatchSet   ← Results
state.spatialQuery      ← Results + metadata
```

**Impact:**
- State can be inconsistent (compiled exists but no matchSet, or vice versa)
- Unclear which state is source of truth
- onChange vs onRun handlers modify different state

**Example Failure Mode:**
1. User edits distance → onChange fires → applySpatialLogic called
2. But compiled state is stale (no onRun yet)
3. applySpatialLogic uses stale data → wrong results
4. Fix distance → breaks something else

### 3. **Execution Flow Confusion** 🟡 HIGH

**Problem:** `execute.js` doesn't execute anything

```javascript
// execute.js - misleading name
export const applySpatialLogic = async (compiled, { setMatchSet } = {}) => {
  // Just extracts IDs from compiled and sets state
  // Actual execution is in runner.js
};
```

**Impact:**
- Developers expect `applySpatialLogic` to run queries
- Actually just a state setter wrapper
- Real execution is `runner.run()` called from `onRun` handler
- Two different code paths for "running" a query

### 4. **Tight Coupling to Global State** 🟡 HIGH

**Problem:** Modules directly access global `state` object

```javascript
// builder.js
const getAvailableOperators = () => {
  const metadata = state.metadata;  // Direct global access
  if (!metadata || !metadata.operators) { /* fallback */ }
};

// sql.js
const useSpatial = state.spatialReady && state.geometryField;  // Direct global access
```

**Impact:**
- Cannot test modules in isolation
- Cannot reuse modules in different contexts (e.g., worker, SSR)
- Changes to state shape break multiple modules

### 5. **Inconsistent Data Flow** 🟡 HIGH

**Problem:** Two callback handlers do different things

```javascript
// app.js wiring
onChange: async (compiled) => {
  await applySpatialLogic(compiled, { setMatchSet: setSpatialMatchSet });
  updateEvidence();
  onApplyFilters({ autoFit: false });
},
onRun: async (compiled) => {
  const result = await runner.run(compiled, point, db);
  setSpatialMatchSet(new Set(result.serviceIds));
  updateEvidence();
  onApplyFilters({ autoFit: true });
}
```

**Impact:**
- `onChange` calls `applySpatialLogic` (doesn't actually execute query)
- `onRun` calls `runner.run()` (does execute query)
- Both update state and call onApplyFilters but with different autoFit
- Unclear when to use which handler

### 6. **Missing Validation Layer** 🟡 MEDIUM

**Problem:** No validation before execution

```javascript
// runner.js just throws if query is invalid
async run(compiled, point, duckdb) {
  if (!compiled || !compiled.blocks || compiled.blocks.length === 0) {
    return { serviceIds: [], count: 0 };  // Silent failure
  }
  // No validation that blocks are well-formed
  const whereClause = buildSpatialWhere(compiled, point);  // May throw
}
```

**Impact:**
- Errors surface during execution, not at validation time
- User sees "Spatial query error" without knowing what's wrong
- No way to prevent invalid queries from being run

### 7. **Brittle Integration Points** 🟡 MEDIUM

**Problem:** app.js must wire 5 different pieces together

```javascript
// app.js requires:
1. loadSpatialLogicRunner(config, setStatus)
2. initSpatialLogicBuilder(container, handlers, runner)
3. applySpatialLogic(compiled, { setMatchSet })
4. setSpatialMatchSet(matchSet)
5. getSpatialLogicEvidencePart()

// Plus coordinate:
- Point selection state
- DuckDB connection
- Filter application
- Evidence updates
- Map/table syncing
```

**Impact:**
- Easy to miss a wiring step
- Changes to spatial module require app.js changes
- Testing requires mocking all integration points

---

## Robust Architectural Principles

### Principle 1: **Clear Layer Separation**

**Separate concerns into distinct layers:**

```
Presentation Layer    - UI components, event handling, rendering
    ↓
Application Layer     - Use cases, orchestration, state coordination
    ↓
Domain Layer          - Business logic, validation, query compilation
    ↓
Infrastructure Layer  - SQL generation, DuckDB execution, state persistence
```

**Benefits:**
- Test domain logic without UI
- Reuse business logic in different contexts
- Change UI without affecting logic

### Principle 2: **Single Source of Truth**

**One canonical state representation:**

```javascript
// BAD: Multiple overlapping states
state.spatialBuilder.state
state.spatialBuilder.compiled
state.spatialMatchSet
state.spatialQuery

// GOOD: Single state object
state.spatial = {
  query: {                    // Query definition (source of truth)
    find: "routes",
    condition: "within",
    distance: 300,
    target: "selected_point",
    blocks: []
  },
  execution: {                // Execution results
    status: "idle" | "running" | "complete" | "error",
    serviceIds: [],
    count: 0,
    error: null
  },
  ui: {                       // UI-only state
    point: null,
    pickingPoint: false
  }
}
```

**Benefits:**
- No state drift
- Clear ownership
- Easy to serialize/restore

### Principle 3: **Unidirectional Data Flow**

**Data flows in one direction only:**

```
UI Event
    ↓
Action (intent)
    ↓
State Update (via reducer/setter)
    ↓
Side Effects (queries, updates)
    ↓
State Update (results)
    ↓
UI Re-render
```

**No circular flows or bidirectional bindings.**

### Principle 4: **Dependency Inversion**

**Modules depend on abstractions, not concretions:**

```javascript
// BAD: Direct dependency on global state
const getOperators = () => state.metadata.operators;

// GOOD: Inject dependencies
const createBuilder = ({ getOperators, getModes, onUpdate }) => {
  // Use injected functions
};
```

**Benefits:**
- Testable in isolation
- Reusable in different contexts
- Easy to mock dependencies

### Principle 5: **Explicit Execution Model**

**Clear distinction between query definition and execution:**

```javascript
// Query Definition (pure data)
const query = {
  find: "routes",
  condition: "within",
  distance: 300,
  target: "selected_point"
};

// Validation (mostly pure, may need infrastructure context for some rules)
const errors = validateQuery(query, { point, spatialReady });
if (errors.length > 0) { /* handle */ }

// Compilation (pure transformation with versioned output)
const compiled = compileQuery(query, metadata);
// compiled.metadata.version = "1.0" - stable contract

// Execution (async, impure, cancellable)
const controller = new AbortController();
const result = await executeQuery(compiled, { point, db, signal: controller.signal });
```

**Benefits:**
- Can validate before executing
- Can compile without executing
- Cancellable execution for rapid edits
- Versioned compiled queries for debugging/replay

**Note on Purity:** While we aim for pure validation/compilation, some spatial rules inherently depend on infrastructure context (e.g., "is spatial extension available?"). We accept controlled impurity at boundaries where needed, documenting these dependencies explicitly.

### Principle 6: **Strong Validation**

**Validate at boundaries, fail fast:**

```javascript
// Validate query definition
const validateQuery = (query) => {
  const errors = [];
  if (!query.find) errors.push("find is required");
  if (query.distance < 0) errors.push("distance must be non-negative");
  if (query.target === "selected_point" && !point) {
    errors.push("point required for selected_point target");
  }
  return errors;
};

// Throw on invalid input, not during execution
const compileQuery = (query, metadata) => {
  const errors = validateQuery(query);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
  // Safe to compile
};
```

**Benefits:**
- Errors caught early
- Clear error messages
- No invalid state

### Principle 7: **Loose Coupling via Events**

**Modules communicate via events for fan-out, not core execution:**

```javascript
// Core execution flow: synchronous and explicit (for debuggability)
const result = await service.executeQuery(query);
if (!result.success) {
  handleError(result.error);
  return;
}

// Event fan-out: for side effects and UI updates
eventBus.emit("spatial:complete", result);

// Listeners register independently for side effects
eventBus.on("spatial:complete", updateEvidence);
eventBus.on("spatial:complete", updateFilters);
eventBus.on("spatial:complete", updateMap);
```

**Critical Distinction:**
- **Core execution:** Synchronous call chain, explicit error handling, debuggable
- **Side effects:** Event-driven fan-out for UI updates, analytics, etc.

**Benefits:**
- Core flow remains traceable and debuggable
- Side effects don't complicate error handling
- Add/remove listeners without changing core logic

**Caution:** Event-driven indirection has costs (harder to trace, async timing issues). Use events for fan-out only, not for core business logic.

---

## Proposed Architecture (To-Be)

### New Module Structure

```
public/js/spatial/
├── core/
│   ├── query.js          - Query domain model (pure)
│   ├── validator.js      - Query validation (pure)
│   ├── compiler.js       - Query compilation (pure)
│   └── executor.js       - Query execution (async)
├── infrastructure/
│   ├── sql-builder.js    - SQL generation (pure, moved from sql.js)
│   └── duckdb-runner.js  - DuckDB execution (async, moved from runner.js)
├── ui/
│   ├── builder-ui.js     - UI components (presentation only)
│   └── builder-state.js  - UI state management (local)
└── application/
    ├── spatial-service.js - Use cases, orchestration
    └── state-manager.js   - Global state coordination
```

### Revised Data Flow

```
User Interaction
    ↓
builder-ui.js (emit event)
    ↓
spatial-service.js (use case)
    ↓
┌─────────────────────────────┐
│ 1. validateQuery(query)     │ ← validator.js
│ 2. compileQuery(query, meta)│ ← compiler.js
│ 3. executeQuery(compiled)   │ ← executor.js
│ 4. updateState(results)     │ ← state-manager.js
└─────────────────────────────┘
    ↓
eventBus.emit("spatial:complete", results)
    ↓
Listeners: updateEvidence(), updateFilters(), updateMap()
```

### Single State Object

```javascript
// state/manager.js - Single spatial state
state.spatial = {
  // Query definition (user-editable)
  query: {
    find: "routes",
    condition: "within",
    distance: 300,
    target: "selected_point",
    blocks: []
  },

  // Execution state
  execution: {
    status: "idle",      // idle | validating | compiling | running | complete | error
    serviceIds: [],
    count: 0,
    error: null,
    lastRun: null       // timestamp
  },

  // UI state (ephemeral)
  ui: {
    point: { lat: 55.9533, lng: -3.1883 },
    pickingPoint: false,
    showBuilder: true
  },

  // Metadata cache
  metadata: {
    operators: [],
    modes: [],
    boundaries: []
  }
};
```

### Core Domain Models

#### Query Model (query.js)

```javascript
/**
 * Spatial query domain model (pure data)
 */
export class SpatialQuery {
  constructor({
    find = "routes",
    condition = "intersect",
    distance = 300,
    target = "selected_point",
    blocks = []
  }) {
    this.find = find;
    this.condition = condition;
    this.distance = distance;
    this.target = target;
    this.blocks = blocks;
  }

  /**
   * Returns a plain object representation
   */
  toJSON() {
    return {
      find: this.find,
      condition: this.condition,
      distance: this.distance,
      target: this.target,
      blocks: this.blocks.map(b => ({ ...b }))
    };
  }

  /**
   * Creates from plain object
   */
  static fromJSON(obj) {
    return new SpatialQuery(obj);
  }

  /**
   * Returns human-readable description
   */
  describe() {
    let desc = `${this.find} ${this.condition} ${this.distance}m of ${this.target}`;
    this.blocks.forEach(block => {
      desc += `, ${block.type} ${block.operator}`;
    });
    return desc;
  }
}
```

#### Validator (validator.js)

```javascript
/**
 * Query validation (pure function)
 */
export class ValidationError extends Error {
  constructor(errors) {
    super(`Validation failed: ${errors.join(", ")}`);
    this.errors = errors;
  }
}

export const validateQuery = (query, context = {}) => {
  const errors = [];

  // Required fields
  if (!query.find) {
    errors.push("'find' is required");
  }

  if (!query.target) {
    errors.push("'target' is required");
  }

  // Distance validation
  if (typeof query.distance !== "number" || query.distance < 0) {
    errors.push("'distance' must be a non-negative number");
  }

  // Target-specific validation
  if (query.target === "selected_point" && !context.point) {
    errors.push("Point is required when target is 'selected_point'");
  }

  if (query.target === "boundary" && !context.boundary) {
    errors.push("Boundary is required when target is 'boundary'");
  }

  // Block validation
  query.blocks.forEach((block, i) => {
    if (!block.type || !["include", "exclude", "also-include"].includes(block.type)) {
      errors.push(`Block ${i}: invalid type '${block.type}'`);
    }

    if (!block.operator) {
      errors.push(`Block ${i}: operator is required`);
    }

    if (block.operator === "operator" || block.operator === "mode") {
      if (!block.value) {
        errors.push(`Block ${i}: value is required for ${block.operator}`);
      }
    }

    if (block.operator === "near_point" && !context.point) {
      errors.push(`Block ${i}: point required for near_point operator`);
    }
  });

  return errors;
};

/**
 * Throws if validation fails
 */
export const assertValid = (query, context) => {
  const errors = validateQuery(query, context);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
};
```

#### Compiler (compiler.js)

```javascript
/**
 * Query compilation (pure function)
 *
 * Compiled query is a stable, versioned contract that can be:
 * - Serialized for debugging
 * - Replayed for testing
 * - Cached for performance
 */
export const compileQuery = (query, context = {}) => {
  // Validate first
  assertValid(query, context);

  // Transform to execution format
  const mainBlock = {
    find: query.find,
    relation: query.condition === "within" ? "within" : "intersects",
    target: query.target,
    distance: query.distance
  };

  return {
    // Stable contract version (semver)
    version: "1.0.0",

    // Query definition
    find: query.find,
    blocks: [
      mainBlock,
      ...query.blocks.map(b => ({
        type: b.type,
        operator: b.operator,
        value: b.value,
        distance: b.distance
      }))
    ],

    // Compilation metadata
    metadata: {
      compiled_at: new Date().toISOString(),
      context: {
        has_point: !!context.point,
        has_boundary: !!context.boundary,
        spatial_ready: !!context.spatialReady
      }
    },

    // Hash for caching and comparison
    hash: hashQuery(query)
  };
};

/**
 * Stable hash for query caching
 */
const hashQuery = (query) => {
  const str = JSON.stringify({
    find: query.find,
    condition: query.condition,
    distance: query.distance,
    target: query.target,
    blocks: query.blocks
  });
  // Simple hash for now, can upgrade to crypto.subtle if needed
  return btoa(str).substring(0, 16);
};
```

#### Executor (executor.js)

```javascript
/**
 * Query execution orchestration
 *
 * Handles cancellation, caching, and performance optimization
 */
export const executeQuery = async (compiled, context) => {
  const { point, db, spatialReady, geometryField, bboxReady, signal } = context;

  // Check for cancellation
  if (signal?.aborted) {
    throw new Error("Query cancelled");
  }

  // Build SQL (cached based on query hash + context)
  const whereClause = buildSpatialWhere(compiled, point, {
    spatialReady,
    geometryField,
    bboxReady
  });

  // Execute via runner with cancellation support
  const runner = createDuckDBRunner(db);
  const result = await runner.execute(whereClause, {
    needsPostFilter: !spatialReady && bboxReady,
    point,
    distance: compiled.blocks[0]?.distance,
    signal // Pass through for DuckDB cancellation
  });

  // Check for cancellation after execution
  if (signal?.aborted) {
    throw new Error("Query cancelled");
  }

  return {
    serviceIds: result.serviceIds,
    count: result.count,
    metadata: {
      executed_at: new Date().toISOString(),
      mode: spatialReady ? "spatial" : "bbox",
      post_filtered: result.postFiltered || false,
      execution_time_ms: result.executionTime
    }
  };
};
```

### Service Layer (spatial-service.js)

```javascript
/**
 * Application-layer orchestration
 *
 * Handles concurrency, cancellation, caching, and "latest result wins"
 */
export class SpatialQueryService {
  constructor({ state, eventBus, db }) {
    this.state = state;
    this.eventBus = eventBus;
    this.db = db;
    this.currentExecution = null;  // Track current execution for cancellation
    this.compiledCache = new Map(); // Cache compiled queries
  }

  /**
   * Execute a spatial query (main use case)
   *
   * Implements "latest result wins" - cancels previous execution if still running
   */
  async executeQuery(query) {
    // Cancel previous execution if still running
    if (this.currentExecution) {
      console.log("[SpatialService] Cancelling previous execution");
      this.currentExecution.abort();
    }

    // Create abort controller for this execution
    const controller = new AbortController();
    this.currentExecution = controller;

    try {
      // Update status
      this.state.spatial.execution.status = "validating";
      this.eventBus.emit("spatial:status", "validating");

      // Validate
      const context = {
        point: this.state.spatial.ui.point,
        boundary: this.state.spatial.ui.boundary,
        spatialReady: this.state.spatialReady,
        geometryField: this.state.geometryField,
        bboxReady: this.state.bboxReady,
        signal: controller.signal
      };

      const errors = validateQuery(query, context);
      if (errors.length > 0) {
        this.state.spatial.execution.status = "error";
        this.state.spatial.execution.error = errors.join("; ");
        this.eventBus.emit("spatial:error", errors);
        return { success: false, errors };
      }

      // Compile (with caching for performance)
      this.state.spatial.execution.status = "compiling";
      const compiled = this._getCachedCompiled(query, context);

      // Execute
      this.state.spatial.execution.status = "running";
      this.eventBus.emit("spatial:status", "running");

      const startTime = performance.now();
      const result = await executeQuery(compiled, {
        ...context,
        db: this.db
      });
      const executionTime = performance.now() - startTime;

      // Check if this execution was cancelled (another one started)
      if (controller.signal.aborted) {
        console.log("[SpatialService] Execution was cancelled, discarding results");
        return { success: false, cancelled: true };
      }

      // Update state (only if not cancelled)
      this.state.spatial.query = query;
      this.state.spatial.execution = {
        status: "complete",
        serviceIds: result.serviceIds,
        count: result.count,
        error: null,
        lastRun: new Date().toISOString(),
        executionTime: Math.round(executionTime),
        metadata: result.metadata
      };

      // Clear current execution
      this.currentExecution = null;

      // Emit success (core flow complete, events for fan-out)
      this.eventBus.emit("spatial:complete", result);
      return { success: true, result };

    } catch (error) {
      // Don't update state if cancelled
      if (error.message === "Query cancelled") {
        return { success: false, cancelled: true };
      }

      this.state.spatial.execution.status = "error";
      this.state.spatial.execution.error = error.message;
      this.currentExecution = null;
      this.eventBus.emit("spatial:error", error);
      return { success: false, error };
    }
  }

  /**
   * Get cached compiled query or compile new one
   *
   * Performance optimization: compilation is expensive for complex queries
   */
  _getCachedCompiled(query, context) {
    const cacheKey = JSON.stringify({
      query,
      spatialReady: context.spatialReady,
      hasPoint: !!context.point,
      hasBoundary: !!context.boundary
    });

    if (this.compiledCache.has(cacheKey)) {
      console.log("[SpatialService] Using cached compiled query");
      return this.compiledCache.get(cacheKey);
    }

    const compiled = compileQuery(query, context);
    this.compiledCache.set(cacheKey, compiled);

    // Limit cache size (LRU would be better, but this is simple)
    if (this.compiledCache.size > 50) {
      const firstKey = this.compiledCache.keys().next().value;
      this.compiledCache.delete(firstKey);
    }

    return compiled;
  }

  /**
   * Update query without executing
   *
   * Used during editing to update UI, not for execution
   */
  updateQuery(query) {
    this.state.spatial.query = query;
    this.eventBus.emit("spatial:query:changed", query);
  }

  /**
   * Clear spatial query results
   */
  clear() {
    // Cancel any running execution
    if (this.currentExecution) {
      this.currentExecution.abort();
      this.currentExecution = null;
    }

    this.state.spatial.execution = {
      status: "idle",
      serviceIds: [],
      count: 0,
      error: null,
      lastRun: null
    };
    this.compiledCache.clear();
    this.eventBus.emit("spatial:cleared");
  }
}
```

---

## Performance & Concurrency Considerations

### Validation & Compilation Frequency

**Problem:** With tighter integration, validation and compilation may run on every keystroke.

**Solution:**
1. **Debounce user input** - Wait 300ms after last edit before validating
2. **Cache compiled queries** - Hash-based cache with LRU eviction
3. **Lazy validation** - Only validate on "Run", not on every edit
4. **Incremental compilation** - Only recompile changed blocks

```javascript
// Debounced validation in UI layer
const debouncedValidate = debounce((query) => {
  const errors = validateQuery(query);
  updateErrorDisplay(errors);
}, 300);

// Cache compiled queries
const compiledCache = new Map(); // key: query hash, value: compiled
```

### Execution Concurrency

**Problem:** User edits distance while query is running. Which result should win?

**Solution: "Latest Result Wins"**
```javascript
// Cancel previous execution
if (currentExecution) {
  currentExecution.abort();
}

// Start new execution
currentExecution = executeQuery(query, { signal: new AbortController() });
```

### Spatial Edge Cases

**Complexity:** Spatial rules have many edge cases:
- Routes crossing dateline
- Ferry routes without geometry
- Routes partially in multiple boundaries
- Buffer distance in polar regions

**Approach:**
- **Document edge cases explicitly** in validation error messages
- **Accept controlled impurity** - some validation requires geometry analysis
- **Test edge cases comprehensively** - dedicated test suite for spatial edge cases
- **Fail gracefully** - return empty result with explanation, not error

---

## Refactoring Roadmap

### Phase 1: Extract Core Domain (Low Risk)

**Goal:** Create pure domain modules without changing existing code

**Tasks:**
1. Create `core/query.js` with SpatialQuery class
2. Create `core/validator.js` with validation logic
3. Create `core/compiler.js` with compilation logic
4. Add comprehensive tests for all three modules (aim for 100% coverage)
5. Do NOT change existing modules yet

**Deliverables:**
- New modules pass tests
- Existing code still works
- No breaking changes

**Estimated Effort:** 4-6 hours

### Phase 2: Extract Infrastructure (Medium Risk)

**Goal:** Separate SQL generation and execution from state dependencies

**Tasks:**
1. Refactor `sql.js` → `infrastructure/sql-builder.js`
   - Remove direct `state` access
   - Accept context object instead
   - Keep same SQL generation logic
2. Refactor `runner.js` → `infrastructure/duckdb-runner.js`
   - Remove direct `state` access
   - Accept db + context as parameters
   - Keep same execution logic
3. Add tests for refactored modules
4. Update existing code to use new modules with compatibility shim

**Deliverables:**
- SQL builder works without global state
- Runner works without global state
- Existing code still works via compatibility layer

**Estimated Effort:** 6-8 hours

### Phase 3: Create Service Layer (Medium Risk)

**Goal:** Introduce orchestration layer for use cases

**Tasks:**
1. Create `application/spatial-service.js` with SpatialQueryService class
2. Wire service into app.js alongside existing code
3. Add service layer tests (integration-style)
4. Create compatibility adapter for existing builder

**Deliverables:**
- Service layer functional
- Can be used alongside existing code
- Tests pass

**Estimated Effort:** 4-6 hours

### Phase 4: Refactor UI Layer (Higher Risk)

**Goal:** Separate UI from business logic

**Tasks:**
1. Extract UI components from `builder.js` → `ui/builder-ui.js`
   - Keep DOM manipulation
   - Emit events instead of direct calls
   - Remove business logic
2. Create `ui/builder-state.js` for local UI state
3. Wire UI to service layer via events
4. Remove old `builder.js` after migration complete

**Deliverables:**
- UI components are pure presentation
- Business logic in service layer
- Tests cover both separately

**Estimated Effort:** 8-12 hours

### Phase 5: Update State Management (Higher Risk)

**Goal:** Consolidate to single spatial state object

**Tasks:**
1. Create new `state.spatial` object in state/manager.js
2. Add migration helpers to convert old state → new state
3. Update all consumers to read from new state
4. Remove old state objects (spatialBuilder, spatialMatchSet, spatialQuery)
5. Add state shape validation

**Deliverables:**
- Single source of truth for spatial state
- All modules use new state
- No state drift

**Estimated Effort:** 6-8 hours

### Phase 6: Testing & Documentation (Low Risk)

**Goal:** Comprehensive test coverage and documentation

**Tasks:**
1. Achieve 90%+ test coverage for all spatial modules
2. Add integration tests for complete flows
3. Add E2E tests for user scenarios
4. Write architecture documentation
5. Create migration guide for future changes

**Deliverables:**
- Test coverage report showing >90%
- Integration tests passing
- E2E tests in CI
- Complete documentation

**Estimated Effort:** 6-8 hours

---

## Migration Strategy

### Parallel Operation Approach

**Run old and new architecture side-by-side:**

1. **Keep existing code working** - No big-bang rewrites
2. **Add new modules alongside old** - Gradual migration
3. **Feature flag for testing** - Enable new architecture optionally
4. **Compatibility shims** - Adapter layer between old and new
5. **Metrics and validation** - Compare old vs new results
6. **Gradual cutover** - Switch features one at a time

### Critical Refactoring Rules (From AGENTS.md)

**MUST follow these guidelines from the project's refactoring standards:**

#### 1. Never Delete Without Verification ⚠️

```bash
# BEFORE deleting any function from builder.js
grep -n "^const functionName\|^function functionName" public/js/spatial/**/*.js

# Only delete if found in new modules
# Keep backup: cp public/js/spatial/builder.js /tmp/builder_backup.js
```

**Protection:**
- Create backup before large deletions
- Verify each function exists in new modules
- Delete incrementally, not in bulk
- Run tests after each deletion batch

#### 2. Function Signature Migration Pattern 🔄

**When moving from closure-based to parameter-based:**

```javascript
// OLD (builder.js): Closure-based, uses DOM directly
const compile = () => {
  const distance = elements.distance.value;  // Direct DOM access
  return { distance };
};

// NEW (compiler.js): Parameter-based, pure function
export const compileQuery = (query, context) => {
  const distance = query.distance;  // From parameter
  return { distance };
};

// ADAPTER (app.js): Bridge between old and new
const getCurrentQuery = () => ({
  find: elements.find.value,
  distance: Number(elements.distance.value),
  condition: state.spatial.condition,
  blocks: state.spatial.blocks
});

// Update ALL call sites
const compiled = compileQuery(getCurrentQuery(), context);
```

**Required Steps:**
1. Create helper function to gather UI state
2. Find ALL call sites: `grep -n "compile\(" public/app.js`
3. Update each call site with parameters
4. Verify signatures match between modules

#### 3. Comprehensive Call Site Auditing 🔍

**After any refactoring:**

```bash
# Find all calls to old builder functions
grep -n "builder\.run\|builder\.compile\|builder\.state" public/app.js

# Find event handler bindings
grep -n "addEventListener.*spatial\|\.on.*spatial" public/app.js

# Verify imports
grep -n "^import.*spatial" public/app.js
```

**Checklist for Each Refactored Function:**
- [ ] Module export signature documented
- [ ] All call sites identified (use grep)
- [ ] Each call site updated with correct parameters
- [ ] Event handlers properly bound
- [ ] Tests updated for new signatures
- [ ] No undefined function errors in browser console

#### 4. Testing During Refactoring 🧪

```bash
# Run after EVERY significant change
npm test -- --run

# If tests pass but browser fails:
# 1. Hard refresh: Cmd+Shift+R
# 2. Check console errors
# 3. Check Network tab for latest JS
```

**Red Flags:**
- ✅ Tests passing BUT browser errors → **Cache issue**
- ❌ Tests failing → **Code issue, fix immediately**
- ⚠️ New functions without tests → **Write tests before continuing**

#### 5. Import Statement Hygiene 📦

**Organize imports by module type:**

```javascript
// GOOD: Organized imports for new architecture
// Core domain
import { SpatialQuery, validateQuery, compileQuery } from "./js/spatial/core/query.js";

// Infrastructure
import { buildSpatialWhere } from "./js/spatial/infrastructure/sql-builder.js";
import { createDuckDBRunner } from "./js/spatial/infrastructure/duckdb-runner.js";

// Application layer
import { SpatialQueryService } from "./js/spatial/application/spatial-service.js";

// UI layer
import { createBuilderUI } from "./js/spatial/ui/builder-ui.js";
```

**After adding imports:**

```bash
# Check for unused imports
grep "^import.*from" app.js | while read line; do
  func=$(echo "$line" | grep -o '{[^}]*}' | tr -d '{},' | xargs)
  echo "$func" | tr ' ' '\n' | while read f; do
    [ -n "$f" ] && grep -q "$f" app.js || echo "Unused: $f"
  done
done
```

#### 6. Git Workflow for Large Refactors 🌿

**Work on feature branch with atomic commits:**

```bash
# Create branch
git checkout -b spatial-architecture-refactor

# Commit incrementally (example sequence)
git add public/js/spatial/core/query.js
git commit -m "Add SpatialQuery domain model with tests"

git add public/js/spatial/core/validator.js tests/spatial-validator.test.js
git commit -m "Add query validation with comprehensive tests"

git add public/js/spatial/core/compiler.js tests/spatial-compiler.test.js
git commit -m "Add query compiler with caching and versioning"

# Push frequently
git push -u origin spatial-architecture-refactor
```

**Commit Messages Should:**
- ✅ Describe WHAT changed
- ✅ Reference WHY if not obvious
- ✅ Be atomic (one logical change per commit)
- ❌ Never be vague ("fix stuff", "updates")

#### 7. Recovery Strategies 🔧

**If you accidentally delete important code:**

```bash
# 1. Find commit before deletion
git log --oneline -20

# 2. Extract old file
git show <commit-hash>:public/js/spatial/builder.js > /tmp/builder_before.js

# 3. Find missing functions by comparing
diff /tmp/builder_before.js public/js/spatial/builder.js

# 4. Extract specific functions by line number
sed -n '1234,1567p' /tmp/builder_before.js >> public/js/spatial/builder.js
```

#### 8. Browser Cache Issues 🔄

**Code correct but browser shows errors?**

```bash
# Verify code is correct
grep -n "buildSpatialWhere\(" public/app.js

# Verify tests pass
npm test -- --run

# If both good, it's cache:
# - Hard refresh: Cmd+Shift+R
# - Clear browser cache
# - Disable cache in DevTools
```

#### 9. Documentation During Refactoring 📝

**Track progress as you go:**

Update these files:
- `SPATIAL_ARCHITECTURE_REVIEW.md` - Architecture decisions
- `plan.md` - Add notes to discovery log
- `AGENTS.md` - Update module structure docs if needed
- Progress tracking (create if needed):
  ```markdown
  ## Spatial Refactor Progress

  **Metrics:**
  - Starting modules: 5 files, ~800 LOC
  - Current modules: 12 files, ~900 LOC
  - Test coverage: 34 → 120 tests

  **Completed:**
  - ✅ Core domain extraction (query.js, validator.js, compiler.js)
  - ✅ Comprehensive tests (100% coverage on core)

  **In Progress:**
  - 🔄 Infrastructure extraction (sql-builder.js)

  **Tests:**
  - 120 tests passing ✅
  ```

#### 10. Summary Checklist for Refactoring Complete

**Before declaring work complete:**

- [ ] All tests passing (`npm test`)
- [ ] No browser console errors (check DevTools)
- [ ] All function signatures verified
- [ ] All call sites updated with correct parameters
- [ ] Event handlers properly bound
- [ ] No undefined function errors
- [ ] Imports organized and complete
- [ ] Git commits are atomic and well-described
- [ ] Changes pushed to remote branch
- [ ] Documentation updated (this file, plan.md)
- [ ] Browser cache cleared if testing locally
- [ ] **Feature flag tested** - both old and new architecture work
- [ ] **Compatibility shims tested** - old code works with new modules
- [ ] **Performance validated** - no regression in query execution time

### Example Compatibility Shim

```javascript
// compatibility/spatial-adapter.js
/**
 * Adapts old builder API to new service layer
 */
export const createLegacyBuilderAdapter = (spatialService) => {
  return {
    // Old API
    compile() {
      return compileQuery(state.spatial.query);
    },

    async run() {
      const result = await spatialService.executeQuery(state.spatial.query);
      return { serviceIds: result.serviceIds, count: result.count };
    },

    // Compatibility with old state access
    get compiled() {
      return compileQuery(state.spatial.query);
    },

    get state() {
      return state.spatial.query;
    }
  };
};
```

### Feature Flag Pattern

```javascript
// config.json
{
  "features": {
    "spatial_new_architecture": false  // Enable for testing
  }
}

// app.js
if (config.features?.spatial_new_architecture) {
  // Use new service layer
  const spatialService = new SpatialQueryService({ state, eventBus, db });
  // ...
} else {
  // Use old builder
  initSpatialLogicBuilder(container, handlers, runner);
}
```

---

## Testing Strategy

### Unit Tests (Pure Logic)

```javascript
// Test domain models in isolation
describe("SpatialQuery", () => {
  it("should create query from JSON", () => {
    const json = { find: "routes", distance: 500 };
    const query = SpatialQuery.fromJSON(json);
    expect(query.find).toBe("routes");
  });
});

// Test validation in isolation
describe("validateQuery", () => {
  it("should require point for selected_point target", () => {
    const query = { target: "selected_point", distance: 300 };
    const errors = validateQuery(query, { point: null });
    expect(errors).toContain(expect.stringMatching(/point.*required/i));
  });
});

// Test SQL generation in isolation
describe("buildSpatialWhere", () => {
  it("should generate bbox query when spatial unavailable", () => {
    const compiled = { blocks: [...] };
    const sql = buildSpatialWhere(compiled, point, { spatialReady: false });
    expect(sql).toContain("bbox_");
  });
});
```

### Integration Tests (Module Interaction)

```javascript
// Test service layer with real modules
describe("SpatialQueryService", () => {
  it("should execute query end-to-end", async () => {
    const service = new SpatialQueryService({
      state: mockState,
      eventBus: mockEventBus,
      db: mockDB
    });

    const query = {
      find: "routes",
      condition: "within",
      distance: 500,
      target: "selected_point"
    };

    const result = await service.executeQuery(query);
    expect(result.success).toBe(true);
    expect(result.result.serviceIds).toBeInstanceOf(Array);
  });
});
```

### E2E Tests (User Scenarios)

```javascript
// Test complete user flow
test("user can execute spatial query", async ({ page }) => {
  // 1. Open spatial builder
  await page.click("#spatial-tool-toggle");

  // 2. Select point on map
  await page.click(".maplibregl-canvas", { position: { x: 400, y: 300 } });

  // 3. Set distance
  await page.fill("#slb-distance", "500");

  // 4. Click Run
  await page.click("#slb-run");

  // 5. Verify results
  await expect(page.locator("#status")).toContain("routes found");
  await expect(page.locator("#table tbody tr")).toHaveCount.greaterThan(0);
});
```

---

## Success Metrics

### Architectural Health

- **Coupling:** <20% of modules directly access global state (currently ~80%)
- **Cohesion:** Each module has single clear purpose (currently mixed)
- **Test Coverage:** >90% for all spatial modules (currently 34 tests, need ~100)
- **Cyclomatic Complexity:** <10 per function (builder.js has functions >15)

### Development Experience

- **Time to Add Feature:** <2 hours for simple features (currently unpredictable)
- **Regression Rate:** <10% of changes break existing features (currently ~40%)
- **Test Execution Time:** <1s for unit tests, <10s for integration (currently 7ms)
- **Onboarding Time:** New developer understands architecture in <1 hour

### User Experience

- **Query Execution Time:** <500ms for typical queries (currently varies)
- **Error Messages:** 100% of errors have actionable messages (currently generic)
- **State Consistency:** 0 cases of state drift (currently happens with onChange/onRun)

---

## Next Steps

### Immediate Actions (This Week)

1. **Review with team** - Get buy-in on architectural principles
2. **Create Beads issues** - Break down roadmap into actionable tasks
3. **Set up feature flag** - Enable parallel operation
4. **Start Phase 1** - Extract core domain modules (low risk)

### Short-term Actions (Next 2 Weeks)

1. **Complete Phase 1-2** - Core domain + infrastructure extraction
2. **Add comprehensive tests** - Aim for 90%+ coverage
3. **Document new patterns** - Update AGENTS.md with principles
4. **Run in parallel** - Test new architecture alongside old

### Medium-term Actions (Next Month)

1. **Complete Phase 3-5** - Service layer + UI refactor + state consolidation
2. **Cut over to new architecture** - Remove old code
3. **Update documentation** - Reflect new architecture
4. **Retrospective** - Learn from migration

---

## Appendix: Anti-Patterns to Avoid

### ❌ Don't: God Objects

```javascript
// BAD: builder.js does everything
const builder = {
  renderUI() { },
  handleEvents() { },
  validate() { },
  compile() { },
  execute() { },
  updateState() { }
};
```

### ❌ Don't: Circular Dependencies

```javascript
// BAD: builder depends on state, state depends on builder
import { state } from "./state.js";
export const builder = { state };

// state.js
import { builder } from "./builder.js";
export const state = { builder };
```

### ❌ Don't: Hidden Side Effects

```javascript
// BAD: Function has hidden side effects
const compile = (query) => {
  setSpatialMatchSet(null);  // Hidden side effect!
  updateEvidence();          // Hidden side effect!
  return compileInternal(query);
};
```

### ❌ Don't: Mutation of Inputs

```javascript
// BAD: Mutating input parameter
const processQuery = (query) => {
  query.compiled = true;  // Mutating input!
  return query;
};

// GOOD: Return new object
const processQuery = (query) => {
  return { ...query, compiled: true };
};
```

### ❌ Don't: Implicit Dependencies

```javascript
// BAD: Function depends on global state implicitly
const buildWhere = () => {
  const spatialReady = state.spatialReady;  // Implicit dependency
  // ...
};

// GOOD: Explicit parameters
const buildWhere = (query, { spatialReady, geometryField }) => {
  // ...
};
```

---

## Conclusion

The spatial query module requires architectural refactoring to become robust, repeatable, and resilient to change. By following the principles of clear layer separation, single source of truth, unidirectional data flow, dependency inversion, explicit execution model, strong validation, and loose coupling, we can transform this module from a fragile collection of scripts into a solid foundation for the SLB epic and future spatial features.

**Recommended Approach:** Gradual migration via parallel operation, starting with low-risk core domain extraction and ending with state consolidation. This approach minimizes risk while providing immediate benefits in testability and maintainability.

**Total Estimated Effort:** 34-48 hours (1-2 sprint cycles)
**Risk Level:** Medium (mitigated by parallel operation and comprehensive testing)
**Impact:** High (enables SLB epic, reduces regression rate, improves developer experience)
