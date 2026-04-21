# MODULE API — dom-renderer

## Purpose
Render QDom documents and component definitions into live browser DOM.

## Export surface
Exports via `globalThis.QHtmlModules.domRenderer`.

### Primary APIs
- `collectComponentRegistry(documentNode)`
  - Returns `Map<componentId, componentDefinitionNode>`.
  - Walks nested definition locations including repeater template/model payloads.
- `renderDocumentToFragment(documentNode, targetDocument?)`
  - Renders top-level runtime nodes into a `DocumentFragment`.
- `renderIntoElement(documentNode, hostElement, targetDocument?)`
  - Replaces host content with rendered fragment.
- `renderComponentElement(componentNode, hostElement, targetDocument?, options?)`
  - Hydrates a concrete DOM host from a component definition.
- Runtime type exports:
  - `QSignal` (callable signal type with `.connect/.disconnect/.emit`)
  - `QProperty` (declared-property backing instance type)
  - `QComponentInstance` (component-instance metadata wrapper)

## Supported node kinds
- `element`, `text`, `raw-html`
- `callback` (`q-callback` declaration node; scope registration only, no direct DOM output)
- `repeater` (runtime iteration)
- `model` (repeater model container consumed by repeater rendering)
- `component-instance`, `template-instance`
- `slot` projection containers
- `q-signal` definitions invoked through `component-instance` dispatch behavior

## Repeater/model-view interpolation scope
- Repeater render now carries per-row inline scope:
  - alias variable from repeater/model-view slot name (for example `item`)
  - `index` for the current row
- `for (...)` repeaters evaluate source expressions at render-time and expand inline without a wrapper scope element.
- `for` map/object/QModel(map-mode) iteration yields keys; array/QModel(array-mode) iteration yields values.
- `for` runtime source resolution includes component-scoped direct paths and common no-arg method chains:
  - `this.component.items`
  - `component.items.values()`
  - `items`
  - unresolved/empty-string sources normalize to empty iteration.
- Iterable coercion includes native iterables (`Symbol.iterator`) in addition to arrays/QModel/map/object fallbacks.
- Inline expressions in text/attributes can read scoped values directly (for example `${item}` and `${item.name}`).
- Direct symbol text is also resolved for simple scoped identifiers/paths (for example `li { item }`).
- `q-model-view` repeaters prefer model-value interpolation (`[object Object]` for object rows) instead of q-object source-string substitution.
- Named typed instances are registered into lexical scope/context frames:
  - declaration form: `SomeType someName { ... }`
  - duplicate name in the same lexical frame is a hard error.
  - alias handles are UUID-backed runtime pointers, resolved lazily when dereferenced.
  - nested instance names live in child lexical scope frames (visible through that instance context chain, not promoted globally).
- `q-callback` declarations register callable symbols in render scope and runtime callback registry, enabling:
  - direct declarative invocation (`callbackName(...)`) in text/props/templates
  - pass-by-reference assignment into declared component properties (resolved lazily to callback functions)
  - `qhtml(...)` fragment-return rendering when callbacks return QHTML fragment tokens
  - callback names are also stored in the active lexical/runtime context frame so later expressions in the same scope resolve by name.

## Component host assignment behavior
- `component-instance.attributes` map to DOM attributes.
- `component-instance.props` map to direct host element property assignment (`host[propName] = value`).
- For declared component properties only, bare dotted references (for example `myinstance.myprop1`) are resolved against interpolation scope without `${...}`.
  - unresolved references are coerced to empty string.
  - unresolved/overwrite warnings are emitted only when `q-logger { q-property }` is enabled in scope.
- `q-component ... extends ... extends ...` chains are resolved at render time:
  - inherited properties/methods/signals/aliases/lifecycle hooks are merged base→child.
  - multiple bases are merged in declaration order (`extends baseA extends baseB`, then child).
  - child definitions override inherited entries with the same name.
  - template nodes/children from all inherited components are included (base declarations first, child last).
