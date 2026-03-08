# MODULE API — qdom-core

## Purpose
`qdom-core` is the shared foundational module that defines QDom structures and low-level utilities used by all higher-level QHTML modules.

## Export surface
Exports via `globalThis.QHtmlModules.qdomCore`.

### Constants
- `NODE_TYPES`
  - `document`, `element`, `text`, `raw-html`, `model`, `repeater`, `component`, `component-instance`, `template-instance`, `slot`, `script-rule`, `color`.
- `TEXT_ALIASES`
  - `content`, `contents`, `text`, `textcontents`, `innertext`.
- `QDOM_UUID_KEY`
  - Metadata key (`meta.uuid`) used for stable per-node UUID identity.

### Constructors
- `createDocument(options?)`
- `createElementNode(options?)`
- `createTextNode(options?)`
- `createRawHtmlNode(options?)`
- `createModelNode(options?)`
  - Creates `QDomModel` nodes used as `q-repeater` model containers (`model { ... }`).
- `createRepeaterNode(options?)`
  - Creates `q-repeater`/`q-foreach` runtime nodes with `model` + `templateNodes`.
- `createComponentNode(options?)`
  - Normalizes `properties` as an array for declared `q-component` property names.
  - Supports `signalDeclarations` array for component-local callable signal definitions.
  - Supports `aliasDeclarations` array for component-local computed alias getters (`q-alias`).
- `createComponentInstanceNode(options?)`
  - Normalizes `props` as an object for component-instance property values.
  - Instance node helpers:
    - `properties()` returns a shallow copy of `props`.
    - `getProperty(key)` returns the current prop value (or `undefined`).
- `createSlotNode(options?)`
- `createScriptRule(options?)`
- `createQColorNode(options?)`
  - Creates `QColorNode` entries used by runtime color helpers.
  - Supports schema mode (`{ name, value }`) and theme mode (`{ name, assignments }`).

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
- `createQDomUuid()`
  - Generates UUID identity for QDom nodes (prefers `crypto.randomUUID()` when available).
- `ensureNodeUuid(node)`
  - Ensures `node.meta.uuid` exists and returns it.
- `getNodeUuid(node)`
  - Returns normalized `node.meta.uuid` or empty string.

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
- All QDom nodes now receive a stable `meta.uuid` when created unless one is explicitly supplied.
- Runtime update routing now keys off UUID identity; nonce metadata is no longer required for render invalidation.
- `walkQDom` traverses `repeater.templateNodes`, `repeater.model`, and nested model entry node payloads (`entry.nodes`) so repeater internals are discoverable through QDom tooling.

## Module dependencies
- No internal dependency on parser/renderer/runtime.
- Uses host globals when present (`document`, encoding/base64 utilities).
