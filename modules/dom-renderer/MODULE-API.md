# MODULE API — dom-renderer

## Purpose
Render QDom documents and component definitions into live browser DOM.

## Export surface
Exports via `globalThis.QHtmlModules.domRenderer`.

### Primary APIs
- `collectComponentRegistry(documentNode)`
  - Returns `Map<componentId, componentDefinitionNode>`.
  - Also includes `q-struct` definitions keyed by `structId`.
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
- q-perf helpers:
  - `startQPerfMeasurement(targetNode, configNode, category, label?)`
  - `finishQPerfMeasurement(marker)`
  - `recordQPerfMeasurement(targetNode, configNode, category, elapsedMs, label?)`
  - `logQPerfData()`
  - These helpers aggregate into `qdomNode.perf_data` with total/count/average values and per-category metric totals.

## Supported node kinds
- `element`, `text`, `raw-html`
- `q-state-machine` component-instance nodes with `meta.__qhtmlStateMachine` and inline component definitions
- `callback` (`q-callback` declaration node; scope registration only, no direct DOM output)
- `repeater` (runtime iteration)
- `model` (repeater model container consumed by repeater rendering)
- `component-instance`, `template-instance`
- `struct`, `struct-instance` (`q-struct` data definitions/instances; scope registration only, no direct DOM output)
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
  - duplicate names in the same lexical frame use last-write-wins semantics.
  - alias handles are UUID-backed runtime pointers, resolved lazily when dereferenced.
  - nested instance names live in child lexical scope frames (visible through that instance context chain, not promoted globally).
- Named `q-struct` instances register data-only runtime objects into the same lexical/runtime context frames:
  - declaration form: `SomeStruct someName { ... }`
  - no DOM element is created for the definition or instance
  - fields read defaults from the `q-struct` definition unless overridden by the instance
  - bare dot-walk field values stay live as declarative bindings until assigned from JavaScript
  - assigning `someName.field = value` stores a literal override on the struct instance QDom and removes the active binding for that field
  - function fields return callable JavaScript function references, so `someName.fn()` works in interpolation and handlers
- Named `q-state-machine` hosts are registered in lexical/runtime scope by machine name:
  - declaration form: `q-state-machine machineName { stateName { ... } }`
  - renders through the normal q-component host path as `<q-state-machine q-component="q-state-machine" qhtml-component-instance="1">`.
  - exposes `machineName` to event handlers, inline expressions, and root named runtime values using normal named component-instance alias registration.
  - `state` is a declared q-property on the inline component definition, but its setter is owned by the state-machine bridge so assigning `machine.state = "stateName"` swaps only the machine host's active QDom subtree instead of remounting the whole `<q-html>`.
  - `machine.statechanged` is the normal component `q-signal` callable installed by `bindComponentMethods`; it emits `(nextState, previousState, true)` after the state body is rendered.
  - state-machine bodies can contain component-level `q-property`, `q-signal`, `function`, lifecycle, callback, alias, and timer declarations.
  - active state bodies render in the machine component context so repeated aliases across states, such as `mycomponent mycomp`, are scoped as component children of the current machine host.
  - invalid/unknown state names produce an empty state body while preserving the assigned `state` value.
- `q-callback` declarations register callable symbols in render scope and runtime callback registry, enabling:
  - direct declarative invocation (`callbackName(...)`) in text/props/templates
  - pass-by-reference assignment into declared component properties (resolved lazily to callback functions)
  - `qhtml(...)` fragment-return rendering when callbacks return QHTML fragment tokens
  - callback names are also stored in the active lexical/runtime context frame so later expressions in the same scope resolve by name.
- `q-var` declarations register scoped runtime variables in the existing QContext frames:
  - declaration form: `q-var name { expressionOrBody }`
  - declaration bodies are stored on the QDom q-var declaration and evaluated lazily when the variable is first read
  - declaration bodies can reference earlier q-vars, q-switches, callbacks, and named references from the current inherited QContext
  - supported stored values are strings, numbers, objects, arrays, and functions
  - reads return the stored value and assignments replace the stored value
  - named q-var handles are kept in runtime scope maps without writing the handle through the public host accessor, so function-valued q-vars remain callable from event handler script contexts after render synchronization
  - dynamic behavior should be expressed by storing a function and invoking it, for example `q-var current { function() { return source.value; } }`
  - q-vars are visible to following siblings and descendants, and are exported on the owning component or `<q-html>` host for dot-walk access
