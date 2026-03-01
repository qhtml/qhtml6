# dom-renderer

`dom-renderer` converts QDom into real browser DOM nodes. It is the rendering engine for both full `<q-html>` mounts and standalone component hydration.

## What this module actually does

- Scans a QDom document and builds a component/template registry.
- Renders non-definition top-level nodes into a `DocumentFragment`.
- Expands `component-instance` and `template-instance` nodes against their definitions.
- Resolves and projects slot content (including forwarding through nested definitions).
- Preserves association between rendered DOM nodes and source QDom nodes for runtime patching.
- Executes lifecycle hooks after render:
  - element-level hooks
  - component-level hook scripts/methods
- Emits a content-loaded signal (`QHTMLContentLoaded`) with sequencing metadata.

## Rendering behaviors

- `q-component` invocation renders as host custom element wrapper.
- `q-template` invocation expands inline (no wrapper).
- `q-signal` invocation dispatches events and renders no host DOM.
- Component instance `attributes` are applied via `setAttribute(...)`; component instance `props` are applied as direct host-element property assignments.
- `text` nodes create text nodes; `raw-html` nodes inject parsed HTML fragments.
- Literal `<slot>` tags are consumed as projection boundaries and removed from final DOM output.
- Self-referential component recursion is detected and blocked.
- Signal invocations emit:
  - `q-signal`
  - a named event matching the signal id

## Runtime integration points

- Produces maps used by runtime (`nodeMap`, `slotMap`, component ownership, instance IDs).
- Supports form control state synchronization hooks through stable QDom ↔ DOM mapping.

## Usage example

```js
const doc = QHtmlModules.qdomCore.createDocument();
doc.nodes.push(QHtmlModules.qdomCore.createElementNode({ tagName: "p", textContent: "Rendered" }));
QHtmlModules.domRenderer.renderIntoElement(doc, hostElement);
```

**HTML output in `hostElement`**

```html
<p>Rendered</p>
```
