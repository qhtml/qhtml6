# QHTML.js (Quick HTML)

This README is written for builders who want a quick, reliable way to author UI without a heavy framework. Examples below are ready to copy and run.

## For the demo click here <a href="https://qhtml.github.io/qhtml6/dist/demo.html">Live Demo</a>

----

## Highlights

- Write HTML structure with a clean, readable block syntax.
- Use standard HTML attributes and event handlers.
- Create custom web elements with simple one-line syntax - no more javascript classes and registering custom elements.
- Bind assignment values with `q-bind { ... }` (or assignment `q-script { ... }`) and refresh with `<q-html>.update()`.
- Inline HTML or plain text blocks where needed.
- Build reusable runtime components with slots and methods.
- Build compile-time templates that render to pure HTML.
- Declare and invoke lightweight signals with slot payloads using `q-signal`.
- Includes WYSIWYG q-component 

## Quick Start

1. Include the script

```html
<script src="qhtml.js"></script>
```

2. Write QHTML

```html
<q-html>
  div {
    class: "card"
    h1 { text { Hello QHTML } }
    p { text { Small markup, big results. } }
  }
</q-html>
```

3. Resulting HTML

```html
<div class="card">
  <h1>Hello QHTML</h1>
  <p>Small markup, big results.</p>
</div>
```

## Core Syntax

### Elements and nesting

QHTML uses a CSS-style block to describe nested elements.

QHTML:

```qhtml
<q-html>
  div {
    h2 { text { Title } }
    p { text { A short paragraph. } }
  }
</q-html>
```

HTML output:

```html
<div>
  <h2>Title</h2>
  <p>A short paragraph.</p>
</div>
```

### Attributes

Attributes use `name: "value"` inside a block.

QHTML:

```qhtml
<q-html>
  a {
    href: "https://example.com"
    class: "link"
    text { Visit Example }
  }
</q-html>
```

Runtime host output:

```html
<a href="https://example.com" class="link">Visit Example</a>
```

### Text and HTML and Style blocks

Use `text { ... }` for plain text and `html { ... }` for raw HTML. 
Also you can include `style { ... }` for element specific CSS  which can be written in normal CSS.

QHTML:

```qhtml
<q-html>
  p {
    style { 
      font-size: 24px; 
      margin-top: 4px;
    }
    text { This is plain text. }
  }
  p {
    html { <strong>This is real HTML.</strong> }
  }
</q-html>
```

HTML:

```html
<p style="font-size: 24px;margin-top:4px;">This is plain text.</p>
<p><strong>This is real HTML.</strong></p>
```

### Multi-tag shorthand

Use commas to nest multiple tags in a single line.

QHTML:

```qhtml
<q-html>
  p,center,a {
    href: "https://example.com"
    text { Visit Example }
  }
</q-html>
```

HTML:

```html
<p><center><a href="https://example.com">Visit Example</a></center></p>
```

## Events and lifecycle

### Inline event handlers

You can use the standard attribute form:

```qhtml
<q-html>
  button {
    onclick: "alert('Hello')"
    text { Click me }
  }
</q-html>
```

And you can also use the new `on*` block syntax for cleaner event bodies with support for multiple lines and other complex javascript:

QHTML:

```qhtml
<q-html>
  div {
    id: "mydiv"
    onclick {
      var md = document.getElementById("mydiv");
      md.innerHTML += "Clicked (again)";
    }
  }
</q-html>
```

This is converted into an `onclick` attribute. The handler body is compacted into a single line and double quotes are converted to single quotes so it fits inside the attribute safely.

HTML (conceptual):

```html
<div id="mydiv" onclick="var md = document.getElementById('mydiv'); md.innerHTML += 'Clicked (again)';"></div>
```



### Lifecycle ready hooks: `onReady {}`, `onLoad {}`, `onLoaded {}`

These three names are aliases for the same lifecycle behavior. They run after the node has been parsed and appended on the QHTML side.

