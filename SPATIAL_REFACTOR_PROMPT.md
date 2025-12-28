# Spatial Query Module Refactoring - Execution Prompt

## Context

You are working on the **NetworkView** project - a DuckDB-WASM + PMTiles platform for transport data exploration. The spatial query module has architectural brittleness where "every fix breaks something" due to unclear separation of concerns, complex state dependencies, and tight coupling.

A comprehensive refactoring plan has been created with 6 phases to transform the module into a robust, testable architecture. **Your task is to execute Phase [N] of this refactoring.**

## Critical Documents to Read First

**BEFORE starting, you MUST read these files in order:**

1. **SPATIAL_ARCHITECTURE_REVIEW.md** - Complete architectural analysis
   - Current problems (7 architectural issues)
   - Proposed architecture (layered design)
   - 7 architectural principles
   - Performance & concurrency considerations
   - Migration strategy

2. **AGENTS.md** - Project runtime rules and refactoring practices
   - Code housekeeping requirements (CRITICAL)
   - 10 refactoring rules you MUST follow
   - Function signature migration patterns
   - Call site auditing procedures
   - Git workflow for refactors

3. **plan.md** - Product roadmap and discovery log
   - Project context and goals
   - Current state and priorities

4. **Beads Task** - Your specific phase instructions
   ```bash
   bd show NetworkView-[TASK-ID]
   ```
   This contains your detailed implementation steps.

## Your Specific Task

**Epic:** NetworkView-p5s (Spatial Query Module: Architectural Refactoring)

**Execute Phase [N]:**
- NetworkView-eij: Phase 1 - Extract Core Domain (4-6h, LOW RISK)
- NetworkView-94q: Phase 2 - Extract Infrastructure (6-8h, MEDIUM RISK)
- NetworkView-5tx: Phase 3 - Create Service Layer (4-6h, MEDIUM RISK)
- NetworkView-cni: Phase 4 - Refactor UI Layer (8-12h, HIGHER RISK)
- NetworkView-p0f: Phase 5 - Consolidate State (6-8h, HIGHER RISK)
- NetworkView-2ax: Phase 6 - Testing & Documentation (6-8h, LOW RISK)

## Non-Negotiable Requirements

### 1. Follow AGENTS.md Refactoring Rules

**You MUST follow these practices from AGENTS.md:**

✅ **Never Delete Without Verification**
```bash
# BEFORE deleting ANY function
grep -rn "^const functionName\|^function functionName" public/js/spatial/

# Only delete if found in new modules
# Create backup: cp file.js /tmp/file_backup.js
```

✅ **Function Signature Migration**
```bash
# Find ALL call sites before changing signatures
grep -rn "functionName\(" public/

# Update each call site
# Verify no undefined errors in browser console
```

✅ **Comprehensive Call Site Auditing**
```bash
# After ANY refactoring, verify all call sites updated
grep -rn "builder\.run\|builder\.compile" public/
grep -rn "state\.spatialBuilder\|state\.spatialMatchSet" public/

# Should find ZERO references to old API
```

✅ **Test After EVERY Change**
```bash
npm test

# If tests pass but browser fails:
# 1. Hard refresh: Cmd+Shift+R
# 2. Check console errors
# 3. Check Network tab for latest JS
```

✅ **Atomic Git Commits**
```bash
# One logical change per commit
git add file1.js tests/file1.test.js
git commit -m "Add [specific thing] with tests

- What changed
- Why it changed
- Reference to architecture doc if relevant"
```

### 2. Architectural Principles

**You MUST adhere to these principles:**

1. **Clear Layer Separation** - No mixing UI, logic, state in one module
2. **Single Source of Truth** - One canonical state representation
3. **Unidirectional Data Flow** - Data flows one direction only
4. **Dependency Inversion** - Inject dependencies, don't import global state
5. **Explicit Execution Model** - Cancellable, versioned queries
6. **Strong Validation** - Fail fast at boundaries
7. **Loose Coupling via Events** - Events for fan-out only, not core logic

### 3. Testing Requirements

**Every module you create MUST have tests:**

- **Core domain:** 100% coverage (pure logic, easy to test)
- **Infrastructure:** >90% coverage (mock DB connections)
- **Application:** >85% coverage (mock dependencies)
- **UI:** >80% coverage (DOM testing)

**Test continuously:**
```bash
# After each module
npm test -- <module-name>

# Before committing
npm test

# Check coverage
npm run test:coverage
```

### 4. No Breaking Changes

**CRITICAL:** Existing functionality must keep working throughout refactoring.

