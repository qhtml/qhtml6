# MODULE API

## Purpose
`qhtml-runtime` is the browser integration layer that mounts `<q-html>` content, maintains observed QDom state, and keeps rendered DOM and serialized template data synchronized.

## Boundaries
- Owns DOM scanning/mount lifecycle for `<q-html>` blocks.
- Owns QDom observation, selective DOM patching, and structural re-render behavior.
- Owns q-script listener lifecycle for parsed script rules.
- Does not implement parser grammar or low-level DOM renderer internals.

## Public Definitions
- `mountQHtmlElement(qHtmlElement, options?)`
  - Parses or loads QDom for one `<q-html>`, attaches observer, renders DOM, and persists template payload.
  - Resolves `q-import` chains recursively with `fetch()` before parsing/rendering.
  - Returns a binding object immediately and exposes `binding.ready` (Promise) for async import completion.
- `unmountQHtmlElement(qHtmlElement)`
  - Removes script listeners and disconnects observer binding.
- `getQDomForElement(qHtmlElement)`
  - Returns observed QDom proxy for direct mutation.
- `toQHtmlSource(qHtmlElement, options?)`
  - Serializes current QDom back to QHTML source.
- QDom node helper surface (returned by `element.qdom()` / `qhtml.qdom()`)
  - `children()` returns a `QDomNodeList` for direct children of the current QDom node.
  - `QDomNodeList.qhtml()` serializes the sibling list to QHTML.
  - `QDomNodeList.html()` serializes the sibling list to HTML string.
  - `QDomNodeList.htmldom()` renders the sibling list to a `DocumentFragment`.
- `hydrateComponentElement(hostElement)`
  - Hydrates an existing custom-element host (`<my-component>`) from registered q-component definitions.
- `initAll(root?, options?)`
  - Mounts all `<q-html>` descendants in scope.
- `startAutoMountObserver(root?, options?)`
  - Starts document/subtree observation and auto-mounts `<q-html>` nodes as soon as they are added.
- `stopAutoMountObserver()`
  - Stops dynamic insertion observation.

## Side Effects and External Dependencies
- Automatically initializes on DOMContentLoaded (or immediately when document is already ready).
- Uses `new Function(...)` to execute q-script bodies.
- Uses `new Function(...)` to execute top-level lifecycle hooks (`onReady`/`onLoad`/`onLoaded`) once per mounted `<q-html>` host.
- Uses `fetch()` for recursive `q-import` source loading prior to parse/render.
- For non-structural QDom changes (for example attribute/value/text updates), patches affected DOM nodes in place and rewrites the sibling serialized `<template data-qdom="1">` without full host rebuild.
- For structural QDom changes (for example child/template tree changes), performs a host re-render and rewrites the sibling serialized `<template data-qdom="1">`.
- Synchronizes form control `input/change` events (`input`, `textarea`, `select`) back into QDom so user edits are preserved in the data model without forcing full host re-render.
- Uses `MutationObserver` for dynamic `<q-html>` discovery when available; falls back to periodic auto-scan when unavailable.
- Registers `q-component` definitions as Custom Elements (`customElements.define`) when the name is valid and platform APIs are available.

## Cross-Module Imports/Exports
- Imports `qdom-core`, `qhtml-parser`, and `dom-renderer` from `globalThis.QHtmlModules`.
- Exports runtime API on both `globalThis.QHtmlModules.qhtmlRuntime` and `globalThis.QHtml`.

## Backward Compatibility Notes
- Initial runtime supports one adjacent `<q-script>` companion (next sibling) per `<q-html>` block.
- Runtime auto-discovers dynamically inserted `<q-html>` nodes via `MutationObserver`.