- Inside an element block, `this` is that rendered element.
- At top-level (no parent element), `this` is the `<q-html>` host element.

QHTML:

```qhtml
<q-html>
  div {
    class: "card"
    onReady {
      console.log("element ready:", this.outerHTML)
    }
  }
</q-html>
```

Behavior:

- The `div` is rendered first.
- Then the lifecycle block executes.
- `this.outerHTML` logs the final rendered `<div ...>` markup.

Top-level host example:

```qhtml
<q-html>
  onLoad {
    console.log("host tag:", this.tagName)
  }
  p { text { Hello } }
</q-html>
```


## Components, templates, and signals (`q-component` vs `q-template` vs `q-signal`)

QHTML has two reusable-block modes:

- `q-component`: runtime custom-element host for functional behavior
- `q-template`: compile-time template that renders to pure HTML
- `q-signal`: event-like definition invoked with named slot payloads

### `q-component`: runtime host with methods and slot carriers

`q-component` remains a custom element in output (for valid hyphenated names), so instance methods and direct host queries work.

```qhtml
q-component nav-bar {
  function notify() { alert("hello") }

  div.nav-shell {
    h3 { slot { title } }
    div.links { slot { items } }
  }
}

nav-bar {
  id: "main-nav"

  title {
    text { Main Navigation }
  }

  items {
    ul {
      li { text { Home } }
      li { text { Contact } }
    }
  }
}
```

Runtime host shape:

```html
<nav-bar id="main-nav" q-component="nav-bar" qhtml-component-instance="1">
  <div class="nav-shell">
    <h3>Main Navigation</h3>
    <div class="links">
      <ul>
        <li>Home</li>
        <li>Contact</li>
      </ul>
    </div>
  </div>
</nav-bar>
```

Behavior:

- Top-level component `function` blocks become instance methods.
- Invocation attributes stay on the host (`id`, `class`, `data-*`, ARIA, etc.).
- Slot payload is normalized to `q-into` carriers.
- Single-slot rule: if the component defines exactly one slot, unslotted children are auto-wrapped into one `q-into` targeting that slot.

Single-slot normalization example:

```qhtml
q-component hello-box {
  div.frame { slot { main } }
}

hello-box {
  id: "box1"
  text { hello }
}
```

Runtime carrier output:

```html
<hello-box id="box1" q-component="hello-box" qhtml-component-instance="1">
  <div class="frame">hello</div>
</hello-box>
```

Runtime component methods and helper APIs are documented in the `JavaScript API` section at the end of this README.

### `this` context in runtime component code

When JavaScript runs inside a `q-component` instance, QHTML provides a runtime-aware `this` context that helps you reach the current element, its slot container, and the owning component instance without manual DOM traversal.

In runtime code paths (event handlers and runtime-evaluated script blocks), `this` behaves as follows:

- `this`: the current executing DOM element
- `this.slot`: the nearest slot container (`q-into`/`into`) for that element, or `null` if no slot context exists
- `this.component`: the nearest owning `q-component` instance, or `null` when no component instance is in scope

This is especially useful when projected slot content needs to call component methods.

```qhtml
q-component my-panel {
  function notify(msg) { alert(msg) }

  div.shell {
    slot { body }
  }
}

my-panel {
  body {
    div {
      onclick {
        this.component.notify("clicked from slot content")
      }
      text { Click me }
    }
  }
}
```

In this example:

- `this` is the clicked `div`
- `this.component` is the live `my-panel` instance
- `this.component.notify(...)` calls the component method directly

Example with all three context values:

```qhtml
q-component demo-box {
  slot { main }
}

demo-box {
  main {
    div {
      onclick {
        alert("this: " + this.tagName)
        alert("this.component: " + (this.component ? this.component.tagName : "null"))
        alert("this.slot: " + (this.slot ? this.slot.tagName : "null"))
      }
      text { Inspect context }
    }
  }
}
```

Scope and limitations:

