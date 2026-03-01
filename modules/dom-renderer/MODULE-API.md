# MODULE API — dom-renderer

## Purpose
Render QDom documents and component definitions into live browser DOM.

## Export surface
Exports via `globalThis.QHtmlModules.domRenderer`.

### Primary APIs
- `collectComponentRegistry(documentNode)`
  - Returns `Map<componentId, componentDefinitionNode>`.
- `renderDocumentToFragment(documentNode, targetDocument?)`
  - Renders top-level runtime nodes into a `DocumentFragment`.
- `renderIntoElement(documentNode, hostElement, targetDocument?)`
  - Replaces host content with rendered fragment.
- `renderComponentElement(componentNode, hostElement, targetDocument?, options?)`
  - Hydrates a concrete DOM host from a component definition.

## Supported node kinds
- `element`, `text`, `raw-html`
- `component-instance`, `template-instance`
- `slot` projection containers
- `q-signal` definitions invoked through `component-instance` dispatch behavior

## Component host assignment behavior
- `component-instance.attributes` map to DOM attributes.
- `component-instance.props` map to direct host element property assignment (`host[propName] = value`).

## Lifecycle and side effects
- Executes hook/method bodies with `new Function(...)` bound to host element context.
- Dispatches `QHTMLContentLoaded` custom events on document/global with sequence metadata.
- Dispatches signal events when rendering signal invocations:
  - `q-signal`
  - named event equal to signal id
- Tracks ownership for slot routing and dynamic lookup in runtime.

## Failure behavior
- Throws when required dependency (`qdom-core`) is missing.
- Throws on recursive definition expansion cycles.

## Cross-module usage
- Depends on `qdom-core`.
- Called by `qhtml-runtime` for initial mount and structural re-renders.
