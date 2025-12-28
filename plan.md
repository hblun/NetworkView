# plan.md — DuckDB-WASM + PMTiles Planner Platform

## Purpose
Deliver a planner-friendly web platform that lets non-GIS users explore **route lines** and related transport datasets, apply **clip + filters + time bands**, inspect features, and export **tables + report-ready figures**.  
Core tech choice: **DuckDB-WASM in the browser** for analysis/tabular outputs, and **PMTiles** for scalable map layer delivery.

## Product ethos
- **Table-first, map-supported**: the table is the truth; the map explains patterns.
- **Progressive disclosure**: simple defaults; advanced controls behind an “Advanced” drawer.
- **Evidence built-in**: every export includes scope, sources, assumptions, limitations.
- **No GIS prerequisites**: Excel/Word/PowerPoint patterns over GIS metaphors.

---
## Discovery log (2025-12-28)
- COEP/COOP headers from `tools/dev_server.py` can block cross-origin CSS/JS (Tailwind, Google Fonts, MapLibre CSS) unless requested with CORS. This manifested as the UI rendering in a linear, unstyled layout. Added `crossorigin="anonymous"` to external assets in `public/index.html` to allow CORS under `Cross-Origin-Embedder-Policy: require-corp`.

## Discovery log (2025-12-26)
- Spatial SLB module imports in `public/app.js` were present but `public/js/spatial/` files were missing in this branch, causing module load failure and “Failed to fetch dynamically imported module” on startup. Added minimal spatial stubs and state wiring to restore app load while SLB work continues.

## Discovery log (2025-12-25)
- Repo currently ships a static viewer in `public/` with `index.html`, `styles.css`, `boot.js`, `app.js`, plus bundled data artefacts (`routes.pmtiles`, `data/parquet/routes.parquet`, `metadata.json`).
- Runtime depends on CDN-hosted ES modules (MapLibre, PMTiles, DuckDB-WASM) and a direct R2 public bucket configured in `public/config.json`.
- `README.md` previously referenced a `frontend/` path and missing scripts; this has been corrected in doc tidy-up.
- `BASELINE.md` exists and documents the current runtime + dataset; it should be treated as the initial baseline doc alongside this plan.
- Phase 1 data artefacts audit (superseded): boundary PMTiles and `operators.parquet` now exist in `public/`, and local pipeline tooling is present under `tools/`.
- Phase 1 progress: generated `public/boundaries_la.pmtiles` and `public/boundaries_rpt.pmtiles` from Spatial Hub LA WFS (layer `sh_las:pub_las`) by dissolving LA polygons into RPT regions. RPT boundaries assume full `Argyll and Bute` belongs to HITRANS (cannot split Helensburgh + Lomond without a sub-LA boundary); this limitation should be disclosed in Evidence and/or refined later.
- Phase 1 progress: regenerated `data/parquet/routes.parquet` and `public/routes.pmtiles` with `la_code/la_name` and `rpt_code/rpt_name` attributes plus multi-membership `la_codes/rpt_codes` (pipe-delimited) so filters can match any intersecting area. Routes that failed the intersection (e.g., ferry services like `SF8 Shetland - Foula` / `CM20 Castlebay - Oban`) fall back to nearest-LA assignment.
- Phase 2 note: time band filter UI now supports a “coming soon” state; current `data/parquet/routes.parquet` schema lacks timetable flag columns, so the filter remains disabled until time-band flags are generated.
- DuckDB-WASM range reads can fail against local servers without robust range support; local dev now prefers buffering `routes.parquet` into memory (`parquetPreferBuffer`) to avoid “file too small” errors.
- Map viewport filter bugfix: DuckDB count/table/stats/exports now use `buildCombinedWhere` so the "Limit to map viewport" checkbox applies to query scope; added bbox-aware filter tests.
- Viewport filtering now uses spatial geometry when available (`ST_Intersects` + `ST_MakeEnvelope`) and falls back to bbox columns when spatial is unavailable.
- Geocoder selection now syncs the spatial point overlay/label and clears the map marker when filters reset to keep UI state consistent.
- Phase 3 integration check: several module helpers now require explicit UI parameters (operators, time bands, service search); missing argument wiring in `public/app.js`, plus missing `filters` propagation in table paging and export handlers, can silently disable filters or crash exports unless fixed.
- Phase 3 integration check: `initDuckDb` now requires `duckdb` + `setStatus`; missing args caused DuckDB init to fail at runtime while unit tests still passed. Added app wiring tests to catch these runtime-only regressions.
- Phase 3 integration check: map filter wiring must pass detected `tileFields` into `buildMapFilter`; missing tileFields caused runtime crashes when MapLibre fired idle events before detection.
- DuckDB-WASM spatial extension now sets home/extension directories to avoid `/home/web_user` errors in browser FS.
- E2E coverage added: Playwright filter walkthrough (all modes, one operator, one LA, one RPT) wired into CI.
- Spatial Query Tool mockup exists at `public/design/index.html` (served at `/design/`); used for UX alignment before wiring.
- New epic defined: **Simplified Spatial Logic Builder** (SLB) for non-technical spatial logic via Include/Also include/Exclude blocks. It depends on Spatial Query Tool (NetworkView-3uh), map ↔ table linkage, and evidence panel infrastructure; it should integrate via a Python-backed runner for template-driven logic and plain-English evidence.
- SLB scaffolding now lives in `public/js/spatial/` with default block options and evidence hook; runner integration and map/table execution remain pending.
- SLB runner plumbing added: templates live in `public/spatial_logic_templates.json`, generated by `tools/build_spatial_logic_templates.py`, and loaded via `public/js/spatial/runner.js`.
- SLB execution plumbing added: spatial match sets flow through state, filters, and map rendering via `public/js/spatial/execute.js` (expects runner to provide matchSet or SQL).
- SLB spatial SQL builder added in `public/js/spatial/sql.js`, with config-backed sources and CRS settings in `config.json` for DuckDB spatial execution.
- Point-based spatial queries now supported via a Selected Point source: map click sets point, and SQL builder can use `selected_point` with routes as default dataset.
- Spatial point marker + radius ring overlay added; radius uses builder "within" distance when targeting selected point.

