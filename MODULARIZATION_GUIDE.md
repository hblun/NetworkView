# NetworkView Modularization Guide

## Overview

This guide documents the modular structure of NetworkView after refactoring from a 4,354-line monolith.

## Module Architecture

```
public/js/
├── config/
│   └── constants.js          # Application constants and configuration
├── state/
│   └── manager.js             # Centralized state management
├── utils/
│   ├── sql.js                 # SQL query building and sanitization
│   ├── colors.js              # Color generation and conversion
│   ├── dom.js                 # DOM manipulation utilities
│   ├── url.js                 # URL manipulation
│   └── geometry.js            # Geometry and spatial utilities
├── duckdb/                    # (Future) DuckDB client and queries
├── map/                       # (Future) Map rendering and controls
├── filters/                   # (Future) Filter logic
├── table/                     # (Future) Table rendering
└── exports/                   # (Future) Export functionality
```

## Completed Modules

### 1. Configuration (`public/js/config/constants.js`)

**Purpose**: Centralize all magic values and constants

**Exports**:
- `NONE_OPTION_VALUE` - Special value for "none" option
- `LAYER_IDS` - Map layer ID constants
- `COLORS` - Color constants
- `ROUTE_LINE_WIDTH` - MapLibre line width expressions
- `SELECTED_LINE_WIDTH` - Selected route line width
- `TIME_BAND_OPTIONS` - Time band definitions
- `FIELD_CANDIDATES` - Column name candidates for auto-detection
- `TABLE_CONFIG` - Table configuration constants
- `EXPORT_LIMITS` - Export limits and thresholds

**Usage**:
```javascript
import { COLORS, LAYER_IDS, TIME_BAND_OPTIONS } from "./js/config/constants.js";

map.setPaintProperty(LAYER_IDS.BASE, "line-color", COLORS.DEFAULT_ROUTE);
```

### 2. State Management (`public/js/state/manager.js`)

**Purpose**: Centralized state management with controlled mutations

**Exports**:
- `state` - Application state object (read-only recommended)
- `setDuckDBConnection(conn, db)` - Set DuckDB connection
- `setMap(map)` - Set MapLibre instance
- `setConfig(config)` - Set configuration
- `setMetadata(metadata)` - Set metadata
- `setSpatialReady(ready)` - Set spatial extension status
- `setSelectedFeature(feature, key)` - Set selected feature
- `clearSelectedFeature()` - Clear selection
- `setTableRows(rows)` - Set table data
- `setColumns(columns)` - Set parquet columns
- `getStateField(path)` - Get nested state value
- `setLastQuery(queryInfo)` - Update last query info
- `setColorByOperator(enabled)` - Toggle color mode

**Usage**:
```javascript
import { state, setMap, setConfig } from "./js/state/manager.js";

setConfig(configData);
setMap(mapInstance);

// Read state (avoid direct mutation)
if (state.duckdbReady) {
  // ...
}
```

**Benefits**:
- Debugging via `window.__NV_STATE`
- Clear mutation points
- Easier testing
- Future: Can add state change listeners

### 3. SQL Utilities (`public/js/utils/sql.js`)

**Purpose**: Safe SQL query building

**Exports**:
- `escapeSql(value)` - Escape single quotes
- `quoteIdentifier(value)` - Quote column/table names
- `buildInClause(values)` - Build SQL IN clause
- `escapeLikePattern(value)` - Escape LIKE pattern special characters

**Usage**:
```javascript
import { escapeSql, quoteIdentifier, buildInClause } from "./js/utils/sql.js";

const where = `WHERE ${quoteIdentifier("mode")} IN ${buildInClause(modes)}`;
```

**Test Coverage**: 14 test cases, 100% coverage

### 4. Color Utilities (`public/js/utils/colors.js`)

**Purpose**: Color generation and conversion

**Exports**:
- `hslToRgb(h, s, l)` - Convert HSL to RGB
- `rgbaToHex(rgba)` - Convert RGBA to hex string
- `hashString(value)` - Generate hash from string
- `generateColor(value, saturation, lightness, alpha)` - Generate deterministic color

**Usage**:
```javascript
import { generateColor, rgbaToHex } from "./js/utils/colors.js";

const color = generateColor("operator1");
const hexColor = rgbaToHex(color);
map.setPaintProperty("layer", "line-color", hexColor);
```

**Test Coverage**: 20+ test cases, 100% coverage

### 5. DOM Utilities (`public/js/utils/dom.js`)

**Purpose**: DOM manipulation helpers

