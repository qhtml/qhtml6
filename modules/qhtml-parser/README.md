# qhtml-parser

`qhtml-parser` is the language layer for QHTML v6. It parses QHTML source into QDom, applies macro/script preprocessing, resolves imports, and serializes QDom back to source.

## What this module actually does

- Parses QHTML into an AST and then into typed QDom nodes.
- Supports component/template/signal definitions (`q-component`, `q-template`, `q-signal`) and converts element invocations into `component-instance` / `template-instance` nodes when definitions are known.
- Supports `q-property { ... }` declarations inside `q-component` definitions and maps matching invocation assignments into component instance `props` instead of HTML attributes.
- Supports binding expressions in assignments: `name: q-bind { ... }` and `name: q-script { ... }` (assignment form), persisted as QDom binding metadata for runtime re-evaluation.
- Parses top-level lifecycle blocks (`onReady`, `onLoad`, `onLoaded`) and stores them in document metadata.
- Parses `on<Event>` inline event blocks into script-bearing element attributes.
- Resolves recursive `q-import { ... }` chains (sync or async), including circular import protection and max-depth guards.
- Supports `q-rewrite` macro-like expansion before parse.
- Supports q-script evaluation passes for source preprocessing.
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
- q-import blocks
- q-rewrite definitions + invocations

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

## Serializer behavior

- Uses original source when `meta.dirty` is false and `preserveOriginal` is enabled.
- Emits explicit QDom shapes when dirty (including slots, invocation nodes, lifecycle scripts).
- Preserves definition kind: template stays `q-template`, component stays `q-component`, signal stays `q-signal`.
