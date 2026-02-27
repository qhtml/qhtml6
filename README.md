# QHTML v6

QHTML v6 is a parser + renderer + runtime system that turns QHTML source into a QDom model and then into browser DOM.

Demo: https://qhtml.github.io/qhtml6/qhtml6/dist/demo.html

## Language syntax reference (current supported behavior)

## 1) Element blocks + attributes

```qhtml
div {
  id: "hero"
  data-kind: "panel"
  p {
    text { Hello world }
  }
}
```

**HTML output**
```html
<div id="hero" data-kind="panel"><p>Hello world</p></div>
```

## 2) Selector shorthand (class chaining supported)

Class shorthand is supported:

```qhtml
div.card.primary {
  text { Card body }
}
```

**HTML output**
```html
<div class="card primary">Card body</div>
```

`#id`/full CSS selector-style parsing is **not documented as supported yet**.

## 3) Multi-selector shorthand (using normal HTML tags)

```qhtml
div,section {
  span,div {
    text { Item }
  }
}
```

**HTML output**
```html
<div class="section"><span class="div">Item</span></div>
```

> Note: comma shorthand is legacy/class-chain friendly syntax; prefer explicit HTML tags + class attributes for clarity.

## 4) Text + raw HTML blocks

```qhtml
p {
  text { Plain text value }
}

div {
  html { <strong>Raw HTML</strong> }
}
```

**HTML output**
```html
<p>Plain text value</p>
<div><strong>Raw HTML</strong></div>
```

`innerText { ... }` is not part of the supported syntax reference.

## 5) Top-level `q-import`

```qhtml
q-import { q-components/q-modal.qhtml }
```

- Imports are recursively resolved.
- Runtime resolves them before mount.

## 6) Lifecycle blocks

```qhtml
onReady {
  console.log("ready", this.qhtmlRoot());
}

onLoad {
  console.log("load");
}

onLoaded {
  console.log("loaded");
}
```

## 7) `q-component` and `q-template`

```qhtml
q-component app-card {
  onReady {
    this.setAttribute("data-ready", "1");
  }

  article.card {
    slot { default }
  }
}

q-template field-row {
  div.row {
    slot { label }
    slot { input }
  }
}
```

**Invocation**
```qhtml
app-card {
  p { text { projected body } }
}

field-row {
  label { text { Username } }
  input { input { name: "username" } }
}
```

**HTML output**
```html
<app-card data-ready="1"><article class="card"><p>projected body</p></article></app-card>
<div class="row"><label>Username</label><input name="username"></div>
```

## 8) Slots

```qhtml
q-component my-layout {
  section {
    slot { header }
    slot { default }
    slot { footer }
  }
}

my-layout {
  header { h1 { text { Title } } }
  p { text { Main content } }
  footer { small { text { Footer } } }
}
```

**HTML output**
```html
<my-layout><section><h1>Title</h1><p>Main content</p><small>Footer</small></section></my-layout>
```

## 9) Inline event handlers (`on<Event>`)

Event handler blocks are supported directly in nodes:

```qhtml
button.primary {
  text { Save }
  onClick {
    this.classList.add("clicked");
    console.log(this.qhtmlRoot());
  }
  onMouseOver {
    this.setAttribute("data-hover", "1");
  }
}
```

**HTML output (before events fire)**
```html
<button class="primary">Save</button>
```

## 10) `q-script` (source expression expansion)

`q-script` can be used inline to return source fragments:

```qhtml
div q-script { return ".something" } {
  text { Hi }
}
```

Equivalent expanded selector shape:

```qhtml
div.something {
  text { Hi }
}
```

**HTML output**
```html
<div class="something">Hi</div>
```

---

## `.qdom()` runtime API

When `<q-html>` mounts:

- `qHtmlElement.qdom()` → root QDom facade.
- `renderedElement.qdom()` → mapped QDom node.
- `renderedElement.qhtmlRoot()` → owning `<q-html>` root.
- `renderedElement.component` → nearest component host.
- `renderedElement.slot` → slot context when available.

### QDom node helpers

Available on facades:

- `createQElement(options | tagName, attributes?, children?)`
- `createQText(options | value)`
- `createQRawHtml(options | html)`
- `createQSlot(options | name, children?)`
- `createQComponentInstance(options | componentId, attributes?)`
- `createQTemplateInstance(options | componentId, attributes?)`
- `find(selector)`
- `findAll(selector)`
- `findSlotFor(target)`
- `children()` / children proxy helpers

### `QDomNodeList`

- `at(index)`
- `toArray()`
- `forEach(cb)`
- `map(cb)`
- `qhtml(options?)` → serialize siblings to QHTML
- `htmldom(targetDocument?)` → `DocumentFragment`
- `html(targetDocument?)` → HTML string

## Module map

- `qhtml6/modules/qdom-core` — QDom model, observation, compressed persistence
- `qhtml6/modules/qhtml-parser` — language parser/import/rewrite/serialization
- `qhtml6/modules/dom-renderer` — QDom → DOM rendering and slot projection
- `qhtml6/modules/qhtml-runtime` — mount/update engine + `.qdom()` APIs
- `qhtml6/modules/release-bundle` — release bundling script
