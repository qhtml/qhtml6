# MODULE API — qdom-core

## Purpose
`qdom-core` is the shared foundational module that defines QDom structures and low-level utilities used by all higher-level QHTML modules.

## Export surface
Exports via `globalThis.QHtmlModules.qdomCore`.

### Constants
- `NODE_TYPES`
  - `document`, `element`, `text`, `raw-html`, `model`, `repeater`, `component`, `component-instance`, `template-instance`, `struct`, `struct-instance`, `viewport`, `viewport-instance`, `slot`, `slot-default`, `script-rule`, `color`.
- `TEXT_ALIASES`
  - `content`, `contents`, `text`, `textcontents`, `innertext`.
- `QDOM_UUID_KEY`
  - Metadata key (`meta.uuid`) used for stable per-node UUID identity.
- `QCSS_VALUE_MARKER`
  - Marker property used by runtime CSS numeric values.

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
  - Supports `extendsComponentIds` (and legacy `extendsComponentId`) for component inheritance chains (`q-component child extends baseA extends baseB { ... }`).
  - Supports `signalDeclarations` array for component-local callable signal definitions.
  - Supports `aliasDeclarations` array for component-local computed alias getters (`q-alias`).
  - Supports `varDeclarations` array for component-local `q-var` declarations.
  - Supports `switchDeclarations` array for component-local `q-switch` declarations.
- `createComponentInstanceNode(options?)`
  - Normalizes `props` as an object for component-instance property values.
  - Instance node helpers:
    - `properties()` returns a shallow copy of `props`.
    - `getProperty(key)` returns the current prop value (or `undefined`).
- `createStructNode(options?)`
  - Creates data-only `q-struct` definition nodes with `structId`, `definitionType: "struct"`, and `fields`.
- `createStructInstanceNode(options?)`
  - Creates data-only typed struct instances with `structId`, `fields`, and instance alias metadata.
  - Struct instance nodes render no DOM and are consumed by `dom-renderer` as named runtime values.
- `createViewportNode(options?)`
  - Creates named `q-viewport` responsive condition definitions with `viewportId` and `constraints`.
- `createViewportInstanceNode(options?)`
  - Creates `q-viewport` invocation nodes with inherited constraints and child QDom content gated by renderer viewport state.
- `createSlotNode(options?)`
- `createSlotDefaultNode(options?)`
- `createScriptRule(options?)`
- `createQColorNode(options?)`
  - Creates `QColorNode` entries used by runtime color helpers.
  - Supports schema mode (`{ name, value }`) and theme mode (`{ name, assignments }`).
- `QCssValue(options)`
  - Runtime value object for CSS numeric values and CSS arithmetic expressions.
  - Carries numeric value, unit, optional expression operands, optional style property, and a non-enumerable DOM context reference.
  - `toString()` returns CSS output (`px`, unit string, or `calc(...)`); `valueOf()` returns a resolved pixel number when resolution is possible.

All constructors normalize missing fields, include `meta` objects, and produce runtime-safe defaults.

### Introspection / transforms
- `isNode(value)` — validates whether value looks like a QDom node.
- `walkQDom(documentNode, visitor)` — traverses both tree and script collections.
- `cloneDocument(documentNode)` — deep clone preserving document semantics.
- `ensureStringArray(value)` — normalizes unknown value into string list.
- `mergeClasses(existing, classNames)` — class dedupe and merge.
- `createCssValue(value, unit?, options?)` — creates or re-contextualizes a CSS numeric value.
- `parseCssValue(value, options?)` — parses strings such as `100px`, `50vh`, `10vw`, `1.25rem`, `0.5em`, `100%`, and unitless numbers.
- `isCssValue(value)` — returns true for runtime CSS numeric values.
- `serializeCssValue(value, context?, property?)` — serializes a CSS numeric value for style assignment.
- `resolveCssValue(value, context?, property?)` — resolves a CSS numeric value to pixels when the context and property provide enough basis.
- `cssAdd`, `cssSub`, `cssMul`, `cssDiv` — scoped arithmetic helpers used by QHTML-owned expression rewriting.
- `createCssContextHelper(context?, property?)` — creates the small `qcss` helper namespace for lifecycle, handler, and q-property expression execution.
- `transformCssExpression(source)` / `transformCssScriptBody(source)` — scoped QHTML expression transforms that rewrite CSS numeric arithmetic to helper calls.

### Reactivity
- `observeQDom(documentNode, onChange)`
  - Returns `{ qdom, disconnect, withMutationsSuppressed }`.
  - `qdom` is a deep proxy forwarding reads/writes to underlying model.
  - Emits mutation payloads for property set/delete operations.
  - `withMutationsSuppressed(fn)` runs `fn` while temporarily suppressing observer callbacks for internal normalization writes.
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
- CSS numeric value resolution uses the closest DOM/component context when available. Ambiguous mixed-unit expressions remain unresolved so renderers can output `calc(...)` instead of guessing.
- `walkQDom` traverses component `slotDefaults`, `repeater.templateNodes`, `repeater.model`, and nested model entry node payloads (`entry.nodes`) so internals are discoverable through QDom tooling.
- `walkQDom` also traverses `struct.fields[].nodes` when field node payloads are present.
- `walkQDom` traverses `viewport-instance.children` so responsive-gated QDom content remains discoverable through tooling.

## Module dependencies
- No internal dependency on parser/renderer/runtime.
- Uses host globals when present (`document`, encoding/base64 utilities).
