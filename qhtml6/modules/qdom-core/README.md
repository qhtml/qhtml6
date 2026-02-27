# qdom-core

`qdom-core` is the canonical data-model module for QHTML v6. It defines QDom node shapes, constructors, traversal helpers, deep observation, and compressed persistence utilities used by parser/runtime/renderer.

## What this module actually does

- Defines every runtime node type used across the system (`document`, `element`, `text`, `raw-html`, `component`, `component-instance`, `template-instance`, `slot`, `script-rule`).
- Provides factory constructors for all QDom node kinds with normalized defaults and metadata.
- Implements deep tree walking (`walkQDom`) and deep cloning (`cloneDocument`) so other modules can inspect and transform QDom safely.
- Implements mutation observation through deep `Proxy` wrapping (`observeQDom`) and reports precise mutation envelopes (`set`, `delete`, path, old/new values).
- Marks mutated nodes/documents as dirty for round-trip serializer behavior.
- Implements compact persistence of QDom using LZW + varint + base64 (`qdom-lzw-base64:<payload>`).
- Saves/loads serialized QDom into sibling `<template data-qdom="1">` tags adjacent to `<q-html>` hosts.

## Why other modules depend on it

- `qhtml-parser` uses constructors and node constants when turning source text into QDom.
- `dom-renderer` relies on normalized node kinds and structures when mapping QDom to actual DOM.
- `qhtml-runtime` relies on observation + template persistence to keep rendered DOM and source model synchronized.

## Data model summary

- Document shape: `{ kind, version, nodes, scripts, meta }`
- Element shape: `{ kind, tagName, attributes, children, textContent, selectorMode, selectorChain, meta }`
- Component/template definition shape: `{ kind: "component", componentId, definitionType, templateNodes, methods, lifecycleScripts, meta }`
- Component/template invocation shape: `{ kind: "component-instance" | "template-instance", componentId, tagName, attributes, slots, children, textContent, ... }`
- Slot shape: `{ kind: "slot", name, children, ... }`
- Script rule shape: `{ kind: "script-rule", selector, eventName, body, meta }`

## Persistence behavior

- Serialized payloads are written before `<q-html>` as mapped `<template data-qdom="1" data-qdom-for="...">` nodes.
- Duplicate persisted templates for the same host mapping are cleaned up.
- Loading prefers mapped templates and gracefully returns `null` when no valid payload exists.

## Observation behavior

- `observeQDom(documentNode, onChange)` returns `{ qdom, disconnect }`.
- `qdom` is a deep proxy that preserves original object identities via cache.
- Writes and deletes trigger:
  - `meta.dirty = true` on target + root document.
  - callback mutation object with full path.
- Calling `disconnect()` disables callback emissions while leaving proxy usable.

## Usage example

```js
const doc = QHtmlModules.qdomCore.createDocument();
doc.nodes.push(
  QHtmlModules.qdomCore.createElementNode({
    tagName: "div",
    attributes: { class: "box" },
    textContent: "Hello",
  })
);
```

**Rendered HTML result (after renderer/runtime consume this QDom):**

```html
<div class="box">Hello</div>
```
