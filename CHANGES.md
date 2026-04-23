# QHTML.js Change Log

## Whats New in v6.4.1

- Refined `q-painter` context assignment behavior so painter scripts update actual paint context properties (for example `this.fillStyle`).
- Updated border/mask painter slot mapping defaults for clearer cross-browser output.
- Added a stronger visual `q-painter` triptych demo (`background`, `border`, `mask`) in `dist/demo.html`.

## Whats New in v6.3.2

- Added a unified single-entity demo in `dist/demo.html` that integrates sidebar, tabs, modal, popup-menu, toolbar, estore, spritesheet, form, grid, list-view, and tree-view with typed named-instance wiring.
- Added/validated parameterized lifecycle handler support in runtime paths for `on<signal>(...)` and `on<property>changed(...)` callback parameter binding.

## Whats New in v6.3.1

- Added declared `q-property` raw-value getter behavior so direct property reads resolve to assigned JS values consistently.
- Added model-like mutation bridging for declared properties (`QArray`/`QMap`/`QModel`) so internal mutations propagate through `<property>Changed` reactivity without reassignment.
- Kept runtime internal listener wiring private while preserving existing change-event semantics and deterministic queue behavior.

## Whats New in v6.3.0

- Added/validated typed named-instance usage in demos and examples (`<type> <name> { }`) so component references can be direct (for example `demoestore.products = ...`) without selector boilerplate.
- Clarified and documented named-instance scope/context behavior for declarative references.
- Tightened `q-import` runtime handling so import resolution is treated as a hard barrier before parse/mount continuation.
- Added declarative signal wiring syntax: `q-connect { sender.signal target.handler }` (also supports `->` form).
- Added `q-spritesheet [alpha]` (currently in-progress and not fully stable yet).
- Added component owner-type alias resolution inside component definition subtrees (for example descendant code can read `mycomp1.myprop`).
- Added owner-chain walking for repeated type-name segments (for example `mycomp1.mycomp1.myprop` walks upward to enclosing owners of the same type).
- Added component-definition collision guards for component-name alias conflicts (`q-property <componentName>`, child alias `<...> <componentName>`): warns and resolves blank in that local scope.

## Whats New in v6.1.9

- Added `q-callback` declarations for lazy, pass-by-reference callback flow in QHTML and component scope.
- Added typed named component instances (`mycomp myinstance { ... }`) with lexical alias scope and direct reference support.
- Added runtime callback helpers `QCallback(...)` and `qhtml(...)` for cross-component callback invocation and QHTML-fragment returns.
- Added `QArray(...)` constructor and expanded `QModel` assignment behavior for JS-to-QHTML typed model property assignment.
- Improved `for (alias in source)` runtime source resolution (component-scoped paths/method chains) and iterable coercion.
- Improved queued runtime/event-loop behavior:
  - signal routing uses UUID-targeted subscriber delivery
  - timer enqueue dedupe (`pending` guard) reduces timeout queue spam
  - queue turn order now prioritizes existing queued work before adding due timers

## Whats New in v6.1.8

- Added initial `q-canvas` keyword support (`q-canvas <name> { ... }`) for named canvas declarations.
- Added named canvas handle export so canvas instances are available by name on host/global scope.
- Added `myCanvas.context` helper for direct/manual canvas API drawing (`2d` context access).
- Added/updated `dist/test.html` q-canvas animation coverage (including transparent drawing and start/stop controls).
- Updated docs with `q-canvas` usage patterns.

## Whats New in v6.1.7

- Added `for (alias in source) { ... }` keyword-level iteration syntax.
- Added runtime support for `for` source evaluation through inline expression scope (including component-scoped references like `this.component.items`).
- Added `dist/test.html` coverage for multiple `for` use cases (array, object/map-style keys, function-returned arrays, primitive source).
- Updated docs with `for` syntax and accepted source patterns.

## Whats New in v6.1.6

- Added declarative `q-logger { ... }` support with scoped categories for runtime debugging (`q-property`, `q-signal`, `q-component`, `function`, `slot`, `model`, `instantiation`, `all`).
- Added and expanded `dist/test.html` coverage for logger categories and multi-scope logger behavior.
- Improved `qdom().qmap(...)` keyword extraction for component metadata (including `q-property` declarations) and instance mapping behavior.
- Stabilized parser/runtime updates around `q-model`, `q-model-view`, and signal/property change flows; current non-deprecated tests pass.

