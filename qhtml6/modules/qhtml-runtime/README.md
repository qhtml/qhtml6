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

## `.qdom()` model in runtime

- `qHtmlElement.qdom()` returns proxied document facade with node factories and query helpers.
- Each mapped rendered element receives `.qdom()` that returns the associated source QDom node.
- Convenience aliases:
  - `element.qhtmlRoot()` returns the owning `<q-html>` host.
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
  - `findSlotFor(target)`
  - `slots()`
- Child access:
  - `children()` returns `QDomNodeList`
  - proxy-style child operations via `children.push/unshift/splice`, index access, `length`

`QDomNodeList` supports `at`, `toArray`, `forEach`, `map`, `qhtml`, `htmldom`, and `html`.

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
