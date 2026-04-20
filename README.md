Don't like q-component keywords? Rather call them a-block or something else?  
Now you can use our script builder to customize the keywords for your qhtml instance. [Click here to visit the script roller.](https://qhtml.github.io/qhtml6/dist/script-roller.html)

----------

# QHTML.js v6.2.3

QHTML is a compact language and runtime for building web UIs with readable block syntax, reusable components, signals, and live QDOM editing.

- Live demo: https://qhtml.github.io/qhtml6/dist/demo.html
- Dev testbed: https://qhtml.github.io/qhtml6/dist/test.html
- Editor playground: https://qhtml.github.io/qhtml6/dist/editor.html
- Language wiki and more examples: https://github.com/qhtml/qhtml.js

## Whats New in v6.2.3

- Added/validated typed named-instance usage in demos and examples (`<type> <name> { }`) so component references can be direct (for example `demoestore.products = ...`) without selector boilerplate.
- Clarified and documented named-instance scope/context behavior for declarative references.
- Tightened `q-import` runtime handling so import resolution is treated as a hard barrier before parse/mount continuation.
- Added declarative signal wiring syntax: `q-connect { sender.signal target.handler }` (also supports `->` form).
- Added `q-spritesheet [alpha]` (currently in-progress and not fully stable yet).

## 1. Quick Start

### Project setup

1. Clone qhtml6 github repository

```bash
git clone https://github.com/qhtml/qhtml6.git
```

2. Copy qhtml6 into your project `qhtml` folder

```bash
source ./deploy.sh /path/to/project
```

   
### 1. Include `qhtml.js`
In any .html file in your project directory just include qhtml.js to get started.
```html
<script src="qhtml.js"></script>
```

Optional: component library and UI tools (modal, form, grid, tabs, builder, editor):
Assuming your `q-components.qhtml` is located in `the project folder /path/to/my-project/`

```html
<q-html>
   q-import { q-components.qhtml }
</q-html>
```

Files:
- Required: `qhtml.js`
- Recommended: `q-components.qhtml`, `w3.css`
- Optional: `q-components.qhtml`, `w3-tags.js`, `bs.css` + `bs-tags.js`
- 

### 2. Write QHTML in a `<q-html>` tag

```html
<q-html>
  h1 { text { Hello QHTML } }
  p { text { Your first QHTML render is running. } }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <h1>Hello QHTML</h1>
  <p>Your first QHTML render is running.</p>
</q-html>
```

## 2. Core Syntax

### Elements and nesting

```qhtml
<q-html>
  div {
    h2 { text { Product } }
    p  { text { Lightweight UI syntax. } }
  }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <div>
    <h2>Product</h2>
    <p>Lightweight UI syntax.</p>
  </div>
</q-html>
```

### Selector chains (creates nested elements)

```qhtml
<q-html>
  div,section,h3 { text { Nested } }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <div><section><h3>Nested</h3></section></div>
</q-html>
```


### Class and id shorthand

```qhtml
<q-html>
  div#main.card {
    p { text { Card body } }
  }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <div id="main" class="card">
    <p>Card body</p>
  </div>
</q-html>
```

Multiple selectors with shorthand:

```qhtml
<q-html>
  div#my-id.my-class,span.my-class,h2#id2 { hello world }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <div id="my-id" class="my-class">
    <span class="my-class">
      <h2 id="id2">hello world</h2>
    </span>
  </div>
</q-html>
```

Component instances also support selector shorthand:

```qhtml
q-component my-card { div { text { Card } } }
my-card#card-1.primary { }
```

### Attributes

```qhtml
<q-html>
  a {
    href: "https://example.com"
    target: "_blank"
    text { Open Example }
  }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <a href="https://example.com" target="_blank">Open Example</a>
</q-html>
```

### `text`, `html`, and `style` blocks

```qhtml
<q-html>
  p {
    style { font-size: 20px; margin: 0; }
    text { Plain text content }
  }
  div { html { <strong>Real HTML fragment</strong> } }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <p style="font-size: 20px; margin: 0;">Plain text content</p>
  <div><strong>Real HTML fragment</strong></div>
</q-html>
```


## 6. Components

`q-component` defines a runtime host element with:

- `q-property` fields
- `function ... {}` methods on `this.component`
- `q-signal ...` signals on `this.component`
- `q-alias ... { ... }` computed alias properties on `this.component`
- `slot { name }` placeholders for projection

### Minimal component with properties and a slot

```qhtml
<q-html>
  q-component app-card {
    q-property { title }
    div {
      h3 { text { ${this.component.title} } }
      slot { body }
    }
  }

  app-card {
    title: "Welcome"
    body { p { text { Projected content. } } }
  }
</q-html>
```

### `q-component` instantiation (typed named-instance syntax)

Use this form when you want an in-scope reference handle:

```qhtml
q-component q-cart {
  q-property total: "0.00"
}

q-cart myCart { total: "39.99" }

button {
  text { Print total }
  onclick {
    console.log(myCart.total); // "39.99"
  }
}
```

This is the canonical instance form:
- Definition: `q-component <type> { ... }`
- Instantiation with handle: `<type> <name> { ... }`

### Dot walking

Dot walking lets you dereference named instances and their fields directly in declarative expressions.

```qhtml
q-component catalog-store {
  q-property title: "Main Catalog"
  q-property currency: "USD"
}

catalog-store store1 { }

q-component product-card {
  q-property label: store1.title
  q-property unit: store1.currency
}

product-card card1 {
  div { text { ${card1.label} (${card1.unit}) } }
}
```

Valid usage patterns:
- `<instanceName>.<property>`
- `<instanceName>.<property>.<nestedProperty>`
- chained use inside `${...}` and property defaults

Use dot walking for declarative wiring between named instances instead of selector-based lookup code.

### Scope and context for named instances

Named instances resolve by scope/context, not by global selector lookup. A reference is valid only where that name is in scope.

```qhtml
q-component comp-a { q-property value: "hello" }
comp-a rootA { }

q-component comp-b {
  // valid: rootA is in an outer/available scope
  q-property fromRoot: rootA.value
}
comp-b rootB { }

q-component parent-scope {
  comp-a nestedA { value: "inside-parent" }
}
parent-scope p1 { }
```

Practical rule:
- Prefer direct named-instance references inside the same valid scope.
- Use selectors only for generic DOM traversal tasks, not for routine component-to-component wiring.

### `q-property` syntax

```qhtml
q-component my-comp {
  q-property title
  q-property selected: true
}
```

### `q-property` reference defaults (bound path syntax)

Declared properties can reference another in-scope property path directly:

```qhtml
q-component comp1 { q-property prop1: "something" }
comp1 mycomp1 { prop1: "testing 1 2 3" }

q-component comp2 extends comp1 {
  q-property prop2: mycomp1.prop1
}
comp2 mycomp2 { prop1: "testing" }
```

Behavior:
- `mycomp2.prop1` resolves to `"testing"`.
- `mycomp2.prop2` resolves to `"testing 1 2 3"`.
- Direct reads and inline interpolation resolve consistently:
  - `console.log(mycomp2.prop2)`
  - `${mycomp2.prop2}`

Use this for simple declarative value wiring between named instances without extra query/select boilerplate.

### `on<Property>Changed` auto-signals

Each declared `q-property` automatically exposes a changed signal handler name in the form `on<Property>Changed`.

```qhtml
q-component counter-box {
  q-property count: 0

  onCountChanged {
    console.log("new count =", event.detail.params.value);
  }

  function increment() {
    this.count = Number(this.count) + 1;
  }
}
```

Notes:
- `onCountChanged` fires only when `count` changes to a different value.
- Payload is available at `event.detail.params.value` and `event.detail.args[0]`.
- Each declared property also gets an implicit runtime signal function (`countChanged`, `titleChanged`, etc), so you can use `.connect(...)` in addition to `on<Property>Changed`.
- `on<Property>Changed` matching is case-insensitive (`oncountchanged`, `onCountChanged`, `onCoUnTcHaNgEd` all work).

### `q-array` and `q-map` as property values

You can assign typed array and map values directly to component properties. `q-array` becomes a JavaScript array and `q-map` becomes a plain JavaScript object on the mounted component instance.

#### Inline property assignment

```qhtml
q-component my-comp {
  q-property mydivs: q-array { "hello world", 5, q-array { "multi-dimensional", 4 } }
  q-property settings: q-map {
    title: "Example"
    count: 2
    flags: q-array { true, false }
    nested: q-map { enabled: true }
  }
}

my-comp { }
```

At runtime:

- `document.querySelector("my-comp").mydivs[0]` returns `"hello world"`
- `document.querySelector("my-comp").mydivs[2]` returns `["multi-dimensional", 4]`
- `document.querySelector("my-comp").settings.nested.enabled` returns `true`

#### Named declarations and reuse

Named `q-array` and `q-map` declarations still work, and you can assign them to declared component properties by name.

```qhtml
q-array shared-items { "hello world", 5, q-array { "multi-dimensional", 4 } }
q-map shared-settings {
  title: "Shared config"
  count: 2
  nested: q-map { enabled: true }
}

q-component my-comp {
  q-property mydivs: shared-items
  q-property settings: shared-settings
}

my-comp { }
```

#### Accessing them from JavaScript

```qhtml
q-component my-comp {
  q-property mydivs: q-array { "hello world", 5, q-array { "multi-dimensional", 4 } }
  q-property settings: q-map { title: "Example", nested: q-map { enabled: true } }
}

my-comp { }

button {
  text { Show values }
  onclick {
    const comp = document.querySelector("my-comp");
    alert(comp.mydivs[0]);
    console.log(comp.mydivs[2]);
    console.log(comp.settings.nested.enabled);
  }
}
```

`property <name>: ...` also works as shorthand inside `q-component`, while `property <name> { ... }` still means "bind this child node to a component property".

### `q-model` basics

`q-model` normalizes model data and exposes a consistent runtime API (`count()`, `at()`, `values()`, `add()`, `insert()`, `remove()`, `subscribe()`) regardless of source shape.

```qhtml
q-model my-model { q-array { 5, 10 } }

onReady {
  var model = this["my-model"];
  model.add(15);
  console.log(model.count());  // 3
  console.log(model.at(1));    // 10
  console.log(model.values()); // [5, 10, 15]
}
```

### `q-model-view` basics

`q-model-view` renders its child template once per model entry using the alias defined by `as { ... }`.

```qhtml
q-array my-source { 5, 10, q-map { name: "tom" } }

q-model-view {
  q-model { my-source }
  as { item }
  div { text { ${item && item.name ? item.name : item} } }
}
```

### `for` keyword (template iteration)

Use `for` when you want inline repeated template expansion without creating a `q-model-view` node:

```qhtml
q-component list-demo {
  q-property items: q-array { "one", "two", "three" }
  ul {
    for (item in this.component.items) {
      li { text { ${item} } }
    }
  }
}
```

Accepted `source` inputs:

- q-array and JS arrays (for example `this.component.items`)
- q-map / plain object (iterates keys)
- `q-model` helpers such as `.values()` / `.keys()`
- function return values that evaluate to arrays/objects (for example `this.component.getItems()`)
- primitive values (treated as single-entry iteration)

Notes:

- `for` expression scope follows runtime inline expression rules.
- For component state, prefer explicit component references (`this.component.<name>`).

### `q-timer` (keyword-level timer)

`q-timer` is a named top-level construct that declares a runtime timer directly:

```qhtml
q-timer myTimer {
  interval: 3000
  repeat: true
  running: true
  onTimeout {
    alert("hello world");
  }
}
```

Behavior:
- `repeat: true` uses native `setInterval(...)`.
- `repeat: false` uses native `setTimeout(...)`.
- The named timer handle is exported globally as `window.<name>` (for example `window.myTimer`).
- The same named handle is also exposed to inline expression scope (for example `${myTimer}` in runtime-evaluated expressions).

Name collisions / overwrite behavior:
- If multiple `q-timer` declarations use the same name in the same mounted host, the **last declaration wins for the exported name** (`window.<name>` points to the last timer handle).
- Earlier same-name timers may still be running if they were already started; only the exported reference is overwritten.
- On host re-render/unmount, runtime-managed keyword timers for that host are cleared and re-created from current declarations.

Recommendation:
- Use unique timer names per host to avoid handle collisions.

### `q-canvas` (keyword-level canvas)

`q-canvas` declares a named canvas element and exports that handle by name:

```qhtml
q-canvas myCanvas {
  width: 320
  height: 180
}
```

You can draw manually through the exported context helper:

```qhtml
onReady {
  myCanvas.context.clearRect(0, 0, 320, 180);
  myCanvas.context.fillStyle = "rgba(16,185,129,0.9)";
  myCanvas.context.fillRect(20, 20, 120, 80);
}
```

Notes:

- `q-canvas <name>` exports the canvas handle as `window.<name>` and host-scoped `<name>`.
- `<name>.context` points to the `2d` rendering context for that specific canvas.
- Canvas rendering can be timer-driven (`q-timer`) or signal-driven depending on your component flow.

### `q-worker` (component-level background worker)

`q-worker` can be declared inside a `q-component` to run worker methods off the main thread.

```qhtml
q-component worker-demo {
  q-property output: "waiting"

  q-worker cruncher {
    q-property nums: q-array { 1, 2, 3, 4 }
    q-signal finished(total)

    function sumAll() {
      var total = 0;
      for (var i = 0; i < this.nums.length; i += 1) {
        total = total + Number(this.nums[i] || 0);
      }
      this.finished(total);
      return total;
    }
  }

  onFinished {
    this.component.output = String(event.detail.params.total);
  }

  onReady {
    this.component.cruncher.sumAll().then(function(total) {
      this.component.output = String(total);
    }.bind(this));
  }
}
```

Notes:
- Worker methods return Promises.
- Worker `q-property` and `q-signal` declarations are supported in worker scope.
- Signals emitted from worker methods re-enter normal component signal handling (`on<Signal>` / `.connect(...)`).

### `q-tree-view`

`q-tree-view` consumes model data from the same `q-model` pipeline and renders nested branches/leaves with native `details/summary`. For the current end-to-end example, see `dist/demo.html`.

### `extends` syntax

Use `extends` when you want one component to inherit reusable behavior from another component instead of wrapping one component inside another.

Inherited component parts include:

- `q-property`
- `function ... { }`
- `q-signal`
- `q-alias`
- `onReady` and other lifecycle hooks
- `slot { ... }` placeholders
- template children / rendered markup

Child components are merged after parent components, so child methods and declarations with the same name win.

#### Single inheritance

```qhtml
q-component counter-base {
  q-property count: 0

  function increment() {
    this.count = Number(this.count) + 1;
    this.update(this.qdom().UUID);
  }
}

q-component counter-button extends counter-base {
  button {
    type: "button"
    onclick { this.component.increment(); }
    text { Count: ${this.component.count} }
  }
}

counter-button { }
```

Use single inheritance when one parent component already represents the exact reusable base behavior you want.

#### Multiple inheritance

```qhtml
q-component counter-base {
  q-property count: 0
  function increment() {
    this.count = Number(this.count) + 1;
    this.update(this.qdom().UUID);
  }
}

q-component hello-base {
  function hello() { alert("hello world"); }
}

q-component counter-toolbar extends counter-base extends hello-base {
  button {
    type: "button"
    onclick { this.component.increment(); }
    text { Count: ${this.component.count} }
  }

  button {
    type: "button"
    onclick { this.component.hello(); }
    text { Say Hello }
  }
}

counter-toolbar { }
```

Use multiple inheritance when you want to compose a new component from several reusable behavior blocks without adding extra wrapper components just to pass features through.

#### Merge order

```qhtml
q-component base-a {
  function label() { return "A"; }
}

q-component base-b {
  function label() { return "B"; }
}

q-component final-comp extends base-a extends base-b {
  function label() { return "child"; }
}
```

Merge order is left-to-right, then child last:

- `base-a`
- `base-b`
- `final-comp`

So in the example above, `final-comp.label()` returns `child`. If the child did not define `label()`, then `base-b.label()` would win over `base-a.label()`.

### `q-wasm` syntax (component-level WebAssembly bridge)

`q-wasm` is supported inside `q-component` and exposes `this.component.wasm` with:
- `ready` (Promise)
- `call(exportName, payload)`
- `terminate()`

```qhtml
q-component wasm-card {
  q-signal computed(result)

  q-wasm {
    src: "/wasm/demo.wasm"
    mode: worker
    awaitWasm: true
    timeoutMs: 5000
    maxPayloadBytes: 65536
    exports { init compute }
    bind {
      compute -> method runCompute
      compute -> signal computed
    }
  }

  onReady {
    this.component.wasm.ready.then(() => this.component.runCompute({ value: 7 }));
  }
}
```

Notes:
- `q-wasm` is valid only inside `q-component`.
- `mode: worker` is default; if worker mode cannot be used, runtime falls back to main thread.
- `allowImports { ... }` is supported in main-thread mode.

### Bind a named child node to a component property (`property <name> { ... }`)

This creates a real child node and assigns it to `this.component.<name>`.

```qhtml
q-component my-comp {
  property builder { q-builder { } }
  onReady { this.component.builder.setAttribute("data-bound", "1"); }
}
```

### `q-alias` syntax

```qhtml
q-component mycomp {
  q-alias myotherprop { return document.querySelector("#mydiv").myprop; }
}

q-component mytarget {
  q-property myprop: "hello world"
}

mytarget { id: "mydiv" }
mycomp {
  div { text { ${this.component.myotherprop} } }
}
```

### `q-macro` syntax (pre-parse inline expansion)

`q-macro` is source expansion, not a rendered node.  
It behaves like a reusable inline source generator.

```qhtml
q-macro badge {
  slot { label }
  return {
    span.badge { text { ${this.slot("label")} } }
  }
}

div {
  badge { label { hello world } }
}
```

### Scoped `${reference}` placeholders

Inside macro output, `${name}` resolves using the current scoped references (macro slots).

```qhtml
q-macro scoped-label {
  slot { value }
  return {
    p { text { value=${this.slot("value")} } }
  }
}

scoped-label {
  value { demo-ref }
}
```

Use `slot { name }` for raw slot insertion blocks, and `${name}` for inline placeholder insertion.

### Events and Lifecycle

#### Inline events

```qhtml
<q-html>
  button {
    text { Click }
    onclick { this.textContent = "Clicked"; }
  }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <button onclick="this.textContent = &quot;Clicked&quot;;">Click</button>
</q-html>
```

#### Lifecycle blocks

`onReady {}` runs after the host’s content is mounted.

```qhtml
<q-html>
  onReady { this.setAttribute("data-ready", "1"); }
  div { text { Host ready hook executed. } }
</q-html>
```

Resulting HTML:

```html
<q-html data-ready="1">
  <div>Host ready hook executed.</div>
</q-html>
```

#### Scoped `$()` selector shortcut

Use `$("<selector>")` inside QHTML runtime JavaScript to query within the current `<q-html>` root only.

- `$("#sender")` is equivalent to `this.component.qhtmlRoot().querySelector("#sender")` (or closest `<q-html>` root).
- For global page lookup, use `document.querySelector(...)`.

```qhtml
q-component notifier {
  function notify(msg) { this.setAttribute("data-msg", msg); }
  onReady { $("#sender").sendSignal.connect(this.component.notify) }

}

q-component sender {
  q-signal sendSignal(message)

}
```

## Styles and Themes

`q-style` + `q-theme` are the preferred styling model for new code.

### `q-style` with class import (`q-style-class`)

`q-style-class` lets a style definition add CSS classes and inline properties together.

```qhtml
q-style panel-style {
  q-style-class { w3-container w3-round-large }
  backgroundColor: #e0f2fe
  color: #0c4a6e
}
```

Apply it directly:

```qhtml
panel-style,div { text { Styled panel } }
```

Or through a theme rule:

```qhtml
q-theme app-theme {
  .panel { panel-style }
}
```

Notes:
- `q-style-class` merges class names into the element `class` attribute.
- Inline `q-style` declarations are still applied via `style=""`.
- If both class CSS and inline declarations target the same property, inline wins.

### Basic reusable style

```qhtml
q-style panel {
  backgroundColor: #eff6ff
  color: #1e293b
  border: 1px solid #93c5fd
}
```

### Apply style directly in selector chain

```qhtml
panel,div { text { Styled panel } }
```

### Use `q-style-class` for utility-class composition

```qhtml
q-style card-shell {
  q-style-class { w3-card w3-round-large w3-padding }
  borderColor: #cbd5e1
}
```

### Theme maps selectors to styles

```qhtml
q-style title-accent { color: #1d4ed8 }
q-style body-muted   { backgroundColor: #64748b }

q-theme article-theme {
  h3 { title-accent body-muted }
  p  { body-muted }
}
```

### `q-default-theme` fallback layer

`q-default-theme` is a fallback theme. It applies first, and any conflicting `q-theme` rules in scope replace it.

```qhtml
q-style panel-base { backgroundColor: #eef3fb color: #0f172a }
q-style panel-override { backgroundColor: #ffedd5 color: #7c2d12 }

q-default-theme card-theme {
  .card { panel-base }
}

q-theme card-demo-theme {
  card-theme { }
  .card { panel-override }
}
```

### Scoped theme application

```qhtml
article-theme {
  div {
    h3 { text { Title } }
    p  { text { Description } }
  }
}
```

### Compose themes

```qhtml
q-theme base-theme {
  button { button-base }
}

q-theme admin-theme {
  base-theme { }
  .danger { button-danger }
}
```

### Override class CSS with inline style declaration

```qhtml
q-style button-base {
  q-style-class { w3-button w3-round }
  backgroundColor: #0f766e
  color: #ffffff
}
```

Notes:
- `q-style-class` merges into the element `class` attribute.
- Inline declarations from `q-style` are written to `style=""` and win on property conflicts.
- Themes can be declared once and reused as lightweight styling scopes.

## 4. State with `q-script` (`q-bind` alias/deprecated)

`q-bind` is deprecated and treated the same as `q-script`.
Use `q-script` for assignment expressions.

### Bind to text

Use assignment-form `q-script` with `q-property`.
```qhtml
q-component my-component {
  q-property myprop: q-script { return "bound-" + (2 + 3) }
  div { text { ${this.component.myprop} } }
}

my-component { }
```

## 5. `q-script`

`q-script {}` runs JavaScript and replaces itself with the returned value:

- If the return looks like QHTML, it is parsed as QHTML.
- Otherwise, it becomes a text node.

### Inline replacement

```qhtml
<q-html>
  div {
    q-script { return "p { text { Inserted by q-script } }"; }
  }
</q-html>
```

### Assignment form

```qhtml
<q-html>
  div {
    data-note: q-script { return "n:" + (4 + 1) }
    text { q-script { return "script-inline"; } }
  }
</q-html>
```

## 6. `${expression}` inline expressions

`${expression}` is inline expression syntax for string content.

- It resolves when the final HTML string value is rendered.
- It is not a watcher by itself.
- Re-evaluation is explicit (for example, manual setter calls and explicit update flows).

### Works in rendered text/attribute strings

```qhtml
<q-html>
  div {
    title: "Current user: ${window.currentUser}"
    text { Hello ${window.currentUser} }
  }
</q-html>
```

```qhtml
q-component user-card {
  q-property name: "Guest"
  h3 { text { ${this.component.name} } }
}
```

### Macro slot placeholders (scoped)

```qhtml
q-macro badge {
  slot { label }
  return { span { text { ${label} } } }
}
```

### Cannot be used for keyword-level symbols

```qhtml
q-component ${dynamicName} { }     // invalid
q-keyword ${alias} { q-component } // invalid
${tagName} { text { hi } }         // invalid
```

### Deprecated alias (`q-bind`)

```qhtml
q-component counter-label {
  q-property label: q-bind { return "Count: " + window.count; } // same as q-script (deprecated alias)
  div { text { ${this.component.label} } }
}
```


### `q-keyword` syntax (scoped keyword aliasing)

`q-keyword` remaps a keyword head inside the current scope.

```qhtml
q-keyword component { q-component }

component card-box {
  div { text { hello } }
}

card-box { }
```

Scope is local to the parent block and inherited by children:

```qhtml
div {
  q-keyword box { span }
  box { text { inside } }  // -> span { ... }
}

box { text { outside } }    // unchanged (no alias in this scope)
```

Invalid direct aliasing is rejected:

```qhtml
q-keyword a { q-component }
q-keyword b { a }   // error: alias cannot target another alias
```

* Note* it is still may be possible to design a system that loops forever using q-keword combined with other features.
* If you want to create that and freeze your web browser, there are only basic safe guards in place that do not recursively prevent such behavior  on all cases.

* Note * If you define your keyword as `#` or `.` or something like that, there may be some undesired artifacts rendered into the HTML DOM output. 

## 7. Signals

There are two signal forms: component signals (function-style) and QHTML signal definitions.

### 7.1 Component signals (function-style)

```qhtml
<q-html>
  q-component sender-box {
    q-signal sent(message)
    button {
      text { Send }
      onclick { this.component.sent("Hello"); }
    }
  }

  q-component receiver-box {
    function onMessage(message) { this.querySelector("#out").textContent = message; }
    sender-box { id: "sender" }
    p { id: "out" text { Waiting... } }
    onReady { this.querySelector("#sender").sent.connect(this.component.onMessage); }
  }

  receiver-box { }
</q-html>
```

### 7.2 `q-signal name { ... }` definitions (slot payload signals)

Defining `q-signal menuItemClicked { ... }` lets you “call” it by writing `menuItemClicked { ... }`.
This dispatches a DOM `CustomEvent` named `menuItemClicked` with `event.detail.slots` and `event.detail.slotQDom`.

```qhtml
<q-html>
  q-signal menuItemClicked {
    slot { itemId }
  }

  div {
    menuItemClicked { itemId { A } }
    p { text { signal-syntax-ok } }
  }
</q-html>
```

### 7.3 Signal use cases (direct emit, imperative connect, declarative `q-connect`)

```qhtml
<q-html>
  q-component sender-box {
    q-signal sent(message)
    function sendNow(message) {
      this.sent(message); // direct emit
    }
  }

  q-component receiver-box {
    q-property value: "waiting"
    function onMessage(message) {
      this.component.value = message;
    }
    div#out { text { ${this.component.value} } }
  }

  sender-box sender1 { id: "sender1" }
  receiver-box receiver1 { id: "receiver1" }

  // declarative connect sugar
  q-connect { sender1.sent receiver1.onMessage }

  button {
    text { Send via q-connect wiring }
    onclick { sender1.sendNow("hello-from-q-connect"); }
  }

  sender-box sender2 { id: "sender2" }
  receiver-box receiver2 { id: "receiver2" }

  onReady {
    // imperative connect
    sender2.sent.connect(receiver2.onMessage);
  }

  button {
    text { Send via imperative connect }
    onclick { sender2.sendNow("hello-from-connect"); }
  }
</q-html>
```

Use this rule of thumb:
- Use direct emit (`this.sent(...)`) inside the sender component.
- Use `.connect(...)` when wiring at runtime in JS lifecycle/event logic.
- Use `q-connect { ... }` for declarative-only wiring.

## 8. `q-rewrite`

`q-rewrite` is a pre-parse macro that expands calls like `name { ... }` before the rest of QHTML is parsed.

### Template-style rewrite

```qhtml
q-rewrite pill {
  slot { label }
  span { class: "pill" slot { label } }
}

pill { label { text { OK } } }
```

### Return-style rewrite (`this.qdom().slot("name")`)

```qhtml
q-rewrite choose-class {
  slot { active }
  return {
    q-script {
      return this.qdom().slot("active").trim() === "true" ? "on" : "off";
    }
  }
}

div { class: choose-class { active { true } } }
```

## 9. QDOM API

Mounted `<q-html>` elements expose `.qdom()` (the source-of-truth tree). Mutate QDOM, then call `.update()` to re-render.
Any HTMLElement inside a mounted tree can also call `.qdom()`, which resolves using the closest `q-component` host when present, then the nearest `<q-html>` host.

When `q-keyword` aliases are active during parse, generated QDOM nodes include a `keywords` map (effective alias table at parse time).

### Find and append

```html
<q-html id="page">
  ul { id: "items" }
</q-html>

<script>
  const host = document.querySelector("#page");
  const root = host.qdom();
  const list = root.find("#items");
  list.appendNode(list.createQElement("li", { textContent: "Added via qdom()" }));
  host.update();
</script>
```

### Replace a node with QHTML

```js
const host = document.querySelector("q-html");
host.qdom().find("#items").replaceWithQHTML("ul { li { text { Replaced } } }");
host.update();
```

### `qdom().rewrite(...)` (QDOM-side equivalent of a `q-rewrite`)

```js
document.querySelector("q-html").qdom().find("#items").rewrite(function () {
  return "div { class: 'box' text { Rewritten } }";
});
document.querySelector("q-html").update();
```

### Serialize / Deserialize

```js
const host = document.querySelector("q-html");
const serialized = host.qdom().serialize();

host.qdom().deserialize(serialized, false); // append
host.update();

host.qdom().deserialize(serialized, true);  // replace
host.update();
```

### Component instance property helpers

```js
const comp = document.querySelector("my-component");
const qnode = comp.qdom();                  // component instance qdom
const props = qnode.properties();           // shallow copy of current props
const val = qnode.getProperty("title");     // single prop lookup
qnode.property("title", "New title");       // set via helper
comp.update();                              // re-render this component scope
```

### Scoped vs full updates

```js
this.component.update();        // this component subtree
this.component.root().update(); // whole <q-html>
```

## 10. Builder and Editor

- `dist/demo.html` is the component usage gallery.
- `q-editor` supports authoring live QHTML and previewing output.
- `q-builder` provides visual inspect/edit workflows on mounted `<q-html>` content.

### `<q-editor>` (inline QHTML source)

`<q-editor>` takes QHTML as literal text content (not nested `<q-html>`).

```html
<q-editor>
  h3 { text { Hello from q-editor } }
</q-editor>
```

### `q-import { ... }` (include QHTML files)

`q-import` records import metadata in the host QDOM (`meta.imports` / `meta.importCacheRefs`) and resolves definitions from the import cache at runtime. Imported component/template/signal definitions become available without inlining full imported source into the host QDOM.

```qhtml
<q-html>
  q-import { q-components/q-modal.qhtml }
  q-modal { title { text { Hello } } body { text { Modal body } } }
</q-html>
```

### `q-template` (compile-time pure HTML)

`q-template` instances render their template nodes directly (no runtime host element, no `this.component`).

```qhtml
<q-html>
  q-template badge {
    span { class: "badge" slot { label } }
  }
  badge { label { text { New } } }
</q-html>
```

## 11. Debug Tips

```js
window.QHTML_RUNTIME_DEBUG = true;
```

```js
document.querySelector("q-html").update();
```

```js
document.querySelector("q-html").invalidate({ forceBindings: true });
```

### `q-logger` (scoped debug logging)

```qhtml
q-component my-comp {
  q-logger { q-signal q-property }
  q-property count: 0
  q-signal ping(value)
}
```

- `q-logger` scope is lexical:
  - inside a `q-component` definition: applies to all instances of that component
  - inside a specific instance block: applies to that instance only
- Supported categories: `q-property`, `q-signal`, `q-component`, `function`, `slot`, `model`, `instantiation`, `all`

## 12. Optional Tag Libraries (`w3-tags.js`, `bs-tags.js`) [DEPRECATED]

These libraries are now obsolete as their functionality has been fully merged into the core modules through various means.  
While they will continue to work, it is recommended to use q-style and q-theme instead for simplicity and ease of implementation. 

But for those who want to use the obsolete libraries:
These scripts register custom elements like `w3-card` and `bs-btn` so you can use them as tag names. They apply CSS classes to their first non-`w3-*` / non-`bs-*` descendant and then remove the custom wrapper elements.

### W3CSS tags

```html
<link rel="stylesheet" href="w3.css" />
<script src="w3-tags.js"></script>
```

```qhtml
<q-html>
  w3-card,w3-padding {
    div { text { This div receives W3 classes. } }
  }
</q-html>
```

#### q-style equivalent
```qhtml
 <q-html>
   q-style padded-card {
      q-style-class { w3-card w3-padding }
   }
   q-theme main-theme {
     div { padded-card }
   }
  main-theme { div { text { This div receives W3 classes } } }
</q-html>
```

### Bootstrap tags

```html
<link rel="stylesheet" href="bs.css" />
<script src="bs-tags.js"></script>
```

```qhtml
<q-html>
  bs-btn,bs-btn-primary {
    button { text { Primary button } }
  }
</q-html>
```

## 13. Module READMEs

- `modules/qdom-core/README.md`
- `modules/qhtml-parser/README.md`
- `modules/dom-renderer/README.md`
- `modules/qhtml-runtime/README.md`
- `modules/release-bundle/README.md`

## Escape sequences

### Escaping `{` and `}` in block content

Use `\{` and `\}` when you want literal braces inside block bodies.

```qhtml
<q-html>
  div {
    text { hello \} world }
  }
</q-html>
```

Resulting HTML:

```html
<q-html>
  <div>hello } world</div>
</q-html>
```

# Past Changes
## Whats New in v6.1.9

- Added `q-callback` declarations for lazy, pass-by-reference callback flow in QHTML and component scope.
- Added typed named component instances (`mycomp myinstance { ... }`) with lexical alias scope and direct reference support.
- Added runtime callback helpers `QCallback(...)` and `qhtml(...)` for cross-component callback invocation and QHTML-fragment returns.
- Added `QArray(...)` constructor and expanded `QModel` assignment behavior for JS-to-QHTML typed model property assignment.
- Improved `for (alias in source)` runtime source resolution (component-scoped paths/method chains) and iterable coercion.
- Improved queued runtime/event-loop behavior:
  - signal routing uses UUID-targeted subscriber delivery
  - timer enqueue dedupe (`pending` guard) reduces timeout queue spam
  - queue turn order now prioritizes existing queued work before adding due timers

## Whats New in v6.1.8

- Added initial `q-canvas` keyword support (`q-canvas <name> { ... }`) for named canvas declarations.
- Added named canvas handle export so canvas instances are available by name on host/global scope.
- Added `myCanvas.context` helper for direct/manual canvas API drawing (`2d` context access).
- Added/updated `dist/test.html` q-canvas animation coverage (including transparent drawing and start/stop controls).
- Updated docs with `q-canvas` usage patterns.

## Whats New in v6.1.7

- Added `for (alias in source) { ... }` keyword-level iteration syntax.
- Added runtime support for `for` source evaluation through inline expression scope (including component-scoped references like `this.component.items`).
- Added `dist/test.html` coverage for multiple `for` use cases (array, object/map-style keys, function-returned arrays, primitive source).
- Updated docs with `for` syntax and accepted source patterns.

## Whats New in v6.1.6

- Added declarative `q-logger { ... }` support with scoped categories for runtime debugging (`q-property`, `q-signal`, `q-component`, `function`, `slot`, `model`, `instantiation`, `all`).
- Added and expanded `dist/test.html` coverage for logger categories and multi-scope logger behavior.
- Improved `qdom().qmap(...)` keyword extraction for component metadata (including `q-property` declarations) and instance mapping behavior.
- Stabilized parser/runtime updates around `q-model`, `q-model-view`, and signal/property change flows; current non-deprecated tests pass.

## Whats New in v6.1.5

- Fixed signal callback host binding so `.connect(function(){ ... })` now runs against the live component instance (`this`) during dispatch.
- Fixed `on<signal>` attribute handling in component definitions to resolve case-insensitively and route through the same signal `.connect(...)` path (with DOM-event fallback for non-signal events).
- Improved `on<Property>changed` normalization so lowercase/mixed-case handlers (for example `onmypropchanged`) map correctly to `mypropChanged`.
- Improved queued-mode declarative signal subscription timing by deferring registration until component UUID availability, and preserving cleanup metadata for detach/replace.
- Updated `dist/test.html` test 49 to use a lower-overhead `q-model-view` randomization scenario with explicit `Start timers` control.
- Marked unstable test 39 as deprecated; active test board reports all current non-deprecated tests passing.

## Whats New in v6.1.4

- Deprecated `q-bind`; assignment usage is now treated as an alias of `q-script`.
- Declared `q-property` setter changes no longer auto-trigger component/host invalidate-update cycles; refresh/update is explicit.
- `q-property` now emits per-property signals on value change: `on<Property>Changed` (for example `onCountChanged`).
- Property-changed signal payload is value-first (`event.detail.params.value` / `event.detail.args[0]`) and does not emit when the assigned value is unchanged.
- Generic `q-property-changed` event wiring is replaced by per-property signal dispatch.
- Runtime event loop mode now defaults to `queued`; set `window.QHTML_EVENT_LOOP_MODE = "compat"` before `qhtml.js` to opt out.
- Updated runtime/parser/docs to reflect canonical assignment binding semantics around `q-script`.
- Refreshed `dist/test.html` into a simplified board that runs first-pass checks on `QHTMLContentLoaded` and re-checks every 5 seconds.
- Kept binding-deprecated test numbers in place with explicit `test has been deprecated` markers.
- Added `q-timer <name> { ... }` as a top-level language construct (native runtime timer declaration) instead of component-based timer usage.

## Whats New in v6.1.3

- Added typed `q-array` and `q-map` property values, including nested anonymous container declarations on the right-hand side of property assignments.
- Named `q-array ... { }` and `q-map ... { }` declarations still work and can be assigned to component properties by name.
- Added `property <name>: <value>` shorthand inside `q-component`, while preserving `property <name> { ... }` as child-node binding syntax.
- Added `q-model` normalized model API support for `q-array`, `q-map`, and script-backed sources.
- Added `q-model-view` delegate rendering (`q-model { ... }` + `as { item }`) for model-driven UI blocks.
- Updated `q-tree-view` to use the model pipeline and native `details/summary` structure.

## Whats New in v6.1.0

- Added `q-component ... extends ...` inheritance support.
- Added multiple inheritance support with ordered merge behavior: `q-component child extends baseA extends baseB { ... }`.
- Extended components now inherit properties, methods, signals, aliases, lifecycle hooks, slots, and template children from all parent components.

## Whats New in v6.0.9

- Fixed q-editor QDom tab lag for large 40+ KB fragments by removing heavy JSON formatting from the display path and using lightweight raw output handling.
- Fixed qdom() updateing bug causing component instances to not have their own property scoping -- now each instance contains a unique property set which is accessible directly from any instance inheriting q-component definitions.
- `HTMLElement.prototype.qdom()` now resolves from the closest `q-component` context first (when available), then falls back to the nearest `<q-html>` host context.
- Added component-instance QDOM property helpers:
  - `componentInstanceQDom.properties()`
  - `componentInstanceQDom.getProperty(key)`
  - `componentInstanceQDom.property(key)`
  - `componentInstanceQDom.property(key, value)`


## Whats New in v6.0.8

- Aligned README examples with validated `dist/test.html` syntax patterns.
- Expanded `dist/test.html` coverage for QDOM operations and runtime update paths.
- Removed remaining legacy color-system documentation references in favor of `q-style` / `q-theme`.
- Added scoped selector shortcut `$("<css selector>")` for runtime script contexts (`onclick`, `onReady`, `q-bind`, `q-script`, component methods/aliases/properties).

## Whats New in v6.0.7.4

- Added `q-style`, `q-style-class`, and `q-theme` support for merging and building complex stylesheets with advanced theming capabilities (see section on Styles and Themes).
- Added `q-default-theme` for fallback theme layers. `q-default-theme` rules apply first, and conflicting `q-theme` rules override them.
- `q-style`, `q-style-class`, and `q-theme` are actively evolving and may change in future releases.
- Added component-level `q-wasm` for loading `.wasm` modules with method/signal bindings and worker-first execution.

## Whats New in v6.0.6

- Added `q-style-class` inside `q-style` for class + inline style composition.
- Added richer `q-theme` workflows:
  - selector-based style mapping
  - theme composition (`q-theme my-theme { base-theme { } ... }`)
  - scoped theme invocation on element trees
- Refactored component examples and q-components to favor `q-style` / `q-theme`.
- Updated `q-builder` style editing flow to focus on `q-style` and `q-theme` blocks.

## Whats New in v6.0.5

- Added `q-macro` compile-time inline expansion:
  - `q-macro my-macro { slot { in1 } return { div,span,${in1} { hello world } } }`
  - `my-macro { in1 { h3 } }` creates `<div><span><h3>hello world </h3></span></div>`
  - Invocations expand before parse (similar timing to `q-script` replacement, but macro output is plain qhtml expansion instead of javascript).
- Added scoped `${reference}` placeholders:
  - `${slotName}` resolves from current macro slot scope.
  - Intended for macro/rewrite scoped slot references.
- Added lazy `${expression}` inline runtime interpolation in rendered string contexts (text/attributes).
- Parser metadata now includes macro expansion info in `qdom.meta.qMacros` and `qdom.meta.macroExpandedSource`.
- Expanded styling syntax:
  - reusable `q-style` definitions
  - selector-driven `q-theme` style assignment
  - scoped theme application to subtrees

## Whats New in v6.0.4

- `q-keyword` scoped keyword aliasing: `q-keyword component { q-component }`.
- Alias scope is lexical (parent block + descendants), with child-scope override support.
- Alias mappings are stored on parsed QDOM nodes as `node.keywords`.
- Direct-only alias rules: aliases cannot point to other aliases.
- `tag#id.class` selector shorthand support finalized for elements and component instances.

## Whats New in v6.0.3

- `q-bind` evaluates with a DOM-capable runtime `this` (`closest`, `querySelector`, etc).
- `q-bind` evaluation is wrapped in runtime `try/catch` (binding failures log, page continues).
- Host `onReady` dispatch runs through the runtime callback queue (more reliable “ready” timing).
- Inline source ingestion preserves literal HTML children in `<q-html>` and `<q-editor>` source.
- Runtime logs are gated behind `window.QHTML_RUNTIME_DEBUG` (or `window.QHTML_DEBUG`).
- `q-property` for explicit component properties.
- Function-style component signals: `q-signal mySignal(a, b)` plus `.connect/.disconnect/.emit`.
- Component aliases: `q-alias name { return ... }` for computed host properties.
- `.qdom().deserialize(serialized, shouldReplaceQDom)` append-or-replace import flow.
- Scoped updates: `this.component.update()` and full host updates: `this.component.root().update()`.

## Whats New in v6.2.1

- Added `q-worker` as a first-class QHTML language construct inside `q-component` for background method execution.
- Added worker method proxy behavior so `worker.method()` returns a Promise and resolves back to component scope.
- Added worker-signal interoperability so worker methods can emit declared `q-signal` payloads that route back through normal signal handlers.
- Added direct reference-path property defaults for declared component properties (for example `q-property prop2: mycomp1.prop1`).
- Improved property reference consistency so direct JS reads (`mycomp2.prop2`) and inline interpolation (`${mycomp2.prop2}`) resolve the same bound value.

Language examples added this round:

```qhtml
q-component my-worker-host {
  q-worker myworker {
    q-property myprops: q-array { "A", "B", "C" }
    function dowork() {
      var rv = [];
      for (var i = 0; i < 3; i += 1) {
        rv.push(this.myprops[i]);
      }
      return rv.join(",");
    }
  }

  q-property result: "waiting"
  onReady {
    this.component.myworker.dowork().then(function(out) {
      this.component.result = out;
    }.bind(this));
  }
}
```

```qhtml
q-component comp1 { q-property prop1: "something" }
comp1 mycomp1 { prop1: "testing 1 2 3" }

q-component comp2 extends comp1 {
  q-property prop2: mycomp1.prop1
}
comp2 mycomp2 { prop1: "testing" }
```