- All 34+ existing tests must pass
- Existing spatial queries must work
- Use feature flags and compatibility layers
- Only remove old code after new is proven

## Execution Workflow

### Step 1: Mark Task In Progress
```bash
bd update NetworkView-[TASK-ID] --status in_progress
```

### Step 2: Create Branch
```bash
git checkout -b spatial-refactor-phase[N]
```

### Step 3: Read Task Details
```bash
bd show NetworkView-[TASK-ID]

# Read the entire body
# Note the acceptance criteria
# Understand what to build
```

### Step 4: Backup Before Changes
```bash
# For phases that modify existing code
cp -r public/js/spatial /tmp/spatial_backup_phase[N]
```

### Step 5: Implement Incrementally

**DO NOT try to complete the entire phase at once.**

For each module/function:
1. Write tests FIRST (TDD approach)
2. Implement the module
3. Run tests (`npm test`)
4. Check browser console (hard refresh)
5. Commit atomically
6. Push frequently

**Example for Phase 1:**
```bash
# Module 1: Query model
# 1. Write tests/spatial-core.test.js
# 2. Implement public/js/spatial/core/query.js
# 3. Test: npm test -- spatial-core
# 4. Commit:
git add public/js/spatial/core/query.js tests/spatial-core.test.js
git commit -m "Add SpatialQuery domain model with tests"
git push

# Module 2: Validator
# ... repeat process

# Module 3: Compiler
# ... repeat process
```

### Step 6: Verify Acceptance Criteria

**Before marking complete, check EVERY item in the acceptance criteria:**

```bash
# From the task body (bd show NetworkView-[TASK-ID])
# Go through each [ ] checkbox
# Verify it's complete
```

### Step 7: Final Verification

```bash
# All tests passing
npm test

# No browser errors (open DevTools console)
# Hard refresh: Cmd+Shift+R

# Coverage meets target
npm run test:coverage

# All changes committed
git status  # Should be clean

# All changes pushed
git push

# If applicable: old tests still pass
npm test  # Should show 34+ tests passing
```

### Step 8: Mark Task Complete
```bash
bd update NetworkView-[TASK-ID] --status closed --notes "Phase [N] complete. [Brief summary of what was built, test coverage achieved, any discoveries]"

# Sync beads
bd sync
```

### Step 9: Update Discovery Log
```bash
# Add to plan.md discovery log
# Brief note about what you learned during this phase
```

## Common Pitfalls to Avoid

### ❌ Don't: Delete Code Without Verification
```bash
# BAD: Just deleting old builder.js
rm public/js/spatial/builder.js  # DANGER!

# GOOD: Verify first
grep -rn "builder\." public/  # Should show zero references
cp public/js/spatial/builder.js /tmp/builder_backup.js
# Then delete incrementally
```

### ❌ Don't: Change Function Signatures Without Finding All Call Sites
```bash
# BAD: Change signature and hope for the best
export const compile = (query, context) => { }  # Changed signature

# GOOD: Find all call sites first
grep -rn "compile\(" public/
# Update each one
# Verify no undefined errors
```

### ❌ Don't: Batch Commits
```bash
# BAD: One giant commit
git add .
git commit -m "Phase 1 complete"

# GOOD: Atomic commits
git add query.js tests/query.test.js
git commit -m "Add SpatialQuery domain model with tests"
# ... separate commits for each module
```

### ❌ Don't: Skip Testing
```bash
# BAD: "I'll test later"
# Implement everything
# Hope it works

# GOOD: Test as you go
# Write test
# Implement module
# npm test
# Commit
```

### ❌ Don't: Ignore Browser Console
```bash
# BAD: Tests pass, ship it!

# GOOD: Always check browser
# Open DevTools Console
# Hard refresh (Cmd+Shift+R)
# Check for errors
# Verify functionality works
```

## Recovery Strategies

### If You Accidentally Delete Important Code
```bash
# 1. Find commit before deletion
git log --oneline -20

# 2. Extract old file
git show <commit-hash>:public/js/spatial/builder.js > /tmp/builder_recovered.js

# 3. Compare to find what's missing
diff /tmp/builder_recovered.js public/js/spatial/builder.js

# 4. Extract specific functions
sed -n '100,200p' /tmp/builder_recovered.js >> public/js/spatial/builder.js
```

### If Tests Pass But Browser Fails
```bash
# It's almost always cache
# 1. Hard refresh: Cmd+Shift+R
# 2. Disable cache in DevTools (Network tab)
# 3. Verify file loaded in Network tab
# 4. Check console for errors
```

