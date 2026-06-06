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
    - typed named instance invocation syntax:
      - `my-component myInstance { ... }`
      - parsed as component invocation with instance alias metadata (`meta.__qhtmlInstanceAlias`)
      - valid for known instantiable definitions in the current parse registry (`q-component`, `q-template`, `q-signal`, `q-worker`, `q-struct`)
      - keyword-backed typed canvas invocation is also supported:
        - `q-canvas myCanvas { ... }`
        - normalized into a concrete `canvas` element node with `q-canvas="1"` and `q-canvas-name="myCanvas"`
        - avoids unknown-instantiable normalization errors while preserving named-canvas runtime export semantics
      - unknown typed targets with an instance alias throw a parse-time normalization error
    - q-struct data definitions:
      - `q-struct Name { field { defaultValue } ... }` emits QDom `kind: "struct"` with `structId` and field descriptors
      - `Name instanceName { field { overrideValue } ... }` emits QDom `kind: "struct-instance"` with alias metadata and override fields
      - struct fields accept literal strings/numbers/booleans/null, bare dot-walk bindings, and function values (`field { function() { ... } }`)
      - q-struct definitions and instances are data-only; they do not parse slots, signals, lifecycle hooks, or component runtime methods
    - named state-machine syntax:
      - `q-state-machine machineName { stateName { ... } }`
      - emitted as a `component-instance` for component id `q-state-machine` with `q-state-machine="1"`, `q-state-machine-name`, and `meta.__qhtmlInstanceAlias`
      - an inline `component` definition is stored at `node.meta.__qhtmlStateMachineComponent`
      - the inline component always declares `q-property state` and `q-signal statechanged(value, previousValue, passing)`
      - `q-property`, `q-signal`, `function`, lifecycle, callback, alias, timer, and other runtime-capable component declarations inside the state-machine body are parsed into that inline component definition
      - state bodies are stored in `node.meta.__qhtmlStateMachine.states[]` and `node.meta.__qhtmlStateMachineComponent.meta.__qhtmlStateMachine.states[]` as reusable QDom node lists, not as direct child output
      - optional `state: "stateName"` inside the machine body sets the initial active state; otherwise the first declared state is active
      - typed component instances inside state bodies are normalized against the available definition registry
    - declared properties can be authored with either:
      - `q-property name: value`
      - `property name: value` (shorthand alias)
    - `property: value` is treated as a normal assignment key (`property`) unless an identifier follows `property` (legacy `property name: ...` form)
    - `meta.qBindings` entries for assignment expressions (canonical `q-script`; `q-bind` parses as alias)
    - definition kind preservation for `q-component`, `q-template`, and `q-signal`
    - top-level SDML declarations:
      - `sdml-endpoint endpointName { url { /api/path } }`
      - emitted as `doc.meta.sdmlEndpoints = [{ endpointId, url }]`
      - `q-sdml-component alias { /api/path }`
      - `q-sdml-component alias { endpointName }` (endpoint reference)
      - emitted as `doc.meta.sdmlComponents = [{ componentId, path }]`
    - scoped keyword alias parsing via `q-keyword name { replacement-head }`
    - per-node alias metadata as `node.keywords`
    - signal declaration + invocation parsing:
      - `q-signal name { slot { slot1 } ... }`
      - `name { slot1 { ... } ... }`
    - component-local signal method declarations:
      - `q-signal name(param1, param2)` inside `q-component`
      - emitted in QDom as `component.signalDeclarations`
      - declaration entries now carry stable identity metadata (`entry.uuid` and `entry.meta.uuid`)
    - lifecycle blocks:
      - `onReady { ... }`, `onLoad { ... }`, and `onLoaded { ... }` are preserved as lifecycle scripts when authored at top level, inside normal element blocks, or anywhere in runtime-capable `q-component`/`q-worker` bodies
      - lifecycle block order relative to rendered child nodes does not affect whether the hook is retained
    - declarative signal wiring:
      - `q-connect { sender.signal target.handler }`
      - `q-connect { sender.signal -> target.handler }`
      - parsed in top-level, element blocks, and runtime-capable component/worker blocks
      - compiled into equivalent `onready` lifecycle connect scripts (declarative sugar over `signal.connect(handler)`)
      - sender/target expressions are kept as runtime-evaluated expressions, so named aliases and `document.querySelector(...)` expressions are both supported
    - declarative CSS binding:
      - `q-bind-css { this.component.width #target.style.width }`
      - `q-bind-css { this.component.width myTarget().style.width }` where `myTarget` is an in-scope callable runtime handle such as `q-var` or a component method
      - parsed only inside runtime-capable `q-component` definitions as `component.meta.__qhtmlCssBindings[]`
      - stores `sourceExpression`, `targetExpression`, original source, and source range metadata for renderer installation
      - normal element bodies reject `q-bind-css` because it binds declared component q-properties
    - callback declarations:
      - top-level `q-callback name(param1, ...) { ... }` emitted as QDom `kind: "callback"` nodes
      - component-local `q-callback name(param1, ...) { ... }` emitted in `component.callbackDeclarations`
    - q-var declarations:
      - top-level `q-var name { expressionOrBody }` emitted as QDom `kind: "q-var"` nodes
      - component-local `q-var name { expressionOrBody }` emitted in `component.varDeclarations`
      - bodies are preserved as JavaScript source text for one-time scoped runtime initialization
    - q-switch declarations:
      - top-level `q-switch name { key: { expression } *: defaultExpression }` emitted as QDom `kind: "q-switch"` nodes
      - component-local `q-switch` declarations emitted in `component.switchDeclarations`
      - case bodies are preserved as JavaScript source text for runtime on-demand evaluation
    - q-perf directives:
      - `q-perf { q-timer q-signal q-property q-worker function }` is direct-child metadata only and does not render a DOM node
      - normal element children store flags in `node.meta.__qhtmlPerfFlags`
      - component/worker definition children store flags in `component.meta.__qhtmlPerfFlags`
      - top-level children store flags in `document.meta.__qhtmlPerfFlags`
      - flags are not inherited by descendants; each measured node needs its own direct `q-perf` child
    - q-anchor directives:
      - `q-anchor { ... }` is direct-child metadata only and does not render a DOM node
      - normal element children store rules in `node.meta.__qhtmlAnchorRules`
      - component/worker definition children store rules in `component.meta.__qhtmlAnchorRules`
      - supported keys: `left`, `right`, `top`, `bottom`, `hcenter`, `vcenter`, `center`
      - value syntaxes: `key: value` and `key { value }`
      - separators supported in the block: newline, `;`, `,`
    - layout keywords:
      - `q-layout`, `q-row`, and `q-col` parse as framework layout element nodes, not component invocations
      - layout nodes store `meta.__qhtmlLayoutKeyword = true` and `meta.__qhtmlLayoutRole`
      - matching component definitions named `q-layout`, `q-row`, or `q-col` do not override these keyword nodes during definition normalization
      - layout keyword nodes keep normal child QDom content so slots, nested layouts, and named component references remain available to renderer/runtime context handling
      - component slot discovery walks through layout keyword descendants; named slot shorthand in an invocation is recognized before single-slot fallback, so `q-layout { q-row { q-col { slot { name } } } }` accepts `component { name { ... } }`
    - q-timer declarations:
      - top-level `q-timer name { ... }` emitted in `document.meta.qTimers`
      - component-local `q-timer name { ... }` emitted in `component.qTimerDefinitions`
      - timers inside normal anonymous content are emitted as QDom `kind: "q-timer"` nodes so the renderer can register them in the inherited QContext
    - component property definition blocks (`q-property <name> { ... }`) emitted in `component.propertyDefinitions`
      - declaration entries now carry stable identity metadata (`entry.uuid` and `entry.meta.uuid`)
    - component alias declarations:
      - `q-alias aliasName { return ... }` inside `q-component`
      - emitted in QDom as `component.aliasDeclarations`
    - component wasm declarations:
      - `q-wasm { ... }` inside `q-component`
      - emitted in QDom as `component.wasmConfig`
    - style declarations and application:
      - `q-style name { q-style-class { classA classB } prop: value }`
      - `q-style-class` stores class tokens in the style definition
      - `q-theme name { selector { q-style { prop: value } named-style } }` supports anonymous q-style blocks inside selector rules; they are lowered to private generated q-style definitions in rule order
      - applying the style merges classes into `class` and declarations into `style`
    - repeater and iterable model support:
      - `q-repeater` and `q-foreach` blocks
      - `for (alias in source) { ... }` blocks lowered to repeater QDom (`keyword: "for"`) with:
        - inline alias from loop header (`alias`)
        - dynamic model source from loop header expression (`source`)
        - template body from loop block children
      - `q-model` definitions (named + anonymous) as reusable iterable model sources
      - `q-model-view` is the base model/delegate syntax and is lowered to repeater QDom (`keyword: "q-model-view"`) with:
        - model source from one or more anonymous `q-model { ... }` blocks
        - delegate alias from `as { itemName }`
      - `q-repeater` is parsed as an extension over the same `q-model-view` pipeline (compatible `model { ... }` + `slot { ... }` syntax)
      - model containers `q-array`, `q-object`, and `q-map`
      - `q-array` named-definition parsing now handles quoted strings and inline nested typed values (`q-map`/`q-array`) without token splitting loss
      - `q-model`/repeater model values also accept inline `q-script { return ... }` when statically resolvable
      - `q-script` inside `q-model` blocks is preserved for model parsing (not pre-evaluated as global q-script replacement text)
      - property assignments accept typed anonymous container values:
        - `propName: q-array { "a", 1, q-array { "b", 2 } }`
        - `propName: q-map { key: "v", nested: q-map { ok: true } }`
      - typed property values are emitted in QDom as native JavaScript arrays/objects
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
  - `q-sdml-component` declarations are always preserved as metadata (`doc.meta.sdmlComponents`) and not expanded during parse.

