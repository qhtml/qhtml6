# AGENT INSTRUCTIONS

This repository uses one root `WHEEL.db`, one root `wheel.sh`, one root `AGENTS.md`, and framework source modules under `src/modules/`. Read this file before doing any work.

## Non-Negotiable Rules
- After each prompt, switch to Plan mode to ensure that all of the requirements of the prompt are considered and ask follow up questions about any vague or inconsistent implementation requirements.
- If changes are needeed to existing functions, code, or structures in order to successfully coomplete the requested implementation, then set up a plan of action which clearly outlines which changes must be made and to which files then ask for approval of the plan.
- Do not create module-local `AGENTS.md`, `WHEEL.db`, `wheel.sh`, `wheel-scan.sh`, `README-WHEEL.md`, or `README-WHEEL-SCAN.md` files.
- Do not add new top-level framework modules. Framework source modules live under `src/modules/`:
  - `src/modules/qdom-core`: QDom model helpers and identity support.
  - `src/modules/qhtml-parser`: AST parsing and QDom construction helpers.
  - `src/modules/qhtml-runtime`: QHTML runtime, event loop, mounting, signals, qdom mutation, and live state.
  - `src/modules/dom-renderer`: DOM projection from QDom/QHTML runtime state.
- Keep root code limited to build integration wiring.
- After changing files in the `src` directory or any of its subfolders, please run `build-release.sh` from the project root to concatenate and wire up all modules.
- If a specific change is implementing something that will completely replace another existing implementation, first scan the project files recursively and ensure that no references exist to a specific unused function before removing  or changing it. 
- Always ensure that References are taken into consideration when changing any function as things can be used in multiple places for different purposes. 

## Framework Edit Rule
- Framework refers to any file from the `src` directory or one of its sub-directories. 
- Try to avoid using procedural or conditional parsing except where necessary.
- Some things must be parsed using procedural logic, when this is the case, it is acceptable to use. 
- If an alternative approach exists, opt for functional or object-oriented approaches over procedural approaches to solving issues. 
- Keep every function and object as flexible as possible. Flexibility should always be used over rigidity meaning that functions should accept wide range of parameter types rather than specific functions tailored to specific rigid purposes. 
- Some rigidity is unavoidable and in those cases it is acceptable, but generally prefer to use flexible code over rigid code. 

## QDom Architecture
- QDom is the source of truth after parse time.
- The pipeline is: AST parser -> QDom representation -> QHTML runtime representation -> DOM projection.
- `globalThis.QHTML_QDOM` is the canonical `Map<uuid, qdomObject>` for live QDom identity.
- QDom objects must have UUIDs and must be resolvable through `QHTML_QDOM`.
- Any QHTML-backed DOM element must expose `.qdom()` and resolve through UUID to the live QDom object/facade.
- DOM changes that should persist must be represented as QDom changes.

## Required Files Per Module
Each source module must contain:
- actual source files used by `src/build-release.sh`

Each source module must have a matching `doc/modules/<module>/MODULE-API.md` documenting externally consumable definitions, side effects, dependencies, and compatibility notes for that module.

## wheel.sh Usage
- Use `wheel.sh` for informative tracking only. You may choose to track changes made using `wheel.sh` or track `specs`, `files`, and `defs` using convenience functions.  
- wheel.sh is not required and for many tasks will not add any value. 
- It can come in handy when dealing with large and complex edits, but it is not necessary at this phase of the project.

## Build Rules
- `src/build-release.sh` is the authoritative release bundle script.
- The root `build-release.sh` is a compatibility wrapper that calls `src/build-release.sh`.
- If source files are added within a module, update `src/build-release.sh` bundle order.
- `deploy.sh` must call `src/build-release.sh` directly or through the root compatibility wrapper.
- Do not edit generated `dist/qhtml.js` directly. Edit the relevant `src/*` file or module source file, then run the release bundle generation script so `dist/qhtml.js` is regenerated from source.
- Run the release bundle build after source changes are complete and before final handoff, commit, or push.

## Completion Checklist
- Changes remain inside `src/modules/` unless root integration/build/docs/tests/tools are intentionally affected.
- `doc/modules/<module>/MODULE-API.md` updated for changed public behavior.
- `src/build-release.sh` updated when source file order changes.
- Release bundle build run so generated `dist/qhtml.js` matches source changes.
- If public API changes in some way, then the `doc` folder and sub-folders must be updated in the relevant section to include the new features or changes with examples and explainations for each supported use case. 
- If a subfolder doesn't exist for a particular newly implemented feature, then it must be created.
- If this is a new feature with a new API, a test page or addition to an existing page in the `test` folder must also be created for the user to test and ensure that the feature is working. There must be a visual way for the user to clearly see that the feature is working so that they can validate the changes. 
- Provide the user with the relative URL where they will be able to access the test page for the newly added feature as well as a summary of changes made and changes requested but that were not fully made and then prompt the user to see if the tests weere successful.
- If yes, then ask if the user wants to have the README.md file updated with the latest changes along with a version increase or not.
- If yes then update README.md wih the latest changes and move the older changes into the CHANGES.md file in the root directory of the repo. 
- Version number changes should update the README as well as the constant QHTML_VERSION which can be found in the files in the `src` directory.
