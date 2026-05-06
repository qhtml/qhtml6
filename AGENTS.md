# AGENT INSTRUCTIONS

This repository uses one root `WHEEL.db`, one root `wheel.sh`, one root `AGENTS.md`, and three source modules. Read this file before doing any work.

## Non-Negotiable Rules
- Query root `WHEEL.db` with `./wheel.sh` before implementing a user requirement.
- Store new authoritative requirements in root `spec_memory` when the prompt adds or changes behavior.
- Do not create module-local `AGENTS.md`, `WHEEL.db`, `wheel.sh`, `wheel-scan.sh`, `README-WHEEL.md`, or `README-WHEEL-SCAN.md` files.
- Do not add new top-level framework modules. The framework has exactly three source modules:
  - `modules/qhtml-parser`: AST parsing and QDom construction helpers.
  - `modules/qhtml-runtime`: QHTML runtime, event loop, mounting, signals, qdom mutation, and live state.
  - `modules/dom-renderer`: DOM projection from QDom/QHTML runtime state.
- Keep root code limited to build, release, docs, tests, and integration wiring.
- If a module needs more organization, add source files inside that existing module and update `build-release.sh`.
- Remove obsolete module scaffolding instead of preserving dead module directories.

## Framework Edit Rule
- Only change existing framework functions or framework files when adding language/runtime behavior.
- Prefer generic framework APIs over targeted JavaScript workarounds in component files.
- Do not work around QHTML shortcomings with procedural component code. Fix the parser/runtime/renderer capability in the appropriate module.
- Use declarative QHTML constructs where possible: properties, signals, bindings, slots, qdom mutation helpers, and component composition.
- Use imperative JavaScript only as minimal event-bridge glue or as reusable framework behavior.

## QDom Architecture
- QDom is the source of truth after parse time.
- The pipeline is: AST parser -> QDom representation -> QHTML runtime representation -> DOM projection.
- `globalThis.QHTML_QDOM` is the canonical `Map<uuid, qdomObject>` for live QDom identity.
- QDom objects must have UUIDs and must be resolvable through `QHTML_QDOM`.
- Any QHTML-backed DOM element must expose `.qdom()` and resolve through UUID to the live QDom object/facade.
- DOM changes that should persist must be represented as QDom changes.

## Required Files Per Module
Each source module must contain:
- `MODULE-API.md`
- actual source files used by `build-release.sh`

`MODULE-API.md` must document externally consumable definitions, side effects, dependencies, and compatibility notes for that module.

## wheel.sh Usage
- Use root `./wheel.sh`; do not use or create module-local Wheel databases.
- Before coding, search for reusable definitions:
  - `./wheel.sh search <term> --table defs --table files`
  - `./wheel.sh search --table defs --semantic "<intent text>" --semantic-top 30 --semantic-min-score 0.05`
- Use only `./wheel.sh query/insert/update/raw` for root metadata changes.
- Do not load `WHEEL.sql` into context.
- Do not add `wheel.sh` or `wheel-scan.sh` entries to metadata unless editing those scripts.

## Build Rules
- `build-release.sh` lives at the repo root.
- If source files are added within a module, update `build-release.sh` bundle order.
- `deploy.sh` must call the root `build-release.sh`.
- Do not edit generated `dist/qhtml.js` directly. Edit the relevant `src/*` file or module source file, then run the release bundle generation script so `dist/qhtml.js` is regenerated from source.
- Run the release bundle build after source changes are complete and before final handoff, commit, or push.

## Completion Checklist
- Root `WHEEL.db` searched and updated if requirements changed.
- Changes remain inside one of the three source modules unless root integration/build/docs/tests are intentionally affected.
- `MODULE-API.md` updated for changed public behavior.
- `build-release.sh` updated when source file order changes.
- Release bundle build run so generated `dist/qhtml.js` matches source changes.
- Smoke tests/build run or failure is reported with exact reason.