## Beads (2025-12-28)
- `NetworkView-ubc` (“Improve spatial query coverage and relation controls”) reinforces the Spatial Query Tool epic/goals around relational operators (intersect/within/contains/touches) and dataset-agnostic filtering mentioned in the Architects section of Workstream 2.
- `NetworkView-hf0` (“Map misses scope-selected service”) directly pairs with the Phase 2 acceptance criteria for table/map sync, so follow-up work should ensure MapLibre filters and DuckDB table queries share the same scope state.
- `NetworkView-36p` (“Simplify left-panel filtering tiers”) documents a progressive-disclosure approach to the mode → operator → LA → RPT hierarchy, aligning with the “Progressive disclosure” ethos and the pending Simplified Spatial Logic Builder narrative in phase-planning.

## Documentation consolidation (2025-12-25)
This section replaces the standalone status/phase docs (PHASE2_COMPLETION.md, PHASE3_PLAN.md, PHASE3_PROGRESS.md, REFACTORING_PROGRESS.md, MODULARIZATION_GUIDE.md, COMPLETED_WORK.md). Those files now point here to avoid conflicting status.

### Refactor + modularization summary
- `public/js/` now contains modularized utilities and domain layers (config, state, utils, duckdb, filters, map, table, exports, spatial).
- The monolith refactor introduced Vitest tests and ESLint; CI runs tests/lint via `.github/workflows/ci.yml`.
- `package.json` provides `npm test`, `npm run lint`, and `npm run dev` (dev server wrapper).

### Phase 2–3 integration status
- Phase 2 modularization delivered reusable modules under `public/js/`.
- Phase 3 integration work is ongoing; see Beads for current integration tasks and priorities.
- If app.js changes are needed, prefer updating modules and wiring, not reintroducing monolithic helpers.

### Current doc sources of truth
- **Beads**: task tracking and execution details.
- **plan.md**: roadmap, intent, risks, and consolidated status history.
- **BASELINE.md**: runtime snapshot + dataset state.
- **README.md / DEPLOYMENT.md**: operator-focused setup and deployment steps.
- Added spatial smoke test (`tests/e2e/spatial.e2e.js`) and extension-directory fix (use `/.duckdb` home with relative `extensions` dir) to avoid duplicated path issues.
- Bundled DuckDB spatial extension under `public/duckdb/extensions/v0.9.1/wasm_mvp/` and pointed `spatialExtensionUrl` to local file; added fetch script `tools/fetch_duckdb_spatial_extension.sh`.


