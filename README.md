# QHTML.js v6.0.3

QHTML is a compact language and runtime for building real web apps with readable block syntax, reusable components, signals, and live QDOM editing.

Live demo: https://qhtml.github.io/qhtml6/dist/demo.html

## Whats New in v6.0.3

- `q-bind` now evaluates with a DOM-capable runtime context (`closest`, `querySelector`, etc).
- Built-in `q-bind` evaluation safety: each binding body is wrapped in runtime `try/catch`.
- Pre-render selector fallback for `q-bind` against QDOM/raw-html content.
- Host `onReady` dispatch now runs through runtime callback queueing.
- Inline source ingestion now preserves literal HTML children in `<q-html>` / `<q-editor>` source.
- Runtime log spam is disabled by default and gated behind `window.QHTML_RUNTIME_DEBUG` (or `window.QHTML_DEBUG`).
- `q-property` support for explicit component properties.
- Function-style component signals (`q-signal mySignal(param1, param2)` + `.connect/.disconnect/.emit`).
- `.qdom().deserialize(serialized, shouldReplaceQDom)` for append-or-replace import flow.
- Scoped component updates via `this.component.update()` and full host updates via `this.component.root().update()`.

## 1. Quick Start

### Create a file named `index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QHTML Quick Start</title>
    <script src="qhtml.js"></script>
  </head>
  <body>
    <q-html>
      h1 { text { Hello QHTML } }
      p { text { Your first QHTML render is running. } }
    </q-html>
  </body>
</html>
```

### Copy to the same folder these files:
  - required `dist/qhtml.js` 
  - optional `dist/q-components/*` and `dist/q-components.html`
  - recommended `dist/*.css dist/*.js`
```bash
cp dist/*.js /path/to/project
cp dist/*.css /path/to/project
cp dist/q-components* /path/to/project -R
```

### Run it from a local HTTP server.
```bash
cd /path/to/project
python -m http.server
```
### Visit page 
``` web browser to http://localhost:8000/index.html ```
## 2. Core Syntax

### Elements and nesting

```qhtml
<q-html>
  div {
    h2 { text { Product } }
    p { text { Lightweight UI syntax. } }
  }
</q-html>
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

### `text`, `html`, and `style`

```qhtml
<q-html>
  p {
    style {
      font-size: 20px;
      margin: 0;
    }
    text { Plain text content }
  }
  div {
    html { <strong>Real HTML fragment</strong> }
  }
</q-html>
```

### Events

```qhtml
<q-html>
  button {
    text { Click }
    onclick {
      this.textContent = "Clicked";
    }
  }
</q-html>
```

### Lifecycle

```qhtml
<q-html>
  onReady {
    this.setAttribute("data-ready", "1");
  }
  div { text { Host ready hook executed. } }
</q-html>
```

## 3. State with `q-bind`

`q-bind` computes assignment values. After state changes, call `this.closest("q-html").update()`.

```qhtml
<q-html>
  onReady {
    window.counter = 0;
  }

  h3 {
    content: q-bind {
      return "Count: " + String(window.counter || 0);
    }
  }

  button {
    text { Increment }
    onclick {
      window.counter = (window.counter || 0) + 1;
      this.closest("q-html").update();
    }
  }
</q-html>
```

## 4. Components

Define reusable UI with `q-component`.

```qhtml
<q-html>
  q-component app-card {
    q-property { title }

    div {
      class: "card"
      h3 { content: q-bind { return this.component.title; } }
      slot { body }
    }
  }

  app-card {
    title: "Welcome"
    p { slot: "body" text { This is projected content. } }
  }
</q-html>
```

## 5. Signals

Signals are callable from component instances and support connection to methods.

```qhtml
<q-html>
  q-component sender-box {
    q-signal sent(message)

    button {
      text { Send }
      onclick {
        this.component.sent("Signal payload from sender-box");
      }
    }
  }

  q-component receiver-box {
    function onMessage(message) {
      this.querySelector("#out").textContent = message;
    }

    sender-box { id: "sender" }
    p { id: "out" text { Waiting... } }

    onReady {
      this.querySelector("#sender").sent.connect(this.component.onMessage);
    }
  }

  receiver-box { }
</q-html>
```

## 6. QDOM API

You can edit mounted QHTML directly through `.qdom()`.

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

### Serialize / Deserialize

```js
const host = document.querySelector("q-html");
const serialized = host.qdom().serialize();

// Append into current qdom
host.qdom().deserialize(serialized, false);
host.update();

// Replace current qdom
host.qdom().deserialize(serialized, true);
host.update();
```

## 7. Builder and Editor

- `dist/test.html` is the framework development testbed.
- `dist/demo.html` is the component usage gallery.
- `q-editor` supports authoring live QHTML and previewing output.
- `q-builder` provides visual inspect/edit workflows on mounted `<q-html>` content.

## 8. Debug Tips

- Enable runtime logs only when needed:

```js
window.QHTML_RUNTIME_DEBUG = true;
```

- Force full host refresh:

```js
document.querySelector("q-html").update();
```

- Refresh only one component subtree:

```js
this.component.update();
```

## 9. Module READMEs

For internal architecture and module APIs, see:

- `modules/qdom-core/README.md`
- `modules/qhtml-parser/README.md`
- `modules/dom-renderer/README.md`
- `modules/qhtml-runtime/README.md`
- `modules/release-bundle/README.md`