## Whats New in v6.1.5

- Fixed signal callback host binding so `.connect(function(){ ... })` now runs against the live component instance (`this`) during dispatch.
- Fixed `on<signal>` attribute handling in component definitions to resolve case-insensitively and route through the same signal `.connect(...)` path (with DOM-event fallback for non-signal events).
- Improved `on<Property>changed` normalization so lowercase/mixed-case handlers (for example `onmypropchanged`) map correctly to `mypropChanged`.
- Improved queued-mode declarative signal subscription timing by deferring registration until component UUID availability, and preserving cleanup metadata for detach/replace.
- Updated `dist/test.html` test 49 to use a lower-overhead `q-model-view` randomization scenario with explicit `Start timers` control.
- Marked unstable test 39 as deprecated; active test board reports all current non-deprecated tests passing.

## Whats New in v6.1.4

- Deprecated `q-bind`; assignment usage is now treated as an alias of `q-script`.
- Declared `q-property` setter changes no longer auto-trigger component/host invalidate-update cycles; refresh/update is explicit.
- `q-property` now emits per-property signals on value change: `on<Property>Changed` (for example `onCountChanged`).
- Property-changed signal payload is value-first (`event.detail.params.value` / `event.detail.args[0]`) and does not emit when the assigned value is unchanged.
- Generic `q-property-changed` event wiring is replaced by per-property signal dispatch.
- Runtime event loop mode now defaults to `queued`; set `window.QHTML_EVENT_LOOP_MODE = "compat"` before `qhtml.js` to opt out.
- Updated runtime/parser/docs to reflect canonical assignment binding semantics around `q-script`.
- Refreshed `dist/test.html` into a simplified board that runs first-pass checks on `QHTMLContentLoaded` and re-checks every 5 seconds.
- Kept binding-deprecated test numbers in place with explicit `test has been deprecated` markers.
- Added `q-timer <name> { ... }` as a top-level language construct (native runtime timer declaration) instead of component-based timer usage.

## Whats New in v6.1.3

- Added typed `q-array` and `q-map` property values, including nested anonymous container declarations on the right-hand side of property assignments.
- Named `q-array ... { }` and `q-map ... { }` declarations still work and can be assigned to component properties by name.
- Added `property <name>: <value>` shorthand inside `q-component`, while preserving `property <name> { ... }` as child-node binding syntax.
- Added `q-model` normalized model API support for `q-array`, `q-map`, and script-backed sources.
- Added `q-model-view` delegate rendering (`q-model { ... }` + `as { item }`) for model-driven UI blocks.
- Updated `q-tree-view` to use the model pipeline and native `details/summary` structure.

## Whats New in v6.1.0

- Added `q-component ... extends ...` inheritance support.
- Added multiple inheritance support with ordered merge behavior: `q-component child extends baseA extends baseB { ... }`.
- Extended components now inherit properties, methods, signals, aliases, lifecycle hooks, slots, and template children from all parent components.

## Whats New in v6.0.9

- Fixed q-editor QDom tab lag for large 40+ KB fragments by removing heavy JSON formatting from the display path and using lightweight raw output handling.
- Fixed qdom() updateing bug causing component instances to not have their own property scoping -- now each instance contains a unique property set which is accessible directly from any instance inheriting q-component definitions.
- `HTMLElement.prototype.qdom()` now resolves from the closest `q-component` context first (when available), then falls back to the nearest `<q-html>` host context.
- Added component-instance QDOM property helpers:
  - `componentInstanceQDom.properties()`
  - `componentInstanceQDom.getProperty(key)`
  - `componentInstanceQDom.property(key)`
  - `componentInstanceQDom.property(key, value)`


## Whats New in v6.0.8

- Aligned README examples with validated `dist/test.html` syntax patterns.
- Expanded `dist/test.html` coverage for QDOM operations and runtime update paths.
- Removed remaining legacy color-system documentation references in favor of `q-style` / `q-theme`.
- Added scoped selector shortcut `$("<css selector>")` for runtime script contexts (`onclick`, `onReady`, `q-bind`, `q-script`, component methods/aliases/properties).

## Whats New in v6.0.7.4