## Architecture overview

### High-level
- **Static hosting** (cheap): app bundle + PMTiles + GeoParquet + metadata JSON served from CDN/object storage.
- **Browser** does most work:
  - Map renders vector tiles from **PMTiles** (MapLibre).
  - Tables, counts, filtering summaries, exports via **DuckDB-WASM** querying **GeoParquet/Parquet**.

### Data artefacts
- `routes.pmtiles` — route lines, with key properties on each feature
- `boundaries_la.pmtiles` — Local Authority boundaries
- `boundaries_rpt.pmtiles` — RPT areas
- `routes.parquet` — attribute table for route features (service/operator/mode + any computed fields)
- `operators.parquet` — operator lookup
- `metadata.json` — dataset versions, timestamps, definitions (time bands, buffer defaults), provenance

### Key design decision (keeps Map Viewer fast)
**Map filtering uses MapLibre layer filters on tile properties.**  
DuckDB-WASM powers the table and exports, plus any heavier joins/aggregation.

> If you later need “true spatial clip”, you can add precomputed area codes per route line (preferred) rather than live geometry clipping in the browser.

---

## Definitions and conventions (v1)
### Time bands (configurable)
Start with a single central config file so you can change without refactoring:
- `WEEKDAY_AM_PEAK` (07:00–10:00)
- `WEEKDAY_INTERPEAK` (10:00–16:00)
- `WEEKDAY_PM_PEAK` (16:00–19:00)
- `EVENING` (19:00–22:00)
- `NIGHT` (22:00–05:00)
- `SUNDAY` (all day)

**v1 behaviour**: if you don’t yet have schedule-derived flags, time band filter is either:
- a day-type filter (Weekday/Sat/Sun), plus “Evening/Night flag” only when available, or
- shown as “coming soon” with an explanation in Evidence.

### Route line feature properties (minimum)
Each tile feature should include:
- `service_id` (stable)
- `service_name` (route number/name)
- `operator_code`
- `operator_name` (optional if you prefer lookup)
- `mode`
- `la_code` (primary LA) and `rpt_code` (primary RPT) **(recommended)**
- `traveline_url` (optional)
- `timetable_pdf_url` (optional)
- optional flags: `runs_weekday`, `runs_sunday`, `runs_evening`, `runs_night`

---

## Workstreams
1. **Data pipeline**: produce PMTiles + Parquet + metadata
2. **Frontend Map Viewer**: MapLibre + filters + table + inspector + exports
3. **DuckDB analysis layer**: query helpers, export helpers, evidence generation
4. **Quality and performance**: correctness checks, payload limits, regression tests
5. **Deployment**: static hosting + versioning + rollbacks
6. **Simplified Spatial Logic Builder**: non-technical spatial logic UX layered on Spatial Query Tool

---

## Epic: Simplified Spatial Logic Builder (SLB)
Summary: non-technical spatial logic builder using **Include / Also include / Exclude** blocks. The builder compiles to internal boolean logic (no boolean terms in UI), updates map/table live, and produces plain-English evidence. Templates should be driven by a Python-backed runner for easy template changes now and user-defined templates later.

Dependencies
- Spatial Query Tool epic (NetworkView-3uh)
- Map ↔ table linkage
- Evidence panel infrastructure

Scope (v1)
- Builder UI that is visual, guided, and hard to break; <60s to use.
- Curated spatial logic options (no arbitrary operators).
- Plain-English logic statement for evidence + export.

Non-goals (v1)
- Full boolean expression editor.
- Arbitrary spatial operators.
- Teaching boolean terminology.

Subtasks (aligned to Beads)
- **SLB-01** Logic builder UI shell + state model (blocks, ordering, constraints).
- **SLB-02** Template library + Python runner integration (compiled logic + metadata).
- **SLB-03** Translate block actions into spatial query state; live map/table update.
- **SLB-04** Evidence output: human-readable sentence + template metadata in evidence panel/export.
- **SLB-05** UX polish + guardrails (empty states, guidance, validation).
- **SLB-06** Tests: builder state logic, SQL/logic compilation, evidence output.