- This context is for runtime `q-component` instances.
- Do not rely on `this.component`/`this.slot` inside `q-template` definitions.
- Do not rely on component context in markup that is not running inside a `q-component` instance.
- Outside component scope, `this.component` and `this.slot` are `null`.

### `q-template`: compile-time pure HTML (non-traceable output)

`q-template` composes slot content like a component, but compiles away to plain HTML.

```qhtml
q-template card-shell {
  function ignoredAtCompileTime() {
    console.log("ignored")
  }

  div.card {
    h4 { slot { heading } }
    div.body { slot { body } }
  }
}

card-shell {
  heading { text { Profile } }
  body { p { text { This is pure HTML output } } }
}
```

Rendered HTML:

```html
<div class="card">
  <h4>Profile</h4>
  <div class="body">
    <p>This is pure HTML output</p>
  </div>
</div>
```

Behavior:

- `function` blocks in `q-template` are ignored and produce a warning.
- No slot/component trace markers are preserved from template expansion.
- Expansion is one-way; resulting HTML is not reverse-mapped back to template slot/component sources.
- If nested `q-component` instances are inside a template expansion, those instances still remain runtime custom-element hosts.

### Choosing between them

- Use `q-component` when you need runtime behavior (`function` methods, direct instance control, host-level state).
- Use `q-template` for structure-only composition that should compile down to pure HTML output.
- Default to `q-template` for reusable layout shells, then add `q-component` only where runtime behavior is required.

### `q-signal`: declarative signal payload shape

Use `q-signal` to declare a named signal with slot names, then invoke it by filling those slots.

```qhtml
q-signal menuItemClicked {
  slot { uuid }
  slot { label }
}

menuItemClicked {
  uuid { text { abc-123 } }
  label { text { Rename } }
}
```

Runtime behavior:

- Signal invocation does not render visible DOM output.
- It dispatches:
  - `q-signal` with payload in `event.detail`
  - a named event matching the signal id (for example `menuItemClicked`)
- Slot payloads are available on:
  - `event.detail.slots`
  - `event.detail.slotQDom`


### Single-slot injection

QHTML:

```qhtml
q-component label-pill {
  span.pill {
    slot { label }
  }
}

label-pill {
    text { New }
}
```

HTML:

```html
<label-pill q-component="label-pill" qhtml-component-instance="1">
  <span class="pill">New</span>
</label-pill>
```

### Nested projection through another component

This example wraps content across two components by targeting a single slot.

QHTML:

```qhtml
q-component inner-box {
  div {
    slot { inner-slot }
  }
}
q-component outer-frame {
  div {
    inner-box {
      inner-slot {
        slot { outer-content }
      }
    }
  }
}



outer-frame {
  outer-content {
    p { text { Wrapped twice } }
  }
}



```

Runtime host output:

```html
<outer-frame q-component="outer-frame" qhtml-component-instance="1">
  <div>
    <inner-box q-component="inner-box" qhtml-component-instance="1">
      <div>
          <p>Wrapped twice</p>
      </div>
    </inner-box>
  </div>
</outer-frame>

```

## Shorthand syntax

### Dot-class tags

You can attach classes directly to tags with dot notation (works for components too). Classes are merged with any `class: "..."` property.

QHTML:

```qhtml
div.someclass.anotherclass,span.thirdclass {
  text { hello world }
}
```

HTML:

```html
<div class="someclass anotherclass">
  <span class="thirdclass">hello world</span>
</div>
```

### Slot definitions

Slot blocks accept shorthand forms:

```qhtml
q-component my-component {
  slot { my-slot1 }
  slot { my-slot2 }
  slot { my-slot3 }
}
```

### Slot placeholders and injection

```qhtml
q-component my-component {
  div { slot { my-slot } }
}
```

### Slot injection shorthand

When a component defines slots, you can inject by naming a slot block directly in the instance:

```qhtml
q-component my-component {
  slot { my-slot }
}

my-component {
  my-slot {
    text { hello world }
  }
}
```


## `q-import` (external QHTML includes)

