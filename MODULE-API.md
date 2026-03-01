# MODULE API

## Purpose
Root integration module wires lower-level modules for browser consumers, exposes a unified runtime API, and ships browser-facing integration assets (`q-editor` and demo page).

## Boundaries
- Integration and API wiring only.
- No parser or renderer internals are implemented here.
- Browser assets in `dist/` consume module APIs but do not implement parser/renderer internals.

## Public Definitions
- `src/root-integration.js`
  - Extends `QHtml` runtime API with convenience wrappers:
    - `SIGNALS.QHTMLContentLoaded`
    - `version`
    - `parseQHtml(source)`
    - `parseQScript(source)`
    - `serializeQDom(qdomDocument)`
    - `deserializeQDom(payload)`
    - `renderInto(qdomDocument, hostElement)`
    - runtime passthroughs including `updateQHtmlElement(qHtmlElement)`
- `dist/q-editor.js`
  - Registers custom element `<q-editor>`.
  - Public element methods:
    - `setQhtmlSource(source)`
    - `getQhtmlSource()`
  - Renders QHTML using QDom as source-of-truth:
    - HTML tab from adapter `toHTML()`
    - Preview tab by mounting a real `<q-html>` through `QHtml.mountQHtmlElement(...)` (with cleanup via runtime unmount/disconnect), so runtime handler contexts match normal page usage.
    - QDom tab from compressed serialize/deserialize output.
- `dist/demo.html`
  - Showcase page for feature coverage and runtime behavior.
  - Includes a QDom mutation lab demonstrating live `host.qdom()` edits with chain helpers (`find`, `appendNode`, `createInstanceFromQHTML`, `rewrite`) and serialize/restore flows.
  - Includes inline-handler context demos for `this.qhtml`, `this.component`, `this.slot`, and related `.qdom()` accessors.
  - Includes a live `q-estore` showcase section that imports `q-components.qhtml`, loads encoded inline `items-json`, and exercises `q-estore` API methods from UI controls.
  - Includes `q-popup-menu` / `q-context-menu` usage with scoped context menu handling and click-signal events.
- `dist/q-components.qhtml` and `dist/q-components/*.qhtml`
  - Reusable component bundle imported with `q-import { q-components.qhtml }`.
  - Includes shared UI primitives (`q-modal`, `q-form`, `q-grid`, `q-tabs`) and e-store suite:
    - `q-store-catalog-item`
    - `q-store-catalog`
    - `q-checkout-modal`
    - `q-estore` (supports encoded inline `items-json` and URL fetch loading with in-memory dedupe).
    - `q-popup-menu` / `q-context-menu` (scoped context menu UI with item/submenu/text/separator primitives).

## Side Effects and Dependencies
- Requires module globals on `globalThis.QHtmlModules` from bundled scripts.
- Sets `globalThis.QHtml` to unified runtime API.
- `dist/q-editor.js` defines `customElements.define('q-editor', ...)`.
- `dist/q-editor.js` resolves `q-import` with `fetch()` and expects browser DOM APIs.

## Cross-Module Imports/Exports
- Imports from:
  - `qdom-core`
  - `qhtml-parser`
  - `dom-renderer`
  - `qhtml-runtime`
- Exports unified integration API via `globalThis.QHtml`.
- `dist/q-editor.js` consumes `globalThis.QHtmlModules.qhtmlParser`, `domRenderer`, and `qdomCore`.

## Compatibility Notes
- Initial integration surface for v0.1.0.
- QHTML parsing path now evaluates inline `q-script { return ... }` blocks before AST parse, enabling selector/property expression substitution in source.
- q-import resolution now uses persistent in-memory URL caches (sync + async) with async pending-request dedupe so repeated imports reuse memory instead of refetching.
- Live observed QDom proxies now expose `.qdom()` on `document`, `component-instance`, `template-instance`, and `slot` nodes to retrieve subtree roots for targeted mutation.
- QDom subtree objects now expose chain helpers for runtime mutation: `find(selector)`, `findAll(selector)`, `findSlotFor(target)`, `listSlots([ownerInstanceId])` (plus `slots([ownerInstanceId])` alias where it does not conflict with native slot arrays), `slot(name)`, `appendNode(nodeOrQHtml)`, `setAttribute`, `removeAttribute`, `createInstanceFromQHTML(source)`, `rewrite(parameterBindings?, callback)` (callback-driven source rewrite of the calling node), and `serialize()` (compressed payload for the current qdom node/subtree).
- Parser/runtime now support declarative binding metadata:
  - `q-property { ... }` in component definitions declares invocation keys that map into `component-instance.props`.
  - Assignment expressions `name: q-bind { ... }` and `name: q-script { ... }` are preserved as `meta.qBindings` and re-evaluated by runtime on render and `updateQHtmlElement(...)`.
- Parser/renderer/runtime now support declarative signal definitions and invocations:
  - `q-signal signalName { slot { a } slot { b } }`
  - invocation `signalName { a { ... } b { ... } }`
  - runtime dispatches `q-signal` and named signal events with slot payloads.
- Rendered DOM nodes now receive inline-handler context refs: `this.qhtml` (owning `<q-html>` host), `this.component` (nearest component host element with component methods and `.qdom()`), and `this.slot` (nearest projected slot context with `name` + `qdom()` access).
- Nested slot forwarding now normalizes parser-emitted shorthand wrappers in explicit slot payloads and resolves slot ownership by per-instance association for stable `.slot`/`.qdom().findSlotFor(...)` behavior.
- Runtime now emits a document-level `QHTMLContentLoaded` signal (`QHtml.SIGNALS.QHTMLContentLoaded`) whenever pending `<q-html>` mounts settle.
- `onReady { ... }` lifecycle hooks are tied to `QHTMLContentLoaded` timing in runtime-managed documents, while non-runtime-managed renderer-only contexts fall back to immediate execution.
