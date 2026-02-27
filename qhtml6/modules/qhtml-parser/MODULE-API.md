# MODULE API — qhtml-parser

## Purpose
Transforms QHTML text into QDom and back, with import resolution and preprocessing support.

## Export surface
Exports via `globalThis.QHtmlModules.qhtmlParser`.

### Constants
- `KNOWN_HTML_TAGS` — tag allowlist/recognition set used during parsing decisions.

### Core parse APIs
- `parseQHtmlToAst(source)`
  - Produces intermediate AST for diagnostics/tooling.
- `parseQHtmlToQDom(source, options?)`
  - Produces QDom document.
  - Key options:
    - `resolveImportsBeforeParse` (default true)
    - `loadImportSync(url)` for sync import expansion
    - `importBaseUrl`, `maxImports`, `importCache`
    - `maxQRewritePasses`, `maxQScriptPasses`
    - `scriptRules` preparsed q-script rules

### Preprocessing/import APIs
- `applyQRewriteBlocks(source, options?)`
  - Expands `q-rewrite` macros with slot substitution or script-generated output.
- `resolveQImportsSync(source, options?)`
- `resolveQImportsAsync(source, options?)`
  - Both recursively inline `q-import` blocks.
  - Detect circular imports and enforce max import count.

### Serialization APIs
- `qdomToQHtml(documentNode, options?)`
  - Converts QDom document to canonical QHTML source.
  - `preserveOriginal` defaults to true.
- `parseQScript(source)`
  - Parses q-script rules of form `selector.on("event"): { ... }`.
- `serializeQScript(rules)`
  - Serializes script rules back to source.

## Error model
- Throws `QHtmlParseError` with `.index` for syntax errors.
- Import/macro stages throw descriptive `Error` messages for recursion/limits/unbalanced blocks.

## Cross-module usage
- Requires `qdom-core` for node creation and type constants.
- Consumed by `qhtml-runtime` for mount-time parsing and source export workflows.