### Serialization APIs
- `qdomToQHtml(documentNode, options?)`
  - Converts QDom document to canonical QHTML source.
  - `preserveOriginal` defaults to true.
  - Serializes array/object assignment values using typed container syntax (`q-array { ... }` / `q-map { ... }`) instead of stringifying them.
  - Serializes dirty `q-state-machine` component-instance nodes back to named state-machine block syntax using stored state metadata.
  - Serializes `struct` and `struct-instance` QDom nodes back to `q-struct` and typed instance syntax.
- `parseQScript(source)`
  - Parses q-script rules of form `selector.on("event"): { ... }`.
- `serializeQScript(rules)`
  - Serializes script rules back to source.

## Error model
- Throws `QHtmlParseError` with `.index` for syntax errors.
- Throws `QHtmlKeywordAliasError` with `.index` for invalid alias declarations/usages (self-reference or alias-to-alias).
- Import/macro stages throw descriptive `Error` messages for recursion/limits/unbalanced blocks.
- `q-style-class` is block-only inside `q-style` (`q-style-class { ... }`).
- model warnings are emitted when non-iterative containers are mixed into model blocks; `q-model-view` keeps valid parsed entries while `q-repeater` retains fallback behavior for incompatible model content.

## Binding semantics
- Preprocess `q-script` evaluation intentionally skips assignment context (`name: q-script { ... }`) and `q-model { q-script { ... } }` context so model scripts are preserved for model parsing/runtime bindings.
- `q-bind` in assignment form is accepted for backward compatibility and normalized to `q-script` metadata/output.

## Cross-module usage
- Requires `qdom-core` for node creation and type constants.
- Consumed by `qhtml-runtime` for mount-time parsing and source export workflows.