Use `q-import { ... }` to include QHTML from another file before normal parsing continues.

Rules:

- The import path inside `{}` must be raw text (not quoted).
- Imports are resolved before component/slot/text transformations.
- Initial rendering uses a blocking import-first phase:
  - Phase 1: preload/resolve all `q-import` trees for discovered `<q-html>` hosts.
  - Phase 2: run preprocessing, component expansion, and final render.
- If a `render()` call happens while the document is still loading, it waits for the initial import barrier.
- Imports are recursive.
- Recursive expansion is capped at 100 imports per render pass.
- Imported source is cached by URL, so repeated imports do not re-fetch the same file.
- Imported files must be QHTML fragments (not full `<q-html>...</q-html>` wrappers).

Basic example:

```qhtml
<q-html>
  div {
    q-import { ./partials/card.qhtml }
  }
</q-html>
```

If `./partials/card.qhtml` contains:

```qhtml
section.card {
  h3 { text { Imported title } }
  p { text { Imported body } }
}
```

it is inlined before render, producing normal HTML as if it were written directly in place.

Recursive example:

```qhtml
<q-html>
  q-import { ./pages/home.qhtml }
</q-html>
```

`home.qhtml` can itself contain more `q-import { ... }` blocks. The engine keeps expanding recursively until no imports remain or the 100-import safety cap is reached.

## `q-components.qhtml` bundle

`q-components.qhtml` is the component-bundle entrypoint. Instead of keeping all component definitions in one large file, it imports grouped files:

- `q-components/q-modal.qhtml`
- `q-components/q-sidebar.qhtml`
- `q-components/q-form.qhtml`
- `q-components/q-grid.qhtml`
- `q-components/q-tabs.qhtml`
- `q-components/q-popup-menu.qhtml`
- `q-components/q-tech-tag.qhtml` (currently a placeholder file with no exported QHTML tags)

Use it like this:

```qhtml
<q-html>
  q-import { q-components.qhtml }
  ...
</q-html>
```


### `q-sidebar` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-sidebar {
    id: "left-sidebar"
    div.w3-padding {
      h3 { text { Sidebar title } }
      p { text { Sidebar content goes here. } }
    }
  }

  button {
    text { Show sidebar }
    onClick { document.querySelector("#left-sidebar").show(); }
  }

  button {
    text { Hide sidebar }
    onClick { document.querySelector("#left-sidebar").hide(); }
  }
</q-html>
```

### `q-form`, `q-input`, `q-textarea`, `q-submit` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-form {
    q-input {
      type: "text";
      placeholder: "Your name";
    }

    q-textarea {
      text { Tell us more... }
    }

    q-submit {
      text { Send }
      onClick { alert("Submitted"); }
    }
  }
</q-html>
```

### `q-grid`, `q-grid-cell` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-grid {
    q-grid-cell.w3-half {
      div.w3-card.w3-padding { text { Left cell } }
    }
    q-grid-cell.w3-half {
      div.w3-card.w3-padding { text { Right cell } }
    }
  }
</q-html>
```

### `q-popup-menu` / `q-context-menu` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  div {
    id: "menu-zone"
    style { min-height: 120px; border: 1px dashed #94a3b8; padding: 8px; }
    p { text { Right-click inside this box. } }

    q-context-menu {
      id: "ctx-usage"
      q-popup-text { text { Actions } }
      q-popup-separator { }
      q-popup-item { content { text { Rename } } }
      q-popup-item { content { text { Duplicate } } }
      q-popup-submenu {
        content { text { More } }
        menu {
          q-popup-item { content { text { Archive } } }
          q-popup-item { content { text { Delete } } }
        }
      }
    }
  }

  onReady {
    var menu = this.querySelector("#ctx-usage");
    menu.addEventListener("menuItemClicked", function (evt) {
      console.log("clicked:", evt.detail && evt.detail.label);
    });
  }
</q-html>
```

## Runtime `.qdom().rewrite(...)`