- `q-switch` declarations register scoped callable functions in the existing QContext frames:
  - declaration form: `q-switch name { key: { expression } *: defaultExpression }`
  - `name(value)` resolves by primitive key and evaluates only the selected case body on demand
  - case bodies evaluate with the current inherited QContext and q-var references resolve to their stored JavaScript values
  - no property binding or listener behavior is installed; dynamic behavior must come from the caller or from expressions/functions returned by cases
  - returned QHTML source strings can be passed into `qhtml(name(value))`
- `q-timer` declarations can be registered at document scope or inside anonymous DOM/theme/style containers:
  - anonymous containers inherit the current QContext instead of creating a new named scope
  - root timers are registered before document nodes render so handlers and expressions can resolve them by name
  - timers inside component/worker hosts are owned by that host and remain reachable through normal named-reference dot walking
- Inline event handlers receive the current inherited QContext in their script scope, so named references visible during render are also visible when the handler runs.
  - Rendered DOM elements are bound to the active scope/runtime context frames before event attributes are compiled.
  - Script contexts read `q-var` declarations as their stored JavaScript values and write assignment back to q-var storage, so handlers can use natural `var`-like syntax such as `count = count + 1` or `helper()`.
- `q-perf` instrumentation is opt-in per direct owner node through `meta.__qhtmlPerfFlags`.
  - Supported categories: `q-timer`, `q-signal`, `q-property`, `q-worker`, and `function`.
  - Component definition flags are copied to each rendered component/worker instance node so measurements are per instance where a live instance QDom node exists.
  - Measurements are aggregated in-place on the measured QDom node as `perf_data`; no per-execution records are stored.
  - `logQPerfData()` prints `{ uuid, canonicalName, referenceName, perf_data }` for measured nodes.
- `q-anchor` positioning is opt-in per direct owner node through `meta.__qhtmlAnchorRules`.
  - Supported rule keys: `left`, `right`, `top`, `bottom`, `hcenter`, `vcenter`, `center`.
  - Rule values can be named DOM side references (`someRef.right`, `someRef.center`) or JavaScript/CSS literal expressions.
  - Renderer resolves named instance handles to rendered DOM geometry and applies absolute pixel offsets relative to the anchored element's offset parent.
  - Positions are recalculated after render, resize, and scroll.
- `q-layout`, `q-row`, and `q-col` are renderer-owned layout keywords:
  - they render as lightweight layout DOM tags with built-in grid/table-like CSS behavior
  - `q-layout` defaults to row stacking; `q-row` defaults to column stacking; `q-col` can host nested rows, columns, or layouts
  - `width`, `height`, and `gap` accept normal CSS values; bare numbers are treated as pixels
  - `q-row` automatically stacks direct `q-col` children vertically when its inline size is too narrow for the configured columns, and restores the normal columns when space is available; tune with `stackAt` / `stack-at` or `minColWidth` / `min-col-width`, or disable with `responsive="false"` / `stack="never"`
  - child context is pass-through, so layout wrappers do not create lexical QContext scopes and named references remain visible through nested layouts and projected slots
  - rendered layout elements expose `rows()`, `row(index)`, `cols()`, `col(index)`, `addRow(...)`, `addCol(...)`, `addLayout(...)`, `removeRow(...)`, `removeCol(...)`, and `relayout()`

## Component host assignment behavior
- Component slot projection prefers normalized component-instance `slots` over raw instance children when present. This keeps shorthand slot wrappers (`slotName { ... }`) out of rendered output and allows projected `q-layout`, `q-row`, and `q-col` nodes to render normally inside slots.
- Slot fill lookup is case-insensitive after exact lookup. This preserves declared slot names such as `slot { heroTitle }` while allowing shorthand invocation wrappers like `heroTitle { ... }`, whose tag names are normalized by HTML/QDom parsing, to project into the intended slot.
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
  - signal emission uses `Function.prototype.apply.call(...)` internally so callable signal functions keep working after their prototype is changed to `QSignal.prototype`
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
