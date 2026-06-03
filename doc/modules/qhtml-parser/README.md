# qhtml-parser v6.0.4

`qhtml-parser` is the language layer for QHTML v6. It parses QHTML source into QDom, applies macro/script preprocessing, resolves imports, and serializes QDom back to source.

## What's New in v6.0.5

- Added repeater syntax with runtime rendering from QDom:
  - `q-repeater ... { model { ... } slot { item } ... }`
  - `q-foreach` is supported as an equivalent keyword.
- Added iterable model containers for repeater flows:
  - `q-array` (named and anonymous) with literal and reference-concatenation forms.
  - `q-object` (named and anonymous) as reusable QHTML object blocks.
- Added `QDomModel` (`kind: "model"`) as the canonical container for `model { ... }` in repeater nodes.
- Added warning + fallback behavior for invalid non-iterative repeater model containers (for example `html { ... }` or `text { ... }`).

## What's New in v6.0.4

- Added `q-style-class` support inside `q-style`:
  - `q-style card { q-style-class { w3-card w3-round-large } backgroundColor: #eef4ff }`
  - Class tokens are stored as part of the style definition and merged onto target elements when applied.
  - Inline style declarations still apply normally (inline declarations override class-provided CSS on conflicts).
- Added scoped keyword aliasing with `q-keyword name { replacement-head }`.
- Added direct-only alias enforcement (`alias -> alias` is a parse error).
- Added per-node alias metadata handoff via `node.keywords` in parsed QDom.
- Removed legacy color-area syntax documentation in favor of `q-style` / `q-theme`.

## What's New in v6.0.3

- Expanded support for modern component declarations (`q-property`, function-style `q-signal` declarations).
- Improved binding metadata handoff for runtime `q-bind` / assignment `q-script`.
- Better compatibility with mixed inline HTML/text authoring patterns used in live editors.

## What this module actually does

- Parses QHTML into an AST and then into typed QDom nodes.
- Supports component/template/signal definitions (`q-component`, `q-template`, `q-signal`) and converts element invocations into `component-instance` / `template-instance` nodes when definitions are known.
- Supports `q-property { ... }` declarations inside `q-component` definitions and maps matching invocation assignments into component instance `props` instead of HTML attributes.
- Supports scoped keyword remapping with `q-keyword`:
  - `q-keyword component { q-component }`
  - scope is lexical (current block + descendants)
  - child scopes may override parent aliases
- Supports binding expressions in assignments: `name: q-bind { ... }` and `name: q-script { ... }` (assignment form), persisted as QDom binding metadata for runtime re-evaluation.
- Parses top-level lifecycle blocks (`onReady`, `onLoad`, `onLoaded`) and stores them in document metadata.
- Supports component-level `q-wasm { ... }` declarations and stores normalized config in `component.wasmConfig`.
- Parses `on<Event>` inline event blocks into script-bearing element attributes.
- Resolves recursive `q-import { ... }` chains (sync or async), including circular import protection and max-depth guards.
- Supports `q-rewrite` macro-like expansion before parse.
- Supports q-script evaluation passes for source preprocessing.
- Emits `q-repeater`/`q-foreach` as first-class QDom nodes with:
  - `node.model` (`QDomModel`) for model entries
  - `node.templateNodes` for repeat body content
- Serializes QDom back to QHTML, preserving original source when model is clean.

## Parsing model

1. Optional import resolution (`resolveQImportsSync/Async`).
2. `q-rewrite` expansion passes.
3. q-script evaluation passes.
4. AST parse.
5. AST → QDom conversion.
6. Definition-aware normalization (component/template invocation shaping, slots).

## Language constructs handled here

- Structural blocks: selectors `{ ... }`
- Attribute assignment: `name: "value"`
- Binding assignment: `name: q-bind { return ... }` and `name: q-script { return ... }`
- Text blocks: `text { ... }`, `innertext { ... }`, and aliases
- Raw HTML blocks: `html { ... }`
- Style blocks mapped into `<style>` nodes
- Function blocks inside component/template definitions
- Lifecycle hook blocks (document and component/element scope)
- Slot declarations and slot fills
- Signal declarations and invocations (`q-signal name { slot { ... } }` and `name { slotName { ... } }`)
- Component-local signal method declarations:
  - `q-signal mySignal(param1, param2)` inside `q-component`
  - parsed into component metadata (`component.signalDeclarations`)
- Component alias declarations:
  - `q-alias aliasName { return ... }` inside `q-component`
  - parsed into component metadata (`component.aliasDeclarations`)
- Component wasm declarations:
  - `q-wasm { src: "..."; exports { ... }; bind { export -> method foo } }`
  - parsed into component metadata (`component.wasmConfig`)
- q-import blocks
- q-rewrite definitions + invocations
- q-keyword declarations and alias invocation expansion
- repeater and iterable-model constructs:
  - `q-repeater` / `q-foreach`
  - `q-array`
  - `q-object`
- q-style declarations and application:
  - `q-style name { q-style-class { classA classB } prop: value }`
  - class imports and CSS declarations travel together in style definitions
  - `q-theme` rules can apply styles that include class imports + inline declarations

`q-script` in this module is mixed-mode:
- Standalone structural `q-script { ... }` is source-time expansion support.
- Assignment form (`name: q-script { ... }`) is preserved as runtime binding metadata (same lifecycle as `q-bind`).

## Usage example

```qhtml
div.notice {
  text { Hello }
  onClick {
    this.classList.add("clicked");
  }
}
```

**HTML output**

```html
<div class="notice">Hello</div>
```

Scoped keyword alias example:

```qhtml
q-keyword component { q-component }

component app-card {
  div { text { Hi } }
}
```

## Serializer behavior

- Uses original source when `meta.dirty` is false and `preserveOriginal` is enabled.
- Emits explicit QDom shapes when dirty (including slots, invocation nodes, lifecycle scripts).
- Preserves definition kind: template stays `q-template`, component stays `q-component`, signal stays `q-signal`.
- Persists parsed style/theme dictionaries for runtime reuse.