Notes
- Design reference: `public/design/index.html` (mockup; requires dynamic data wiring).
- Builder should consume runner output instead of hard-coded UI logic to keep templates editable.

---

## Phasing and staging

### Phase 0 — Repo + foundations (1–2 days)
Goal: establish a working shell and tooling.

Tasks
- [ ] Create mono-repo structure:
  - `apps/web` (Map Viewer UI)
  - `packages/data-pipeline` (scripts)
  - `data/` (local dev artefacts)
- [ ] Define central configuration:
  - `config/definitions.json` (time bands, default styling, thresholds)
  - `config/sources.json` (dataset attribution, update frequency)
- [ ] Decide dev server + build system:
  - Vite + React + TypeScript (recommended for simplicity)

Deliverables
- Running local web app scaffold with placeholder layout
- Config files committed

Acceptance
- `pnpm dev` (or `npm run dev`) launches app and renders a placeholder map container and table container

---

### Phase 1 — Data artefacts v1 (PMTiles + Parquet) (3–7 days)
Goal: route lines and boundaries are served as PMTiles; attribute tables exist as Parquet for DuckDB.

Tasks: boundaries
- [ ] Source Local Authority boundaries (your dataset or external)
- [ ] Source RPT boundaries (your dataset or external)
- [ ] Normalise to a consistent CRS (WGS84) and simplify geometry for tiling
- [ ] Generate `boundaries_la.pmtiles`
- [ ] Generate `boundaries_rpt.pmtiles`

Tasks: route lines
- [ ] Ingest route lines (your existing API output / GeoJSON / database)
- [ ] Normalise and clean attributes:
  - ensure stable `service_id`
  - ensure operator and mode values are consistent
- [ ] Compute primary `la_code` and `rpt_code` per route line (recommended v1 approach)
  - choose a deterministic rule (e.g., max intersect length)
- [ ] Generate `routes.pmtiles` with above properties present on tile features
- [ ] Generate `routes.parquet` attribute table for DuckDB (same keys + richer columns)

Tasks: metadata
- [ ] Generate `metadata.json` including:
  - dataset versions (hash or timestamp)
  - generated-at time
  - attribution text
  - definitions.json version used

Deliverables
- `routes.pmtiles`, `boundaries_la.pmtiles`, `boundaries_rpt.pmtiles`
- `routes.parquet`, `operators.parquet` (if available)
- `metadata.json`

Acceptance
- PMTiles open in a simple MapLibre test page and render at national scale
- DuckDB-WASM can query `routes.parquet` locally and return counts by operator/mode

---

### Phase 2 – Map Viewer MVP (route lines + clip + filters + linked table) (5–10 days)
Goal: a planner can find a place, clip to LA/RPT, filter routes, inspect, and export a CSV.

Tasks: UI layout and patterns
- [ ] Implement three-panel layout:
  - left controls
  - central map
  - bottom table + right inspector drawer
- [ ] Implement filter chips (clip/mode/operator/time band) and “Clear all”

Tasks: map rendering
- [ ] MapLibre map with basemap style
- [ ] PMTiles integration for routes + boundaries
- [ ] Styling presets:
  - default colour by `mode`
  - optional colour by `operator_code` (advanced)

Tasks: clipping
- [ ] Clip control:
  - choose LA by dropdown/search
  - choose RPT by dropdown/search
- [ ] Apply clip as a MapLibre layer filter on `la_code`/`rpt_code`
- [ ] Display active boundary outline and name

Tasks: filtering
- [ ] Mode filter (multi-select)
- [ ] Operator filter (typeahead multi-select)
- [ ] Service search (route number/name)
- [ ] Time band filter (enabled if flags exist, otherwise disabled with “coming soon”)

Tasks: linked table
- [ ] DuckDB-WASM initialisation
- [ ] Query builder that mirrors active filters and clip
- [ ] Table view (virtualised rows)
- [ ] Map ↔ table selection (service_id links)

Tasks: inspector + drill-through
- [ ] Click a route line → show inspector card:
  - service name, operator, mode, IDs
  - links (Traveline/PDF) if present
- [ ] Copy buttons for service_id/operator_code

