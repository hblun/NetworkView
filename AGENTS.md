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

## Runtime reminders
- The viewer pulls `maplibre-gl`, `pmtiles`, `deck.gl`, and `@duckdb/duckdb-wasm` directly from CDNs via ES module imports. Bundling or local caching is necessary for offline or restricted environments.
- `config.json` and `config.sample.json` control the R2 data endpoints, metadata, and basemap. Any data refresh must also update `public/routes.pmtiles`, `routes.parquet`, and `metadata.json` in tandem.
- For local exploration, follow `README.md` steps: copy `config.sample.json`, download DuckDB assets from `tools/fetch_duckdb_assets.sh`, and serve `public/` with `python3 -m tools.dev_server`.

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
