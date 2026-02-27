# MODULE API

## Purpose
`dom-renderer` converts QDom document objects into live browser HTML DOM output.

## Boundaries
- Owns DOM construction from QDom nodes.
- Owns q-component/q-template expansion and slot substitution during render.
- Owns final DOM sanitation that removes literal `<slot>` tags from rendered output.
- Executes element lifecycle hooks (`onReady`/`onLoad`/`onLoaded`) after render.
- Does not parse QHTML source text and does not handle DOM scanning/bootstrap.

## Public Definitions
- `collectComponentRegistry(documentNode)`
  - Returns `Map<componentId, componentNode>` for all component/template definitions in a QDom document.
- `renderDocumentToFragment(documentNode, targetDocument?)`
  - Renders non-component top-level nodes into a `DocumentFragment`.
  - Understands explicit QDom invocation nodes:
    - `component-instance` renders as host custom element with projected slot content.
    - `template-instance` expands to pure HTML (no host wrapper).
    - `text` nodes render as DOM text nodes.
  - Supports slot forwarding across nested template/component chains before final DOM output.
- `renderIntoElement(documentNode, hostElement, targetDocument?)`
  - Replaces host contents and appends rendered fragment.
- `renderComponentElement(componentNode, hostElement, targetDocument?, options?)`
  - Hydrates an existing host element instance for a registered q-component definition.
  - Used by runtime for `<my-component></my-component>` elements outside `<q-html>`.

## Side Effects and External Dependencies
- Requires DOM APIs (`document`, `createElement`, `createDocumentFragment`).
- Executes lifecycle hook bodies with `new Function(...)` and `this` bound to rendered element.
- Throws on recursive self-referential component expansion to avoid infinite render loops.

## Cross-Module Imports/Exports
- Imports `qdom-core` through `globalThis.QHtmlModules.qdomCore`.
- Exports API on `globalThis.QHtmlModules.domRenderer`.
- Consumed by `qhtml-runtime`.

## Backward Compatibility Notes
- Supports both slot-fill forms:
  - Explicit `slot: "name"` attributes
  - Legacy shorthand invocation by child tag-name (`header { ... }` fills `slot { header }`).