Tasks: exports
- [ ] Export current table to CSV (DuckDB query → CSV blob download)
- [ ] Evidence strip visible:
  - scope summary, filters, dataset version, definitions version
- [ ] Save “Map State” as JSON (local storage v1 is fine)

Deliverables
- Map Viewer usable end-to-end for route lines
- CSV export working
- Evidence strip present

Acceptance
- User can:
  1) search Dundee (or pick it from list)
  2) clip to Dundee City (LA)
  3) filter Bus + selected operator
  4) click a route, see its ID + link
  5) export CSV matching the current view
- Table row count matches the map feature set under the same filters (within defined rules)

---

### Phase 3 — Snapshot export + MapBuilder hand-off (3–7 days)
Goal: create report-ready visuals without GIS.

Tasks: snapshot export
- [ ] Export PNG snapshot with:
  - title (user editable)
  - legend
  - scope chips printed (clip + mode + operator + time band)
  - date/time generated + dataset version
- [ ] Add “Copy evidence note” (plain text for Word appendix)

Tasks: MapBuilder scaffold (minimal)
- [ ] “Send to MapBuilder” stores a `MapArtefactDraft` (JSON spec)
- [ ] MapBuilder shows the same view and allows:
  - title/subtitle edits
  - annotation text box (simple)
  - export again

Deliverables
- Report-ready PNG export
- Evidence note copy feature
- Minimal MapBuilder that reuses Viewer state

Acceptance
- Exported PNG can be dropped into a Word report and is self-explanatory without additional context
- Evidence note can be pasted into an appendix and matches the export scope

---

### Phase 4 — Performance hardening + real time bands (as data allows) (ongoing)
Goal: make it robust and scalable.

Tasks
- [ ] Convert large layers to multiple PMTiles by theme if needed
- [ ] Add caching headers + CDN rules for PMTiles/Parquet
- [ ] Add timetable-derived flags for time bands:
  - `runs_evening`, `runs_night`, `runs_sunday`
- [ ] Add smoke tests:
  - “LA clip returns expected counts”
  - “Operator filter yields stable totals”
- [ ] Add graceful degradation:
  - missing links → hide actions
  - missing time flags → disable filter with explanation

Acceptance
- Viewer remains responsive with Scotland-wide view and typical filters
- Time band filter behaviour is correct and disclosed in Evidence

---

## Libraries and tooling

### Frontend (recommended stack)
Core
- `react`, `react-dom`
- `typescript`
- `vite` (or Next.js if you prefer, but Vite is lighter)
- `maplibre-gl`
- `pmtiles`

DuckDB + data handling
- `@duckdb/duckdb-wasm`
- `apache-arrow` (DuckDB results / Arrow tables)
- Optional for file handling: `file-saver` (or roll your own blob download)

UI + state
- `@tanstack/react-table` (table)
- `@tanstack/react-virtual` (virtualised rows)
- `zustand` (simple state store)
- `zod` (runtime schema validation for MapState/Artefact JSON)
- UI kit (pick one):
  - **MUI** (`@mui/material`, `@mui/icons-material`) for speed, or
  - **shadcn/ui** (Radix + Tailwind) for a cleaner aesthetic

Search
- Start simple:
  - curated place list / basic geocoder endpoint, or
  - external geocoder later

Dev quality
- `eslint`, `prettier`
- `vitest` (unit tests)

Install (example)
- `pnpm add maplibre-gl pmtiles @duckdb/duckdb-wasm apache-arrow zustand zod @tanstack/react-table @tanstack/react-virtual`
- plus your chosen UI kit

### Data pipeline tooling (local scripts)
PMTiles generation options (pick one approach)
1) Tippecanoe + pmtiles tooling
- `tippecanoe` (vector tile generation)
- `pmtiles` CLI (packaging/conversion where needed)

2) GDAL/OGR for conversion/simplification
- `gdal` / `ogr2ogr`

Parquet generation
- `duckdb` CLI (fast for transforms)
- Python optional:
  - `geopandas`, `pyarrow`, `shapely` (only if you prefer Python for spatial joins)

Suggested approach for a solo builder
- Use DuckDB for joins/normalisation → export GeoJSON for tiling + Parquet for analysis.
- Use Tippecanoe → PMTiles.

