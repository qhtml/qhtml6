# qhtml-runtime

`qhtml-runtime` is the browser orchestration layer. It mounts `<q-html>` blocks, keeps QDom observed, applies incremental updates, wires inline event handlers, and exposes the `.qdom()` developer API.

## What this module actually does

- Auto-discovers and mounts `<q-html>` elements on load (and optionally as they are inserted later).
- Loads QDom from persisted sibling template when available, otherwise parses inline source.
- Resolves `q-import` asynchronously before parse during mount.
- Observes QDom mutations and applies:
  - in-place DOM patches for non-structural changes
  - full render replacement for structural changes
- Persists updated QDom back into mapped `<template data-qdom="1">` storage.
- Wires inline `on<Event>` handlers to rendered DOM nodes.
- Registers valid `q-component` definitions as custom elements.
- Hydrates component host elements and maintains component/slot context accessors in rendered DOM.
- Re-evaluates assignment bindings (`q-bind` and assignment-form `q-script`) before render and when `update()` is called on a mounted `<q-html>` host.
- Guards `update()` against binding-driven re-entry loops with per-tick cycle/re-entry limits, aborting noisy recursive updates with a console error instead of spinning forever.

## `.qdom()` model in runtime

- `qHtmlElement.qdom()` returns proxied document facade with node factories and query helpers.
- `qHtmlElement.update()` re-evaluates bindings and re-renders from current QDom.
- `componentHost.update()` re-evaluates bindings and re-renders only that component instance subtree.
- Each mapped rendered element receives `.qdom()` that returns the associated source QDom node.
- Convenience aliases:
  - `element.qhtmlRoot()` returns the owning `<q-html>` host.
  - `element.root()` returns the owning `<q-html>` host.
  - `element.component` points to nearest component instance host.
  - `element.slot` exposes slot context where applicable.

## QDom facade capabilities

The installed node facade includes:

- Creation helpers:
  - `createQElement(...)`
  - `createQText(...)`
  - `createQRawHtml(...)`
  - `createQSlot(...)`
  - `createQComponentInstance(...)`
  - `createQTemplateInstance(...)`
- Query helpers:
  - `find(selector)`
  - `findAll(selector)`
  - `root(options?)` returns owning `<q-html>` host; pass `{ qdom: true }` (or `"qdom"`) to return document QDom root facade.
  - `findSlotFor(target)`
  - `slots()`
- Child access:
  - `children()` returns `QDomNodeList`
  - proxy-style child operations via `children.push/unshift/splice`, index access, `length`
- Rewrite helper:
  - `rewrite(parameterBindings?, callback)` rewrites the current calling node from callback output.
  - Default callback bindings are `{ this: currentNodeFacade }`.
  - Callback return value is converted to string and applied through `replaceWithQHTML(...)`.

## Binding model (`q-bind` / assignment `q-script`)

- Parser emits binding entries into `node.meta.qBindings`.
- Runtime executes each binding script with `this` bound to the source QDom node.
- Binding target behavior:
  - `targetCollection: "attributes"` sets/removes DOM-facing attributes
  - `targetCollection: "props"` sets component host properties
  - `targetCollection: "textContent"` updates node text content
- Trigger full re-evaluation with `this.closest("q-html").update()` (or `QHtml.updateQHtmlElement(host)`).
- Trigger component-local re-evaluation with `this.component.update()`; `this.component.root().update()` remains equivalent to full host update.

`QDomNodeList` supports `at`, `toArray`, `forEach`, `map`, `qhtml`, `htmldom`, and `html`.

### `rewrite(...)` example

```js
const host = document.querySelector("q-html");
const root = host.qdom();

root.find("#demo-tabs").rewrite({ label: "Details (Updated)" }, function (bindings) {
  return 'q-tabs { id: "demo-tabs" q-tab { name { text { ' + String(bindings.label) + ' } } } }';
});
```

## Usage example

```qhtml
<q-html>
button.cta {
  text { Save }
  onClick {
    const root = this.qhtmlRoot();
    root.setAttribute("data-last-click", "save");
  }
}
</q-html>
```

**Rendered HTML (before click):**

```html
<button class="cta">Save</button>
```