Use `.qdom()` as the source of truth and call `rewrite(parameterBindings?, callback)` on any resolved QDom node.

- Default bindings are `{ this: currentQDomNode }`.
- `callback` return value is stringified and used to rewrite the calling node.
- Equivalent in intent to a local `q-rewrite`, but driven directly from runtime QDom mutation.

```html
<script>
  const host = document.querySelector("q-html");
  const root = host.qdom();

  root.find("#demo-tabs").rewrite({ label: "Details (Updated)" }, function (bindings) {
    return 'q-tabs { id: "demo-tabs" q-tab { name { text { ' + String(bindings.label) + ' } } } }';
  });
</script>
```

## `q-property` + `q-bind` with `<q-html>.update()`

Declare component properties with `q-property`. Matching invocation assignments are treated as component host properties (`props`) instead of plain HTML attributes.

Use `q-bind { ... }` (or assignment `q-script { ... }`) when the value should be re-evaluated later.

```qhtml
<q-html id="builder">
  q-component editor-item {
    q-property { title isActive }
    li { text { Row item } }
  }

  editor-item {
    title: q-bind { return window.getBuilderConfig("title") }
    isActive: q-bind { return !!window.getBuilderConfig("edit_mode") }
  }

  button#toggle-editor {
    class: q-bind { return window.getBuilderConfig("edit_mode") ? "active" : "inactive" }
    text { Toggle Editor }
  }
</q-html>
```

```html
<script>
  // Re-evaluates all q-bind / assignment q-script bindings in this host.
  document.querySelector("#builder").update();
  // Equivalent runtime API:
  // QHtml.updateQHtmlElement(document.querySelector("#builder"));
</script>
```
## q-script blocks

`q-script { ... }` executes JavaScript and replaces the `q-script` block with the returned value.

### Evaluation timing

- Top-level structural `q-script` runs during preprocessing.
  - Use this for things like dynamic component/template ids.
- Nested `q-script` runs at runtime, after the target element is attached.
  - `this` is the live DOM context for that location.
  - `this.parentElement` and `this.closest(...)` are available when the DOM supports them.
  - `this.parent` is also provided as a convenience alias.

### Rules

- `q-script` must return a value.
- Returned values are converted to strings.
- In element child position, primitive returns (number/string) are rendered as text.
- Returning QHTML markup (for example `div { ... }`) inserts parsed QHTML output.
- Assignment form `name: q-script { ... }` is treated as a runtime binding expression (same update lifecycle as `q-bind`), not source-preprocessed replacement.

### Example 1: primitive text output

```qhtml
<q-html>
  p {
    text {
      q-script { return "Build: " + (5 + 1) }
    }
  }
</q-html>
```

Result:

```html
<p>Build: 6</p>
```

### Example 2: runtime DOM context with `closest()`

```qhtml
q-component nav-bar {
  function randomize() { return Math.random() }
  div { slot { content-slot } }
}

nav-bar {
  text { q-script { return this.closest("nav-bar").randomize() } }
}
```

Behavior:

- `this` is evaluated in live runtime context.
- The returned random number is rendered as text in the slot content.

### Example 3: return QHTML markup

```qhtml
<q-html>
  section {
    q-script {
      return "button.primary { text { Click me } }"
    }
  }
</q-html>
```

Result:

```html
<section><button class="primary">Click me</button></section>
```

### Example 4: dynamic slot content

```qhtml
q-component card-box {
  article {
    h4 { slot { title } }
    div { slot { body } }
  }
}

card-box {
  title { text { Runtime Title } }
  q-script {
    return "body { text { Generated at runtime } }"
  }
}
```

Behavior:

- The `body` slot content is generated by `q-script`.
- Projection still uses the component slot system.

### Example 5: top-level structural id generation

```qhtml
q-component q-script { return "my-panel" } {
  div { text { Dynamic component id } }
}

my-panel { }
```

Behavior:

- The top-level `q-script` in the component header resolves during preprocessing.
- The generated component id can be invoked normally.
