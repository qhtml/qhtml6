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
- `hydrateComponentElement(hostElement)`
  - Hydrate custom-element/component host from registered definitions.
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
- `children()` returns `QDomNodeList` with:
  - `qhtml(options?)`
  - `htmldom(targetDocument?)`
  - `html(targetDocument?)`
  - iteration and indexed access helpers

## Side effects
- Executes lifecycle scripts and inline `on<Event>` handler bodies with dynamic `Function` evaluation.
- Persists updated QDom into mapped sibling template nodes.
- Emits/consumes DOM events and mutation observers.
- Adds context helpers on DOM elements (`qhtmlRoot()`, `component`, `slot`, `qdom`).
