# MODULE API

## Purpose
`qdom-core` defines the canonical QDom data model and shared runtime primitives used by parser, renderer, and browser runtime modules.

## Boundaries
- Owns typed QDom object shapes.
- Owns deep observer/proxy support for reactive mutation notifications.
- Owns compressed serialization format for persistence into `<template>` tags.
- Does not parse QHTML text and does not render HTML DOM.

## Public Definitions
- `NODE_TYPES`
  - String constants for QDom node kinds:
    - `document`
    - `element`
    - `text`
    - `raw-html`
    - `component`
    - `component-instance`
    - `template-instance`
    - `slot`
    - `script-rule`
- `TEXT_ALIASES`
  - Set of special text attribute aliases: `content`, `contents`, `text`, `textcontents`, `innertext`.
- `createDocument(options)`
  - Creates a QDom document object: `{ kind, version, nodes, scripts, meta }`.
- `createElementNode(options)`
  - Creates an element QDom node with `tagName`, `attributes`, `children`, `textContent`, selector metadata, and node meta.
- `createTextNode(options)`
  - Creates a plain text QDom node with `value`.
- `createRawHtmlNode(options)`
  - Creates a raw inline-html QDom node with `html`.
- `createComponentNode(options)`
  - Creates a q-component/q-template definition node containing:
    - `componentId`
    - `definitionType` (`component` or `template`)
    - `templateNodes`
    - optional `methods` and `lifecycleScripts`
- `createComponentInstanceNode(options)`
  - Creates a component/template invocation node with:
    - `kind` (`component-instance` or `template-instance`)
    - `componentId`
    - host `tagName` and invocation `attributes`
    - `slots` (list of slot nodes)
    - fallback `children` and `textContent` for compatibility
- `createSlotNode(options)`
  - Creates a slot container node with:
    - `name`
    - `children` (QDom nodes projected into that slot)
- `createScriptRule(options)`
  - Creates a q-script rule node containing `selector`, `eventName`, and `body`.
- `isNode(value)`
  - Returns true when value matches QDom node shape.
- `walkQDom(documentNode, visitor)`
  - Walks all tree/script nodes with `(node, parent, path)` callback.
- `cloneDocument(documentNode)`
  - Deep clones an entire QDom document.
- `ensureStringArray(value)`
  - Normalizes to string array.
- `mergeClasses(existing, classNames)`
  - Merges class names into deduplicated class string.
- `observeQDom(documentNode, onChange)`
  - Returns `{ qdom, disconnect }`; `qdom` is deep Proxy emitting immediate mutation events.
- `serializeQDomCompressed(documentNode)`
  - Serializes full QDom document to `qdom-lzw-base64:<payload>`.
- `deserializeQDomCompressed(payload)`
  - Rehydrates serialized QDom payload back into object form.
- `saveQDomTemplateBefore(qHtmlElement, documentNode, doc?)`
  - Writes serialized payload into exactly one mapped `<template data-qdom="1" data-qdom-for="...">` immediately before `<q-html>`.
- `loadQDomTemplateBefore(qHtmlElement)`
  - Reads and deserializes persisted QDom payload from adjacent/mapped template.

## Side Effects and External Dependencies
- Uses browser global primitives where available (`TextEncoder`, `TextDecoder`, `btoa`, `atob`, `document`).
- Falls back to Node `Buffer` for base64 in non-browser test contexts.

## Cross-Module Imports/Exports
- Exports API on `globalThis.QHtmlModules.qdomCore`.
- Consumed by `qhtml-parser`, `dom-renderer`, and `qhtml-runtime`.

## Backward Compatibility Notes
- Initial v1 API.
- Serialized payload prefix is versioned (`qdom-lzw-base64`) to allow future format migration.
- Template persistence enforces a strict 1:1 mapping between each `<q-html>` and a single serialized QDom template, even when hosts move between parent containers.
