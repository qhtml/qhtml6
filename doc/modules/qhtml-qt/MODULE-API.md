# qhtml-qt Module API

## Purpose

`src/modules/qhtml-qt` is the QtCore/WASM side of the QHTML-WASM runtime. It owns the typed QDom data model, QHTML text parsing into QDom structures, resource-backed component imports, Qt timers/animations, and small bridge objects that can be called from browser JavaScript through Emscripten embind.

The browser DOM is still projected by `dist/qhtml-wasm/qhtml-wasm-renderer.js`. JavaScript should stay thin: it loads the WASM module, converts browser values into explicit bridge types, and turns QDom/render signals into real DOM updates.

## Source Layout

The retained source files are:

- `main.cpp`: embind entrypoint for Qt runtime primitives, QObject/timer/animation helpers, resource import helpers, and compatibility exports.
- `qdom_components.hpp`: typed QDom node classes and shared QDom structures.
- `qdom_parser.hpp`: plaintext QHTML parser that builds the typed QDom hierarchy without Qt JSON APIs.
- `qdom_resource_importer.hpp` / `qdom_resource_importer.cpp`: Qt resource import expansion and parsed resource helpers.
- `qdom_variant.hpp`: JavaScript/WASM value bridge for primitives, containers, and QDom handles.
- `qhtml_resources.qrc`: resource collection used to embed bundled QHTML component files.

Legacy experimental files such as `qhtml_qdom.*`, `qhtml_parser.*`, `qhtml_runtime.*`, `qhtml_runtime_bindings.cpp`, and `qhtmlcomponent.*` are no longer part of the source tree or CMake target.

## Public JavaScript Bindings

When built through Emscripten embind, the module exposes these Qt/WASM APIs:

```js
Module.QObject
Module.QTimer
Module.QPropertyAnimation
Module.QBehavior
Module.QScriptActionAnimation
Module.QAnimationGroup
Module.QSequentialAnimationGroup
Module.QParallelAnimationGroup

Module.QDomNodeKind
Module.QDomComponentObject
Module.QDomResourceImporter
Module.QDomNode
Module.QDomDocument
Module.QVariant

Module.makeSampleRuntimeBridge()
Module.qhtmlResourceNormalizePath(path)
Module.qhtmlResourceExists(path)
Module.qhtmlReadResource(path)
Module.qhtmlExpandResource(path)
Module.qhtmlExpandResourceImportsInSource(source)
Module.qhtmlParsedResourceNodeCount(path)
Module.qhtmlResourcePaths()
Module.qhtmlParseSourceToObject(source)
```

`Module.QHtmlParser`, the old QObject-backed `Module.QDomDocument`, `Module.QDomBuilder`, and the old individual QObject node exports are intentionally removed from the retained Qt path.

## QVariant Bridge

`Module.QVariant` is the explicit value boundary between browser JavaScript and Qt C++. JavaScript should classify values and construct a `QVariant` before passing data into APIs that store arbitrary values.

Supported payload kinds:

- `invalid`
- `bool`
- `number`
- `string`
- `list`
- `map`
- `qdom-node`
- `qdom-document`

Browser-side helper:

```js
const variant = QHTMLQt.toVariant(value);
```

`QHTMLQt.toVariant(value)` supports JavaScript booleans, numbers, strings, arrays, plain objects, `Module.QDomNode`, `Module.QDomDocument`, and values that are already `Module.QVariant` instances.

Manual construction:

```js
const scalar = new Module.QVariant();
scalar.setString("hello");

const list = new Module.QVariant();
list.setList();
list.append(QHTMLQt.toVariant("first"));
list.append(QHTMLQt.toVariant(2));

const map = new Module.QVariant();
map.setMap();
map.setMapValue("label", QHTMLQt.toVariant("Panel"));
map.setMapValue("count", QHTMLQt.toVariant(3));

const node = new Module.QDomNode("element");
node.setUuid("example-node");
const nodeValue = new Module.QVariant();
nodeValue.setNode(node);
```

