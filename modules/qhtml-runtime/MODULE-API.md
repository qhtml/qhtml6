# MODULE API — qhtml-runtime

## Purpose
Runtime mount/update engine for `<q-html>` in browser environments.

## Export surface
- `globalThis.QHtmlModules.qhtmlRuntime`
- aliased to `globalThis.QHtml`

## Public APIs
- `mountQHtmlElement(qHtmlElement, options?)`
  - Mount one host.
  - Returns binding object immediately and exposes `binding.ready` promise for async import completion.
- `unmountQHtmlElement(qHtmlElement)`
  - Detach observers/listeners for one host.
- `getQDomForElement(qHtmlElement)`
  - Returns observed QDom proxy.
- `toQHtmlSource(qHtmlElement, options?)`
  - Serialize current mounted model to source.
- `updateQHtmlElement(qHtmlElement, options?)`
  - Re-evaluates binding expressions and re-renders mounted output.
  - Optional `options.scopeElement` (mapped DOM element) performs scoped rerender of only that subtree.
  - Optional `options.uuid` resolves a mapped DOM element via host UUID maps and scopes update to it.
  - Includes loop protection for binding-driven re-entry:
    - caps recursive update cycles per tick
    - caps same-epoch re-entry attempts
    - aborts with console error when limits are exceeded
- `hydrateComponentElement(hostElement)`
  - Hydrate custom-element/component host from registered definitions.
- `emitQSignal(target, payload, eventNamePrefix?)`
  - Dispatch runtime signal events (`q-signal` and optional namespaced event).
- `createQSignalEvent(payload)`
  - Create a bubbling/composed `q-signal` event object.
- `initAll(root?, options?)`
  - Mount all `<q-html>` descendants.
- `startAutoMountObserver(root?, options?)`
  - Observe subtree insertions and mount new `<q-html>` automatically.
- `stopAutoMountObserver()`
  - Disable auto mount observer.

## Mount options (not exhaustive)
- import controls (`importBaseUrl`, `maxImports`, `importCache`)
- template preference (`preferTemplate`)
- parser/rewrite/script pass limits

## `.qdom()` and node list helpers
- `host.qdom()` / `element.qdom()` return facades over source QDom nodes.
- Mounted `<q-html>` hosts expose `.update()` as shorthand for `QHtml.updateQHtmlElement(host)`.
- Mounted `<q-html>` hosts expose `.update(uuid)` for UUID-targeted scoped refresh.
- Mounted `<q-html>` hosts expose UUID lookup helpers:
  - `uuidMaps()` returns host-bound maps (`uuidToDom`, `domToUuid`, `uuidToQdom`, `qdomToUuid`).
  - `uuidFor(value)` resolves UUID from DOM/QDom nodes.
  - `elementForUuid(uuid)` and `qdomForUuid(uuid)` resolve mapped DOM/QDom nodes.
- Component instance hosts expose `.update()` as shorthand for scoped `QHtml.updateQHtmlElement(hostRoot, { scopeElement: componentHost })`.
- Component instance hosts also accept targeted UUID updates:
  - `.update(uuid)` forwards scoped refresh by UUID.
  - `.invalidate(uuid|options)` forces binding evaluation and supports UUID targeting.
- Mounted elements expose `.root()` as shorthand for the owning `<q-html>` host.
- Prototype fallback: `HTMLElement.prototype.qdom()` resolves via closest component host first (`[qhtml-component-instance='1']`), then nearest `<q-html>` host (`uuidFor/qdomForUuid` when available).
- QDom mutation helpers include `replaceWithQHTML(source, rootNode?)` and `rewrite(parameterBindings?, callback)`.
 - QDom property helpers on facades:
  - `setProperty(name, value)`
  - `getProperty(name)`
  - `property(name)` getter
  - `property(name, value)` setter alias of `setProperty`
  - `rewrite(...)` executes `callback` with default bindings `{ this: currentNodeFacade }`.
  - The callback return value is stringified and applied to the calling node via `replaceWithQHTML(...)`.
- QDom projection helpers:
  - `show(prop1, prop2, ...)` returns `[projectedTree]` with only requested keys on each QDom node.
  - `map({ fromKey: toKey, ... })` returns `[projectedTree]` with key names remapped recursively.
- QDom facades expose `root(options?)`:
  - default returns owning `<q-html>` host element
  - `{ qdom: true }` or `"qdom"` returns the QDom document root facade
- `children()` returns `QDomNodeList` with:
  - `qhtml(options?)`
  - `htmldom(targetDocument?)`
  - `html(targetDocument?)`
  - iteration and indexed access helpers
- QDom traversal helpers (`find`, `findAll`, parent/child walking, selector fallback scanning) include repeater/model structures:
  - `repeater.model` (`QDomModel`)
  - `model.entries`
  - `entry.nodes` payloads for q-object model entries

## Side effects
- Executes lifecycle scripts and inline `on<Event>` handler bodies with dynamic `Function` evaluation.
- Executes `meta.qBindings` scripts (`q-bind` and assignment `q-script`) with `this` bound to each source QDom node before render/update.
- Emits runtime signal events through `emitQSignal(...)` helpers.
- Initializes/terminates component `q-wasm` sessions as component hosts are rendered, replaced, or unmounted.
- Persists updated QDom into mapped sibling template nodes.
- Emits/consumes DOM events and mutation observers.
- DOM mutation sync is one-way by source:
  - user/DOM-originated mutations are synced into QDom.
  - QDom-driven render/patch cycles run with sync suppression to avoid feeding renderer writes back into QDom.
- Adds context helpers on DOM elements (`qhtmlRoot()`, `root()`, `component`, `slot`, `qdom`).
- Maintains host-bound UUID maps (`uuid↔dom`, `uuid↔qdom`) and listens for `qhtml:update` scoped-refresh events.
- Maintains component-host property reference indexes (`propertyName -> Set<qdomUuid>`) derived from binding scripts that reference `this.component.<prop>` / `component.<prop>` for targeted updates.
- Custom-element registration (`customElements.define`) now applies parsed component `q-property` defaults per instance at construction/connection time (non-binding defaults only).
