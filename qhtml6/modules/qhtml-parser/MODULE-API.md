# MODULE API

## Purpose
`qhtml-parser` converts QHTML source text into AST/QDom structures and serializes QDom back into QHTML source.

## Boundaries
- Owns QHTML grammar parsing logic.
- Owns selector-mode interpretation and legacy selector token normalization.
- Owns q-script rule parsing/serialization.
- Does not render DOM nodes or perform runtime DOM scanning.

## Public Definitions
- `KNOWN_HTML_TAGS`
  - Set of built-in tags used for selector interpretation.
- `parseQHtmlToAst(source)`
  - Parses QHTML source into an AST.
  - Supports legacy forms used by previous qhtml.js editions:
    - `tag.class1.class2 { ... }`
    - `text { ... }`, `style { ... }`, `on* { ... }`
    - top-level lifecycle blocks: `onReady { ... }`, `onLoad { ... }`, `onLoaded { ... }`
    - component method blocks: `function methodName(args) { ... }`
    - selector-prefix directives: `tag.slot { slot-key } { ... }`
    - `q-template template-id { ... }`
    - `q-component component-id { ... }`
    - `slot { slot-name }` shorthand
- `parseQHtmlToQDom(source, options?)`
  - Converts QHTML source into `qdom-core` document structure.
  - Models `text { ... }` content as explicit QText child nodes, preserving source order with sibling nodes like `html { ... }`, elements, and slots.
  - Supports pre-parse recursive import expansion via `options.loadImportSync` and `options.importBaseUrl`.
  - Resolves component/template invocations into explicit QDom instance nodes:
    - `component-instance`
    - `template-instance`
    - named `slot` containers (with text captured as `text` nodes when available)
  - Preserves slot-forwarding directives inside instance slot containers so nested template/component projection can be resolved at render time.
- `resolveQImportsSync(source, options?)`
  - Recursively resolves `q-import { ... }` blocks before AST conversion.
  - Resolves nested relative imports against the current/base URL.
  - Guards against circular imports and excessive import depth via `maxImports`.
- `resolveQImportsAsync(source, options?)`
  - Async equivalent of recursive import resolution using async loaders (for runtime `fetch()` import loading).
- `qdomToQHtml(documentNode, options?)`
  - Serializes QDom back to QHTML; preserves original source when document is unmodified.
  - Serializes explicit QText/RawHtml child nodes in-order, so mixed content round-trips losslessly.
  - Preserves definition kind on dirty serialization:
    - `q-template ... { ... }` remains template syntax
    - `q-component ... { ... }` remains component syntax
  - Emits lifecycle blocks from both element scope and top-level document scope when serializing dirty QDom.
- `parseQScript(source)`
  - Parses q-script event definitions into typed `script-rule` objects.
- `serializeQScript(rules)`
  - Converts script rules back to q-script source text.

## Side Effects and External Dependencies
- Depends on `globalThis.QHtmlModules.qdomCore`.
- Throws parse errors (`QHtmlParseError`) on malformed source.

## Cross-Module Imports/Exports
- Imports `qdom-core` constructors/utilities.
- Exports API on `globalThis.QHtmlModules.qhtmlParser`.
- Used by `qhtml-runtime` and tooling.

## Backward Compatibility Notes
- Legacy syntax acceptance is expanded to minimize breakage for existing qhtml.js pages while retaining QDom as the source of truth.
