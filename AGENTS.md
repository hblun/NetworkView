# AGENTS.md

## Purpose
Document the run-time rules and expectations codified for agents working in the NetworkView repo.

## Primary instructions
- Treat `plan.md` as the authoritative roadmap for product priorities and intent. It describes phases, definitions, and risks. It is not the task tracker.
- The `public/` folder contains the entire network view runtime: `index.html`, `styles.css`, and `app.js` describe the player UI, while `routes.*` and `metadata.json` hold the dataset.
- Any work reviewing or extending the viewer should also check `README.md` for quick-start scripts and data-generation helpers.
- Baseline documentation should live alongside the roadmap to capture dataset expectations, runtime dependencies, and verification steps.

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