### If You're Stuck
```bash
# 1. Re-read the architecture review
cat SPATIAL_ARCHITECTURE_REVIEW.md | grep -A 20 "Phase [N]"

# 2. Re-read the task
bd show NetworkView-[TASK-ID]

# 3. Check what you've done
git diff
git log --oneline -10

# 4. Ask for help (describe what you tried)
```

## Phase-Specific Guidance

### Phase 1 (Extract Core Domain)
**Focus:** Pure logic, no global state, 100% test coverage

**Key Points:**
- Do NOT modify existing code
- Create new modules alongside old
- All functions must be pure (except validation context checks)
- Document controlled impurity explicitly

**Success Indicator:** Old code unchanged, new modules tested, zero coupling

### Phase 2 (Extract Infrastructure)
**Focus:** Remove global state, add context parameters

**Key Points:**
- Create compatibility adapter for gradual migration
- Find ALL call sites before changing signatures
- Add cancellation support (AbortSignal)
- Keep same SQL generation logic

**Success Indicator:** Infrastructure modules context-based, old code works via adapter

### Phase 3 (Create Service Layer)
**Focus:** Orchestration, concurrency, caching

**Key Points:**
- Implement "latest result wins" with cancellation
- Cache compiled queries (hash-based)
- Events for side effects ONLY (not core logic)
- Feature flag controls old vs new

**Success Indicator:** Service handles concurrency, both architectures work in parallel

### Phase 4 (Refactor UI Layer)
**Focus:** Presentation only, event-driven

**Key Points:**
- Extract incrementally (one function group at a time)
- UI emits events, doesn't call business logic directly
- Test after EACH extraction
- Do NOT delete builder.js until everything migrated

**Success Indicator:** UI is pure presentation, business logic in service layer

### Phase 5 (Consolidate State)
**Focus:** Single source of truth

**Key Points:**
- Add new state.spatial alongside old
- Compatibility setters write to both
- Update consumers one at a time
- Verify no state drift

**Success Indicator:** Single state.spatial, old state objects removed, no drift

### Phase 6 (Testing & Documentation)
**Focus:** >90% coverage, documentation complete

**Key Points:**
- Achieve coverage targets for each layer
- Add E2E tests to CI
- Update AGENTS.md, plan.md
- Create SPATIAL_MODULE_GUIDE.md
- Measure and document success metrics

**Success Indicator:** Coverage >90%, docs complete, metrics prove improvement

## Success Metrics to Track

**Document these at the end of your phase:**

- **Test Coverage:** Run `npm run test:coverage`, note percentage
- **Call Sites Updated:** Count files changed, grep shows zero old references
- **Tests Passing:** `npm test` shows all green
- **Complexity:** Any functions >10 cyclomatic complexity?
- **Performance:** Query execution time (should not regress)
- **Commits:** How many atomic commits? (Good: 5-10, Bad: 1-2)

## Completion Checklist

**Before declaring your phase complete:**

- [ ] All acceptance criteria checked off
- [ ] All tests passing (`npm test`)
- [ ] Test coverage meets target for this phase
- [ ] No browser console errors (DevTools checked)
- [ ] All functions documented (JSDoc comments)
- [ ] All changes committed atomically
- [ ] All changes pushed to remote
- [ ] Beads task updated with notes
- [ ] Discovery log updated (plan.md)
- [ ] If applicable: old code still works
- [ ] If applicable: feature flag tested (both old and new work)

## Final Notes

**Remember:**
1. **Read SPATIAL_ARCHITECTURE_REVIEW.md thoroughly** - It contains all architectural decisions
2. **Follow AGENTS.md practices religiously** - They prevent the brittleness we're fixing
3. **Test continuously** - After every small change
4. **Commit atomically** - One logical change per commit
5. **Document as you go** - Don't leave it for later
6. **Ask if stuck** - Better to clarify than guess wrong

**The goal is not speed, it's creating a robust foundation that won't break with every change.**

Good luck! 🚀

---

## Quick Start Commands

```bash
# 1. Read the architecture review
cat SPATIAL_ARCHITECTURE_REVIEW.md

# 2. Read AGENTS.md refactoring section
cat AGENTS.md | grep -A 100 "Code Housekeeping"

# 3. Read your task
bd show NetworkView-[TASK-ID]

# 4. Mark in progress
bd update NetworkView-[TASK-ID] --status in_progress

# 5. Create branch
git checkout -b spatial-refactor-phase[N]

# 6. Start implementing
# Follow the task body step by step
# Test continuously
# Commit atomically

# 7. Mark complete when done
bd update NetworkView-[TASK-ID] --status closed
bd sync
git push
```