**Exports**:
- `clearElement(element)` - Clear element contents
- `escapeHtml(value)` - Escape HTML special characters
- `getProp(obj, key)` - Get property with case-insensitive fallback
- `getSelectedValues(select)` - Get multi-select values
- `getSelectedValue(select)` - Get single select value
- `formatCount(value)` - Format number with thousands separators
- `toNumber(value, fallback)` - Convert to number with fallback

**Usage**:
```javascript
import { clearElement, formatCount, escapeHtml } from "./js/utils/dom.js";

clearElement(tableBody);
statusEl.textContent = `${formatCount(rows.length)} routes`;
el.innerHTML = escapeHtml(userInput);
```

### 6. URL Utilities (`public/js/utils/url.js`)

**Purpose**: URL manipulation

**Exports**:
- `joinUrl(base, path)` - Join base URL with path
- `toAbsoluteUrl(value)` - Convert relative to absolute URL
- `addCacheBuster(url, version)` - Add cache busting parameter

**Usage**:
```javascript
import { joinUrl, addCacheBuster } from "./js/utils/url.js";

const dataUrl = joinUrl(config.dataBaseUrl, config.parquetFile);
const cachedUrl = addCacheBuster(dataUrl, config.version);
```

### 7. Geometry Utilities (`public/js/utils/geometry.js`)

**Purpose**: Spatial calculations

**Exports**:
- `getGeometryCoordinates(geometry)` - Extract coordinates from any geometry type
- `getFeaturesBbox(features)` - Calculate bounding box for features
- `isValidBbox(bbox)` - Validate bounding box

**Usage**:
```javascript
import { getFeaturesBbox, isValidBbox } from "./js/utils/geometry.js";

const bbox = getFeaturesBbox(geojson.features);
if (isValidBbox(bbox)) {
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]]);
}
```

## Module Design Principles

### 1. Single Responsibility
Each module has one clear purpose:
- `sql.js` - Only SQL-related utilities
- `colors.js` - Only color operations
- `dom.js` - Only DOM manipulation

### 2. Pure Functions Where Possible
Most utilities are pure functions (no side effects):
```javascript
// ✅ Pure function
export const escapeSql = (value) => String(value).replace(/'/g, "''");

// ❌ Impure (but necessary for state management)
export const setMap = (map) => { state.map = map; };
```

### 3. No Circular Dependencies
Modules can depend on lower-level modules but not each other:
```
constants.js ←─ NO dependencies
state.js     ←─ constants.js
sql.js       ←─ constants.js
colors.js    ←─ constants.js
dom.js       ←─ constants.js
```

### 4. Testability First
Every module is designed to be testable in isolation:
- No global dependencies
- Clear inputs/outputs
- Deterministic behavior

### 5. Progressive Enhancement
Modules can be adopted incrementally:
- app.js still works as-is
- New code uses modules
- Old code migrated gradually

## Migration Strategy

### Phase 1: Foundation (✅ Complete)
- Extract constants
- Extract state management
- Extract pure utility functions
- Set up testing infrastructure

### Phase 2: Core Modules (In Progress)
- Extract DuckDB client
- Extract map rendering
- Extract filter logic
- Extract table rendering
- Extract export functions

### Phase 3: Integration
- Update app.js to use all modules
- Remove duplicated code from app.js
- Add integration tests
- Verify feature parity

### Phase 4: Refinement
- Add JSDoc to all functions
- Achieve >80% test coverage
- Performance optimization
- Build pipeline integration

## Testing Strategy

### Unit Tests
Each utility module has comprehensive unit tests:

```bash
tests/
├── sql.test.js          # 14 test cases
├── colors.test.js       # 20+ test cases
├── dom.test.js          # (TODO)
├── url.test.js          # (TODO)
├── geometry.test.js     # (TODO)
└── state.test.js        # (TODO)
```

Run tests:
```bash
npm test                 # Run all tests
npm run test:ui          # Interactive UI
npm run test:coverage    # Coverage report
```

### Integration Tests (TODO)
Test modules working together:
- DuckDB query building → execution
- Filter UI → query → map update
- Feature selection → table highlight

## Benefits of Modularization

### Before
```javascript
// 4,354 lines in one file
// No clear boundaries
// Hard to test
// Difficult to understand

const escapeSql = (value) => ...;  // line 156
const buildWhere = () => ...;       // line 2275
const queryTable = async () => ...; // line 3228
```

### After
```javascript
// Clear module boundaries
import { escapeSql, buildInClause } from "./js/utils/sql.js";
import { state, setTableRows } from "./js/state/manager.js";

// Easy to test
import { escapeSql } from "../public/js/utils/sql.js";
expect(escapeSql("O'Brien")).toBe("O''Brien");

// Easy to understand
// Each file < 200 lines
// Single responsibility
```

