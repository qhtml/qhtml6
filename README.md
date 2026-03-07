Don't like q-component keywords? Rather call them a-block or something else?  
Now you can use our script builder to customize the keywords for your qhtml instance. [Click here to visit the script roller.](https://qhtml.github.io/qhtml6/dist/script-roller.html)

----------

# QHTML.js v6.0.8

QHTML is a compact language and runtime for building web UIs with readable block syntax, reusable components, signals, and live QDOM editing.

- Live demo: https://qhtml.github.io/qhtml6/dist/demo.html
- Dev testbed: https://qhtml.github.io/qhtml6/dist/test.html
- Language wiki and more examples: https://github.com/qhtml/qhtml.js

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



## 1. Quick Start

### Project setup

1. Clone qhtml6 github repository

```bash
git clone https://github.com/qhtml/qhtml6.git
```
2. Create new project directory and copy required files (linux)
  (Copies javascript files, css files, q-component files and codemirror for q-editor / q-builder)
```bash
mkdir my-project
cp qhtml6/dist/*.js /path/to/my-project/
cp qhtml6/dist/q-components* /path/to/my-project/ -R
cp qhtml6/dist/*.css /path/to/my-project/
cp qhtml6/dist/codemirror* /path/to/my-project/ -R
```
3. Create index.html in your project folder and spin up a HTTP Server
```bash
cp qhtml6/dist/demo.html /path/to/my-project/
cd /path/to/my-project
python -m http.server
```
4. Navigate to `http://127.0.0.1:8000/demo.html` in your web browser.

   
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


## 3. Events and Lifecycle

### Inline events

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

### Lifecycle blocks

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

### Scoped `$()` selector shortcut

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

### `q-property` syntax

```qhtml
q-component my-comp {
  q-property title
  q-property selected: true
}
```

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

## 4. State with `q-bind`

`q-bind` computes assignment values. After state changes, call `this.closest("q-html").update()`.

### Bind to text

You can use q-bind with q-properties in q-components to re-evaluate after calling `this.component.update()`.
```qhtml
q-component my-component {
  q-property myprop: q-bind { return "bound-" + (2 + 3) }
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

### Assignment form (like `q-bind`, but with `q-script`)

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
- It is not a `q-bind` watcher by itself.
- If you need re-evaluation on state updates, use `q-bind`.

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

### Use `q-bind` for reactive re-evaluation

```qhtml
q-component counter-label {
  q-property label: q-bind { return "Count: " + window.count; }
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

`q-import` loads another `.qhtml` file and expands it inline in the current source before parsing continues.

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
      q-style-class { w3-card w3-paddingg }
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

# Past Changes

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

## 13. Module READMEs

- `modules/qdom-core/README.md`
- `modules/qhtml-parser/README.md`
- `modules/dom-renderer/README.md`
- `modules/qhtml-runtime/README.md`
- `modules/release-bundle/README.md`
