# MODULE API — qhtml-parser

## Purpose
Transforms QHTML text into QDom and back, with import resolution and preprocessing support.

## Export surface
Exports via `globalThis.QHtmlModules.qhtmlParser`.

### Constants
- `KNOWN_HTML_TAGS` — tag allowlist/recognition set used during parsing decisions.

### Core parse APIs
- `parseQHtmlToAst(source, options?)`
  - Produces intermediate AST for diagnostics/tooling.
  - `options.keywordAliases` (Map) seeds scoped alias state for nested parse contexts.
- `parseQHtmlToQDom(source, options?)`
  - Produces QDom document.
  - Key options:
    - `resolveImportsBeforeParse` (default true)
    - `loadImportSync(url)` for sync import expansion
    - `importBaseUrl`, `maxImports`, `importCache`
    - `maxQRewritePasses`, `maxQScriptPasses`
    - `scriptRules` preparsed q-script rules
  - Language outputs include:
    - `component.properties` from `q-property { ... }` blocks
    - component inheritance metadata:
      - `q-component child extends baseA extends baseB { ... }`
      - emitted as `component.extendsComponentIds` (plus legacy first entry in `component.extendsComponentId`)
    - instance-level `q-property` declarations are retained in node metadata (`meta.__qhtmlDeclaredProperties`) and used when mapping invocation assignments/bindings into `component-instance.props`
    - inherited `q-property` declarations from multi-`extends` chains are included when mapping invocation assignments into `component-instance.props`
    - `component-instance.props` populated when invocation keys match declared component properties
    - `meta.qBindings` entries for assignment expressions (`q-bind` / assignment-form `q-script`)
    - definition kind preservation for `q-component`, `q-template`, and `q-signal`
    - scoped keyword alias parsing via `q-keyword name { replacement-head }`
    - per-node alias metadata as `node.keywords`
    - signal declaration + invocation parsing:
      - `q-signal name { slot { slot1 } ... }`
      - `name { slot1 { ... } ... }`
    - component-local signal method declarations:
      - `q-signal name(param1, param2)` inside `q-component`
      - emitted in QDom as `component.signalDeclarations`
    - component alias declarations:
      - `q-alias aliasName { return ... }` inside `q-component`
      - emitted in QDom as `component.aliasDeclarations`
    - component wasm declarations:
      - `q-wasm { ... }` inside `q-component`
      - emitted in QDom as `component.wasmConfig`
    - style declarations and application:
      - `q-style name { q-style-class { classA classB } prop: value }`
      - `q-style-class` stores class tokens in the style definition
      - applying the style merges classes into `class` and declarations into `style`
    - repeater and iterable model support:
      - `q-repeater` and `q-foreach` blocks
      - model containers `q-array` and `q-object`
      - `model { ... }` and `slot { itemName }` syntax compiled into runtime-ready repeater QDom:
        - `repeater.kind === "repeater"`
        - `repeater.model.kind === "model"` (`QDomModel`) with `entries`
        - `repeater.templateNodes` kept intact for runtime rendering
      - parser no longer expands repeater output nodes directly; rendering happens in `dom-renderer`

### Preprocessing/import APIs
- `applyQRewriteBlocks(source, options?)`
  - Expands `q-rewrite` macros with slot substitution or script-generated output.
- `resolveQImportsSync(source, options?)`
- `resolveQImportsAsync(source, options?)`
  - Both recursively inline `q-import` blocks.
  - Detect circular imports and enforce max import count.
  - When `parseQHtmlToQDom(..., { resolveImportsBeforeParse: false })` is used, `q-import` paths are preserved as metadata (`doc.meta.imports`) rather than inlined into the parsed host QDOM.

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
- Throws `QHtmlKeywordAliasError` with `.index` for invalid alias declarations/usages (self-reference or alias-to-alias).
- Import/macro stages throw descriptive `Error` messages for recursion/limits/unbalanced blocks.
- `q-style-class` is block-only inside `q-style` (`q-style-class { ... }`).
- `q-repeater` warns and falls back to a single iteration when `model { ... }` contains non-iterative blocks such as `html { ... }` or `text { ... }`.

## Binding semantics
- Preprocess `q-script` evaluation intentionally skips assignment context (`name: q-script { ... }`) so assignment scripts can be preserved as runtime bindings.
- `q-bind` assignment expressions are never source-preprocessed; they are emitted as binding metadata for runtime evaluation.

## Cross-module usage
- Requires `qdom-core` for node creation and type constants.
- Consumed by `qhtml-runtime` for mount-time parsing and source export workflows.