- Added `q-style`, `q-style-class`, and `q-theme` support for merging and building complex stylesheets with advanced theming capabilities (see section on Styles and Themes).
- Added `q-default-theme` for fallback theme layers. `q-default-theme` rules apply first, and conflicting `q-theme` rules override them.
- `q-style`, `q-style-class`, and `q-theme` are actively evolving and may change in future releases.
- Added component-level `q-wasm` for loading `.wasm` modules with method/signal bindings and worker-first execution.

## Whats New in v6.0.6

- Added `q-style-class` inside `q-style` for class + inline style composition.
- Added richer `q-theme` workflows:
  - selector-based style mapping
  - theme composition (`q-theme my-theme { base-theme { } ... }`)
  - scoped theme invocation on element trees
- Refactored component examples and q-components to favor `q-style` / `q-theme`.
- Updated `q-builder` style editing flow to focus on `q-style` and `q-theme` blocks.

## Whats New in v6.0.5

- Added `q-macro` compile-time inline expansion:
  - `q-macro my-macro { slot { in1 } return { div,span,${in1} { hello world } } }`
  - `my-macro { in1 { h3 } }` creates `<div><span><h3>hello world </h3></span></div>`
  - Invocations expand before parse (similar timing to `q-script` replacement, but macro output is plain qhtml expansion instead of javascript).
- Added scoped `${reference}` placeholders:
  - `${slotName}` resolves from current macro slot scope.
  - Intended for macro/rewrite scoped slot references.
- Added lazy `${expression}` inline runtime interpolation in rendered string contexts (text/attributes).
- Parser metadata now includes macro expansion info in `qdom.meta.qMacros` and `qdom.meta.macroExpandedSource`.
- Expanded styling syntax:
  - reusable `q-style` definitions
  - selector-driven `q-theme` style assignment
  - scoped theme application to subtrees

## Whats New in v6.0.4

- `q-keyword` scoped keyword aliasing: `q-keyword component { q-component }`.
- Alias scope is lexical (parent block + descendants), with child-scope override support.
- Alias mappings are stored on parsed QDOM nodes as `node.keywords`.
- Direct-only alias rules: aliases cannot point to other aliases.
- `tag#id.class` selector shorthand support finalized for elements and component instances.

## Whats New in v6.0.3

- `q-bind` evaluates with a DOM-capable runtime `this` (`closest`, `querySelector`, etc).
- `q-bind` evaluation is wrapped in runtime `try/catch` (binding failures log, page continues).
- Host `onReady` dispatch runs through the runtime callback queue (more reliable “ready” timing).
- Inline source ingestion preserves literal HTML children in `<q-html>` and `<q-editor>` source.
- Runtime logs are gated behind `window.QHTML_RUNTIME_DEBUG` (or `window.QHTML_DEBUG`).
- `q-property` for explicit component properties.
- Function-style component signals: `q-signal mySignal(a, b)` plus `.connect/.disconnect/.emit`.
- Component aliases: `q-alias name { return ... }` for computed host properties.
- `.qdom().deserialize(serialized, shouldReplaceQDom)` append-or-replace import flow.
- Scoped updates: `this.component.update()` and full host updates: `this.component.root().update()`.

## Whats New in v6.2.1

- Added `q-worker` as a first-class QHTML language construct inside `q-component` for background method execution.
- Added worker method proxy behavior so `worker.method()` returns a Promise and resolves back to component scope.
- Added worker-signal interoperability so worker methods can emit declared `q-signal` payloads that route back through normal signal handlers.
- Added direct reference-path property defaults for declared component properties (for example `q-property prop2: mycomp1.prop1`).
- Improved property reference consistency so direct JS reads (`mycomp2.prop2`) and inline interpolation (`${mycomp2.prop2}`) resolve the same bound value.

Language examples added this round:

```qhtml
q-component my-worker-host {
  q-worker myworker {
    q-property myprops: q-array { "A", "B", "C" }
    function dowork() {
      var rv = [];
      for (var i = 0; i < 3; i += 1) {
        rv.push(this.myprops[i]);
      }
      return rv.join(",");
    }
  }

  q-property result: "waiting"
  onReady {
    this.component.myworker.dowork().then(function(out) {
      this.component.result = out;
    }.bind(this));
  }
}
```

```qhtml
q-component comp1 { q-property prop1: "something" }
comp1 mycomp1 { prop1: "testing 1 2 3" }

q-component comp2 extends comp1 {
  q-property prop2: mycomp1.prop1
}
comp2 mycomp2 { prop1: "testing" }
```
