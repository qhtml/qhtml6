# MODULE API — qdom-core

## Purpose
`qdom-core` is the shared foundational module that defines QDom structures and low-level utilities used by all higher-level QHTML modules.

## Export surface
Exports via `globalThis.QHtmlModules.qdomCore`.

### Constants
- `NODE_TYPES`
  - `document`, `element`, `text`, `raw-html`, `component`, `component-instance`, `template-instance`, `slot`, `script-rule`.
- `TEXT_ALIASES`
  - `content`, `contents`, `text`, `textcontents`, `innertext`.

### Constructors
- `createDocument(options?)`
- `createElementNode(options?)`
- `createTextNode(options?)`
- `createRawHtmlNode(options?)`
- `createComponentNode(options?)`
  - Normalizes `properties` as an array for declared `q-component` property names.
- `createComponentInstanceNode(options?)`
  - Normalizes `props` as an object for component-instance property values.
- `createSlotNode(options?)`
- `createScriptRule(options?)`

All constructors normalize missing fields, include `meta` objects, and produce runtime-safe defaults.

### Introspection / transforms
- `isNode(value)` — validates whether value looks like a QDom node.
- `walkQDom(documentNode, visitor)` — traverses both tree and script collections.
- `cloneDocument(documentNode)` — deep clone preserving document semantics.
- `ensureStringArray(value)` — normalizes unknown value into string list.
- `mergeClasses(existing, classNames)` — class dedupe and merge.

### Reactivity
- `observeQDom(documentNode, onChange)`
  - Returns `{ qdom, disconnect }`.
  - `qdom` is a deep proxy forwarding reads/writes to underlying model.
  - Emits mutation payloads for property set/delete operations.

### Persistence / serialization
- `serializeQDomCompressed(documentNode)`
  - Output: `qdom-lzw-base64:<payload>`.
- `deserializeQDomCompressed(payload)`
- `saveQDomTemplateBefore(qHtmlElement, documentNode, doc?)`
  - Writes/updates mapped persisted template before `<q-html>`.
- `loadQDomTemplateBefore(qHtmlElement)`
  - Loads persisted template payload (or `null`).

## Behavioral notes
- Compression stack: JSON → binary string → LZW codes → varint bytes → base64.
- Base64 supports browser globals (`btoa`/`atob`) and Node fallback (`Buffer`).
- Persistence mapping uses host identity (`data-qdom-host`) and cleanup of duplicates.
- Mutation observation marks touched objects and root document as dirty.

## Module dependencies
- No internal dependency on parser/renderer/runtime.
- Uses host globals when present (`document`, encoding/base64 utilities).
