
# QHTML.js (Quick HTML)

## This repository is now out-dated and has evolved into **qhtml6** 

- qhtml6 is fully backwards compatible with qhtml5.

## Click here for the <a href="https://github.com/qhtml/qhtml6">qhtml6 Repository</a>

This repository is kept for historical reasons and those who wish to use legacy qhtml5 for whatever reason

> Warning: v5.0 has changes which can break code if migrating from pre-v5.0 q-html.  If you are just upgrading q-html.js but using existing code, then please use the upgrade.html file to upgrade your q-html code to v5.0

QHTML is a compact, readable way to write HTML using a CSS-like block syntax. It turns short, clean markup into real HTML at runtime, without extra boilerplate. Drop your markup inside a `<q-html>` tag, include `qhtml.js`, and the browser renders normal HTML for you.

This README is written for builders who want a quick, reliable way to author UI without a heavy framework. Examples below are ready to copy and run.

## Highlights

- Write HTML structure with a clean, readable block syntax.
- Use standard HTML attributes and event handlers.
- Run inline `q-script { ... }` blocks with return-value replacement.
- Inline HTML or plain text blocks where needed.
- Build reusable runtime components with slots and methods.
- Build compile-time templates that render to pure HTML.
- Optional add-ons: `w3-tags.js` and `bs-tags.js` for shorthand UI markup.

## v5.0 major changes

- Added `q-script { ... }` blocks with return-value replacement and runtime DOM-bound `this`.
- Added mixed evaluation timing for `q-script`:
  - top-level structural use resolves during preprocessing
  - nested use resolves at runtime after elements are attached
- Improved component/slot runtime behavior:
  - fixed duplicate slot projection edge cases
  - internal `q-into` carrier nodes remain non-visual
- Updated docs with a full `q-script` section and examples.
- Added `q-template template-name`
- Modified `q-component` runtime behavior to allow for function calling
- Added `q-signal` to `q-component`
- Simplification of rigid features
  - Removed the ability to use `text: "your-text-here"` on all divs to set textContent in favor of `text { some-text }`
  - Removed the ability to use `content: "text-content"` on all divs to set TextContent in favor of `text { some-text }` or `html { some-html }`
  - Removed the ability to use `slot: "slot-name"` on all divs to remove slot insertion in favor of `slot-name { content-to-send-to-slot }`
  - Removed the `"slot { name: "slot-name" }` syntax in favor of just `slot { name }`
  - q-components now create a `q-into` tag for each slot when rendered unless you call `.resolveSlots()` on the q-component instancew which replaces q-into with its children.

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

- *Note*: The onEvent grammar can not contain any single quotations in it, so instead of using single quotes for edge cases, use backticks or move the javascript outside of the QHTML context entirely in a separate script block and function, then call the function from onclick.

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

## Components and templates (`q-component` vs `q-template`)

QHTML has two reusable-block modes:

- `q-component`: runtime custom-element host for functional behavior
- `q-template`: compile-time template that renders to pure HTML

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
  <q-into slot="title">...</q-into>
  <q-into slot="items">...</q-into>
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
  <q-into slot="main">hello</q-into>
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

## Into blocks (slot projection)

The `into {}` block lets you project content into a named slot without attaching
per-child slot properties. It is a structural block (not an attribute), and
`slot` is required. `into` targets only slot placeholders and never injects directly into components.

### Single-slot injection

QHTML:

```qhtml
q-component label-pill {
  span.pill {
    slot { label }
  }
}

label-pill {
  into {
    slot: "label"
    text { New }
  }
}
```

HTML:

```html
<label-pill q-component="label-pill" qhtml-component-instance="1">
  <q-into slot="label">New</q-into>
</label-pill>
```

### Nested projection through another component

This example wraps content across two components by targeting a single slot.

QHTML:

```qhtml
q-component outer-frame {
  div {
    class: "outer"
    inner-box {
      into {
        slot: "inner"
        slot { content }
      }
    }
  }
}

q-component inner-box {
  div {
    class: "inner"
    slot { inner }
  }
}

outer-frame {
  into {
    slot: "content"
    p { text { Wrapped twice } }
  }
}
```

Runtime host output:

```html
<outer-frame q-component="outer-frame" qhtml-component-instance="1">
  <q-into slot="content">
    <p>Wrapped twice</p>
  </q-into>
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

Same result can be written with an explicit `into` block:

```qhtml
my-component {
  into {
    slot: "my-slot"
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
- `q-components/q-tech-tag.qhtml` (currently a placeholder file with no exported QHTML tags)

Use it like this:

```qhtml
<q-html>
  q-import { q-components.qhtml }
  ...
</q-html>
```

### `q-modal` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-modal {
    id: "modal1"
    header { h3 { text { Modal Header } } }
    body { p { text { Modal body content } } }
    footer { p { text { Optional footer note } } }
  }

  button {
    text { Open modal }
    onClick { document.querySelector("#modal1 > q-modal-component").show(); }
  }

  button {
    text { Hide modal }
    onClick { document.querySelector("#modal1 > q-modal-component").hide(); }
  }
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

### `q-tabs`, `q-tabs-section` example

```qhtml
<q-html>
  q-import { q-components.qhtml }

  q-tabs {
    shell-classes { q-script { return ".w3-card-4" } }
    nav-classes { q-script { return ".w3-light-grey" } }
    panel-classes { q-script { return ".w3-white" } }
    section-classes { q-script { return ".w3-animate-opacity" } }

    q-tabs-section {
      name: "Overview"
      html { This is the overview tab. }
    }

    q-tabs-section {
      name: "Details"
      html { This is the details tab. }
    }
  }
</q-html>
```

`q-tabs` exposes `show(tabIndex)` at runtime, for example:

```js
document.querySelector("q-tabs[q-component='q-tabs']").show(1);
```

## `tools/qhtml-tools.js` conversion helpers

`tools/qhtml-tools.js` exposes three browser helpers for converting between HTML/DOM and QHTML.

Include:

```html
<script src="qhtml.js"></script>
<script src="tools/qhtml-tools.js"></script>
```

Available as:

- `qhtml.fromHTML(...)`, `qhtml.fromDOM(...)`, `qhtml.toHTML(...)`
- Alias: `qhtmlTools.*`
- Hyphen alias: `window["qhtml-tools"].*`

### `fromHTML(rawHtml)`

Converts an HTML string into a QHTML snippet.

```js
const input = `
  <div>
    <section class="card">
      <h3>Live test</h3>
      <p>Hello</p>
    </section>
  </div>
`;

const q = qhtml.fromHTML(input);
console.log(q);
```

### `fromDOM(node)`

Converts an existing DOM node (or fragment/document) into a QHTML snippet.

```js
const box = document.createElement("div");
box.innerHTML = `
  <article class="note">
    <h4>DOM source</h4>
    <p>Converted from a node tree.</p>
  </article>
`;

const q = qhtml.fromDOM(box);
console.log(q);
```

### `toHTML(qhtmlCode)`

Renders QHTML by creating a `<q-html>` element, mounting it to the page, and returning the rendered HTML string.

```js
const source = `
div.card {
  h3 { text { Render me } }
  p { text { Generated by qhtml.toHTML } }
}
`;

const html = await Promise.resolve(qhtml.toHTML(source));
console.log(html);
```

Notes for `toHTML`:

- It appends a `<q-html>` host into `document.body` (or `document.documentElement` fallback).
- Return value may be immediate or async depending on render timing, so `await Promise.resolve(...)` is the safest calling pattern.

## w3-tags.js (W3CSS shorthand)

`w3-tags.js` lets you write W3CSS classes as tags. It transforms nested `w3-*` elements into real HTML with the right classes.

Include it:

```html
<script src="w3-tags.js"></script>
<link rel="stylesheet" href="w3.css">
```

QHTML:

```qhtml
<q-html>
  w3-card, w3-padding, div {
    w3-blue, w3-center, h2 { text { W3 Tag Example } }
    p { text { This uses W3CSS classes as tags. } }
  }
</q-html>
```

HTML (result):

```html
<div class="w3-card w3-padding">
  <h2 class="w3-blue w3-center">W3 Tag Example</h2>
  <p>This uses W3CSS classes as tags.</p>
</div>
```

## bs-tags.js (Bootstrap shorthand)

If you include `bs-tags.js`, you can use Bootstrap class tags the same way. This is a separate add-on, but the syntax mirrors `w3-tags.js`.

Include it:

```html
<script src="bs-tags.js"></script>
<link rel="stylesheet" href="bootstrap.min.css">
```

QHTML:

```qhtml
<q-html>
  bs-card, bs-shadow, div {
    bs-card-body, div {
      h5 { class: "bs-card-title" text { Card title } }
      p { class: "bs-card-text" text { This is a Bootstrap card. } }
    }
  }
</q-html>
```

HTML (result):

```html
<div class="bs-card bs-shadow">
  <div class="bs-card-body">
    <h5 class="bs-card-title">Card title</h5>
    <p class="bs-card-text">This is a Bootstrap card.</p>
  </div>
</div>
```

## Notes

- `text {}` inserts plain text. Use it when you do not want HTML parsing.
- `html {}` injects raw HTML directly.
- `on* {}` blocks convert to inline event attributes.
- If you need to run startup logic, hook `QHTMLContentLoaded` (see `JavaScript API` at the end).

## Demo

Open `demo.html` to see a full playground with QHTML, HTML, and live preview side by side.
Also check out <a href="https://datafault.net/">datafault.net</a> for more information and examples on using qhtml.js.

## JavaScript API

### `QHTMLContentLoaded`

`qhtml.js` dispatches `QHTMLContentLoaded` after parsing/rendering finishes for a `<q-html>` tree. Use this event for setup code that needs final DOM nodes.

```html
<script>
  document.addEventListener("QHTMLContentLoaded", function () {
    const button = document.querySelector("#saveButton");
    if (button) {
      button.addEventListener("click", function () {
        console.log("Button ready and wired");
      });
    }
  });
</script>
```

### Runtime APIs on `q-component` instances

Instances created from `q-component` expose:

- Methods declared with `function ... { ... }` in the component definition
- `instance.slots()`
- `instance.into(slotId, payload)`
- `instance.resolveSlots()`
- `instance.toTemplate()`
- `instance.toTemplateRecursive()`

```js
document.addEventListener("QHTMLContentLoaded", function () {
  const nav = document.querySelector("#main-nav");
  if (!nav) return;

  console.log(nav.slots());
  nav.into("title", "<strong>Updated title</strong>");
  nav.notify();
});
```

Additional lifecycle helpers:

- `resolveSlots()` projects current slot content into rendered markup, removes runtime `into`/`q-into` slot carriers for that instance, and marks the host with `q-slots-resolved="true"`.
- After `resolveSlots()`, `slots()` returns `[]` with a warning and `into()` is disabled (warning).
- `toTemplate()` finalizes one instance into plain DOM output by removing the component host tag itself and leaving only its rendered children in place.
- `toTemplate()` does not recurse into child q-components; nested q-components remain runtime hosts.
- `toTemplateRecursive()` templates the full descendant q-component tree under the instance, then templates the instance itself.

### `q-template` runtime behavior

`q-template` does not expose runtime methods. It is compile-time only and expands to plain HTML.

- `function` blocks inside `q-template` are ignored (with warning).
- Use `q-component` when you need callable methods (`.show()`, `.hide()`, custom actions, etc.).