- Declared `q-property` host setters:
  - treat `host.qdom()` props as source-of-truth for reads/writes when available.
  - sync value writes back to mapped QDom props when available.
  - track previous values in a per-component property-state map stored on QDom metadata.
  - preserve a raw assigned-value slot for public getter reads (`instance.prop` returns the raw assigned value when present).
  - keep runtime-internal property bookkeeping/listeners private (not exposed through normal property getter reads).
  - skip re-render when value is unchanged (`Object.is`).
  - dispatch bubbling `q-property-changed` custom events for real value changes.
  - when a declared property is assigned a QHTML model-like value (`QArray`/`QMap`/`QModel`), subscribe to its mutation signal and re-emit `<property>Changed` on internal model mutation.
  - detach prior model-mutation listeners when the property is reassigned.
  - do not auto-dispatch render invalidation/update cycles after setter writes; post-set refresh is explicit.
  - event payload includes:
    - `component` / `componentId` / `componentTag`
    - `componentUuid`
    - `property`
    - `value`
    - `previousValue`
    - `timestamp`
  - `property someName { ... }` fallback values resolve to literal text when no bound element exists for that property definition.
 - Component method calls resolve detached/stale element references to live DOM instances by UUID/id before execution.

## Lifecycle and side effects
- Executes hook/method bodies with `new Function(...)` bound to host element context.
- Dispatches `QHTMLContentLoaded` custom events on document/global with sequence metadata.
- Dispatches signal events when rendering signal invocations:
  - `q-signal`
  - named event equal to signal id
- In queued runtime mode, declarative `on<signal>` and `.connect(...)` bindings register UUID-routed subscribers through `QHtml.registerSignalSubscriber(...)` and signal-reference routes through `QHtml.registerSignalReference(...)`.
- In queued runtime mode, `.connect(...)` also registers runtime subscriber handlers (UUID-routed) with a connect-order queue marker so immediate post-connect emits resolve deterministically.
- Event/lifecycle/method/signal-handler execution is wrapped with runtime execution-host context (`QHtml.runWithExecutionHost(...)`) so queued signal subscriptions can attribute subscriber UUIDs to the invoking host.
- Binds component-local signal declarations (`q-signal name(param1, ...)`) onto host instances as callable methods:
  - `instance.name(...)`
  - `instance.name.connect(fn)`
  - `instance.name.disconnect(fn?)`
  - `instance.name.emit(...)`
  - each signal callable is an instance of `QSignal` (runtime type) while preserving call syntax
- Declared `q-property` entries register backing `QProperty` instances on host metadata map (`host.__qhtmlPropertyInstances`).
- Component hosts register `QComponentInstance` metadata (`host.__qhtmlComponentInstanceMeta`).
- Component execution contexts aggressively normalize `this.component` to the nearest owning component instance host before hook/event/method execution.
- Binds component-local callback declarations (`q-callback name(param1, ...)`) onto host instances as callable methods:
  - `instance.name(...)`
  - host-bound callbacks execute with creator component context (`this.component` preserved)
- Binds component alias declarations (`q-alias aliasName { return ... }`) onto host instances as computed properties (`instance.aliasName`).
- Binds component wasm declarations (`q-wasm { ... }`) onto host instances as `instance.wasm` with:
  - `ready` Promise
  - `call(exportName, payload)`
  - `terminate()`
  - optional export→method and export→signal mappings from `bind { ... }`
- Tracks ownership for slot routing and dynamic lookup in runtime.
- Registers component/template definitions encountered during render traversal (including inside repeater expansions) so subsequent instances can resolve in the same render pass.

## Failure behavior
- Throws when required dependency (`qdom-core`) is missing.
- Throws on recursive definition expansion cycles.

## Cross-module usage
- Depends on `qdom-core`.
- Called by `qhtml-runtime` for initial mount and structural re-renders.