Important methods:

```js
variant.typeName();
variant.isValid();
variant.isBool();
variant.isNumber();
variant.isString();
variant.isList();
variant.isMap();
variant.isQDomNode();
variant.isQDomDocument();

variant.toBool();
variant.toNumber();
variant.toString();
variant.length();
variant.at(index);
variant.mapValue(key);
variant.toQDomNode();
variant.toQDomDocument();
variant.toJsValue();
```

`toJsValue()` unwraps primitive, list, and map values into browser JavaScript values. QDom handles are returned as small metadata objects with `__qhtmlQDomHandle`, `type`, `uuid`, and node `kind` when available.

## QDom Handles

`Module.QDomNode` is a lightweight embind handle around the internal typed `QDomNodePtr`.

```js
const node = new Module.QDomNode("element");
node.isValid();
node.kind();
node.uuid();
node.setUuid(uuid);
node.setPropertyString(name, value);
node.propertyString(name);
node.setPropertyNumber(name, value);
node.propertyNumber(name);
```

`Module.QDomDocument` wraps a typed QDom document.

```js
const doc = new Module.QDomDocument();
doc.isValid();
doc.uuid();
doc.setUuid(uuid);
doc.appendNode(node);
doc.nodeCount();
doc.nodeAt(index);
```

These handles are designed for transport and storage through `Module.QVariant`. They are not browser DOM nodes.

## QObject Value API

`Module.QObject` accepts `Module.QVariant` values for arbitrary property storage and signal payloads:

```js
const object = new Module.QObject();
object.setPropertyValue("payload", QHTMLQt.toVariant({ label: "ready" }));
const payload = object.propertyValue("payload");
object.emitVariant("changed", payload);
```

The C++ side stores the underlying Qt `QVariant`. When the value is emitted back to JavaScript, primitives and containers are unwrapped with `QVariant.toJsValue()`.

## Parser And Resource Helpers

`qdom_parser.hpp` provides the QHTML text parser used by `qhtmlParseSourceToObject(source)` and resource import expansion. The parser builds typed QDom structures directly; it does not use `QJsonDocument`, `QJsonObject`, `QJsonArray`, `QJsonValue`, or `QJSValue`.

Resource import helpers operate on embedded Qt resource paths:

```js
Module.qhtmlResourceExists("q-components.qhtml");
Module.qhtmlReadResource("q-components/q-fetch-html.qhtml");
Module.qhtmlExpandResourceImportsInSource(source);
Module.qhtmlParseSourceToObject(source);
```

`q-import-resource` expansion is a blocking pre-parse step for the WASM path so dependent definitions are available before renderer scripts run.

## Browser WASM Runtime Facade

`dist/qhtml-wasm/qhtml-wasm.js` loads:

1. `qhtml-wasm-glue.js`
2. `qhtml-wasm-renderer.js`

It copies the Qt-generated glue/wasm output into public names:

- `qhtml-wasm-glue.js`
- `qhtml-wasm.wasm`

After startup it exposes:

```js
window.QHTMLQt
window.QHTMLQtReady
window.QHtml
```

`QHTMLQt` owns the Qt module and bridge helpers, including `toVariant(value)`. `QHtml` is the compatibility facade used by pages that load `qhtml-wasm.js` as a drop-in replacement for `qhtml.js`.

## Compatibility Notes

- QDom is the source of truth for the WASM runtime path.
- JavaScript bodies from QHTML source are stored as source strings and executed only at the browser boundary when there is no useful WASM representation.
- Browser-side JavaScript should not pass raw arbitrary objects to C++ value APIs. Use `QHTMLQt.toVariant(value)` or manually construct `Module.QVariant`.
- QDom handles passed through `Module.QVariant` preserve the underlying WASM object pointer and can be returned with `toQDomNode()` or `toQDomDocument()`.
- Generated files in `dist/qhtml-wasm/` are produced from the single-threaded Qt/WASM build artifact by `src/build-release.sh`.