### Hosting (cheap and simple)
- Static hosting for `/dist` and `/data/*` artefacts:
  - Cloudflare Pages + R2 (recommended), or
  - S3 + CloudFront, or
  - any CDN-backed object storage

> Keep PMTiles and Parquet as immutable versioned files (e.g. `/data/2025-12-25/routes.pmtiles`), and have `metadata.json` point to “current”.

---

## Key risks and mitigations

### 1) Filtering by clip without true geometry
Risk: `la_code`/`rpt_code` as “primary” can misrepresent cross-boundary services.  
Mitigation:
- disclose this as a limitation in Evidence
- later: store an array of intersecting areas, or compute per-view with DuckDB and accept smaller scales

### 2) Large attribute tables in browser
Risk: loading huge Parquet can be heavy.  
Mitigation:
- keep route table narrow in v1
- partition parquet by mode/operator if needed
- lazy-load and cache in IndexedDB later

### 3) Time bands without schedule-derived flags
Risk: users expect “evening routes” to be correct.  
Mitigation:
- ship day-type first
- add time flags once you have reliable derivation
- make the UI honest (disable with explanation rather than guessing)

---

## Open questions (answering these will tighten the plan)
1) How many route line features are we talking (roughly)? 5k, 50k, 500k?
2) Do you want Scotland-wide PMTiles in a single file, or split by mode/operator for easier updates?
3) Do you already have stable Traveline/PDF links per service_id, or do we need a lookup table build step?
4) For LA/RPT clipping: do you want “primary area only” v1, or “any intersecting area” even if it’s slower?

---

## Immediate next step
Start with Phase 1 and Phase 2 in parallel:
- Generate `routes.pmtiles` + `routes.parquet` + boundary PMTiles
- Stand up MapLibre + PMTiles rendering with a basic filter UI and DuckDB table query

Once those two are working, you’ll have a genuinely usable planner tool.

### Frontend mockup integration plan (Phase 2)
- **Context**: `frontendmock.html` now contains a full static mockup (header with nav actions, “Scope” panel, layer toggles, map canvas with legend/flyouts, and a Data Inspector table with CSV export) that needs to be interpreted against Phase 2 goals, not re‑created from scratch.
- **Task 1 (Phase 0/2)**: Perform a gap analysis vs. `public/index.html` + `app.js`:
  - translate header actions (Share, Snapshot, navigation pills) into toolbar controls that can trigger exports or view switches.
  - diagram the “Scope” chips, search box, and layer toggles as the filter/clip entry points described in Phase 2 (clip to LA/RPT, search for services, mode/operator filters).
  - line up the Tools panel (Clip/Select, Measure) with planned clip controls and inspector selection states.
- **Task 2 (Phase 2)**: Break the mockup into viewer subsystems and map them to roadmap artefacts:
  - Layout: left control column + full-width map + bottom inspector table, matching the three-panel pattern.
  - Filters/state: scope chips + search + layer toggles → map filter state (LA/RPT clip, mode/operator/time bands) + DuckDB query parameters.
  - Map interactions: legend, zoom controls, popup card, pulsing highlight, inspector callouts → PMTiles layer styling + inspector wiring.
  - Data Inspector: sticky header with selection counts, export button, evidence bar → DuckDB query view + CSV export + metadata display (dataset version, last update).
- **Task 3 (Phase 2/3)**: Record required data/API hooks before coding:
  - Document what metadata tables are needed for the Vista (dataset version, last updated, EPSG/wkt info) so Evidence strip matches mockup text.
  - Note that tools (Clip/Select, Measure, share/export) will require new actions or connectors; confirm expected outputs (selection counts, service links) before implementation.
  - Update README/BASELINE with any new assets (mockup fonts, Tailwind config, hero imagery) and verification steps (render map + table + evidence states) so documentation tracks this surface.
- **Task 4 (Phase 2/4)**: Once ready to build, expand this plan with explicit subtasks (component breakdown, state flows, styling tokens, accessibility/keyboard focus) and call out which roadmap risks (filtering accuracy, table exports, time-band honesty) each subtask addresses.

> Implementation work is tracked in Beads (`bd list`, `bd show …`). `plan.md` is intentionally kept as the roadmap/intent only.
