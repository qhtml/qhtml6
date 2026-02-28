# LEAD CLI Usage

## Initialization
- `./lead.sh init`
- Requires `README.md` in current working directory.
- Creates `lead-main.db` and validates schema contracts.

## Analyze README
- `./lead.sh analyze`
- `./lead.sh analyze --readme /path/to/README.md`
- `./lead.sh analyze --interactive`

Behavior:
- Extracts modules, requirements, constraints, use cases, dependencies.
- Persists deterministic specifications and test cases.
- Persists clarification prompts for ambiguous README content.

## Module Registry
- `./lead.sh module list`
- `./lead.sh module add --module my-module [--path modules/my-module] [--description TEXT] [--status active]`
- `./lead.sh module update --module my-module [--new-name NAME] [--path PATH] [--description TEXT] [--status STATUS]`
- `./lead.sh module del --module my-module`

## Module Scan (wheel-scan compatible style)
- `./lead.sh scan --module my-module`
- `./lead.sh scan --module my-module --path modules/my-module --max-depth 4 --filter '*.cpp' --filter '*.h' --exclude build`
- Output modes: `--json` (default), `--csv`, `--table`

Behavior:
- Finds files with filter globs.
- Extracts function/definition-like constructs by file type.
- Emits records with `file,line,text,type,signature,language`.
- Syncs `files`, `definitions`, and `methods` in `lead-module.db`.

## Search
- `./lead.sh search [filters...] [--columns c1,c2,...] [--limit N] [--json|--csv|--table]`

Supported filters:
- `--module`
- `--file`
- `--method`
- `--definition`
- `--description`
- `--requirement`
- `--use-case`
- `--test-case`
- `--dependencies`

Behavior:
- Aggregates global + module databases.
- Supports glob patterns and numeric id lookup.
- Default limit: `2000`.

## Intent
- `./lead.sh intent --module my-module`
- `./lead.sh intent --module my-module --llm-cmd 'your_command_here'`

Behavior:
- Retrieves full related context:
  - requirements/specifications/dependencies/test cases/use cases/bugs/constraints
- Builds full JSON payload for implementation.
- Persists intent runs to global and module databases.
- Applies relational link updates when `links` are returned by LLM response JSON.

## Generic Database Commands (wheel-style)
- `./lead.sh query --table modules [--module NAME] [--where SQL] [--order-by SQL] [--limit N] [--json|--csv|--table]`
- `./lead.sh insert [--module NAME] TABLE key=value ...`
- `./lead.sh update [--module NAME] TABLE --set key=value ... [--id N|--where SQL]`
- `./lead.sh delete [--module NAME] TABLE [--id N|--where SQL]`
- `./lead.sh describe [--module NAME] TABLE [--schema] [--id N|--where SQL]`
- `./lead.sh raw [--module NAME] [SQL]`

## Schema Sources
- Global schema SQL: `./sql/lead-main-schema.sql`
- Module schema SQL: `./sql/lead-module-schema.sql`
- AGENTS policy: only root `./AGENTS.md` is authoritative; no per-module AGENTS files are generated.