### Metrics

**Before Modularization**:
- 1 file (4,354 lines)
- 0 tests
- No clear structure
- Bus factor: 1

**After Phase 1**:
- 8 modules (~1,500 lines extracted)
- 34+ unit tests
- Clear boundaries
- Bus factor: Improving

**Target After Phase 2**:
- 15+ modules
- app.js < 1,000 lines
- 200+ unit tests
- 60%+ coverage

## Using Modules in app.js

### Current Pattern (Will be replaced)
```javascript
// In app.js
const escapeSql = (value) => String(value).replace(/'/g, "''");
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
```

### New Pattern (Use in new code)
```javascript
// At top of app.js
import { escapeSql, quoteIdentifier } from "./js/utils/sql.js";
import { state, setMap } from "./js/state/manager.js";
import { COLORS, LAYER_IDS } from "./js/config/constants.js";

// Use imported functions
const where = `WHERE ${quoteIdentifier("mode")} = '${escapeSql(mode)}'`;
```

## Future Modules (Roadmap)

### DuckDB Module (`public/js/duckdb/client.js`)
- DuckDB initialization
- Connection management
- Query execution
- Error handling

### Map Module (`public/js/map/renderer.js`)
- Map initialization
- Layer management
- Fit bounds utilities
- Click handlers

### Filter Module (`public/js/filters/builder.js`)
- WHERE clause construction
- Filter UI bindings
- Scope management

### Table Module (`public/js/table/renderer.js`)
- Virtualized rendering
- Row selection
- Sorting/pagination

### Export Module (`public/js/exports/handlers.js`)
- CSV export
- GeoJSON export
- State serialization

## Common Patterns

### Importing Constants
```javascript
import { COLORS, LAYER_IDS, TIME_BAND_OPTIONS } from "./js/config/constants.js";
```

### Working with State
```javascript
import { state, setConfig, setMap } from "./js/state/manager.js";

// Set state
setConfig(configData);

// Read state
if (state.duckdbReady) {
  // query data
}
```

### Building SQL
```javascript
import { escapeSql, quoteIdentifier, buildInClause } from "./js/utils/sql.js";

const modes = ["BUS", "COACH"];
const where = `WHERE ${quoteIdentifier("mode")} IN ${buildInClause(modes)}`;
```

### Color Generation
```javascript
import { generateColor, rgbaToHex } from "./js/utils/colors.js";

const color = generateColor(operatorCode);
const hexColor = rgbaToHex(color);
```

## Troubleshooting

### Module Not Found
**Error**: `Failed to resolve module specifier "./js/utils/sql.js"`

**Fix**: Use relative paths from the importing file:
```javascript
// ✅ Correct (from app.js in public/)
import { escapeSql } from "./js/utils/sql.js";

// ❌ Wrong
import { escapeSql } from "js/utils/sql.js";
```

### Import Path Issues
Ensure HTML uses `type="module"`:
```html
<script type="module" src="app.js"></script>
```

### State Mutations
**Problem**: Direct state mutations cause bugs

**Solution**: Use setter functions:
```javascript
// ❌ Bad - direct mutation
state.map = mapInstance;

// ✅ Good - use setter
import { setMap } from "./js/state/manager.js";
setMap(mapInstance);
```

## Best Practices

1. **Import at top of file**
   ```javascript
   import { escapeSql } from "./js/utils/sql.js";
   import { state } from "./js/state/manager.js";
   ```

2. **Use named exports**
   ```javascript
   export const myFunction = () => { ... };
   ```

3. **Keep modules focused**
   - Each module < 300 lines
   - Single clear purpose
   - No circular dependencies

4. **Test everything**
   - Write tests before extracting
   - Aim for 80%+ coverage
   - Test edge cases

5. **Document public APIs**
   - Add JSDoc comments
   - Include usage examples
   - Document parameters and returns

## Next Steps

1. ✅ Extract utility modules
2. ✅ Set up state management
3. 🚧 Extract DuckDB module
4. ⏳ Extract map module
5. ⏳ Extract filter module
6. ⏳ Extract table module
7. ⏳ Update app.js imports
8. ⏳ Remove duplicated code
9. ⏳ Add integration tests
10. ⏳ Performance testing

## Questions?

- See test files for usage examples
- Check module source for inline documentation
- Run `npm test` to verify modules work
- Use `window.__NV_STATE` in console for debugging
