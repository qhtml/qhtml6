# qhtml-qt Module API

## Purpose

`src/modules/qhtml-qt` provides the QtCore/WASM side of QHTML parsing and symbolic QDom construction. It does not evaluate JavaScript, mount runtime components, or project browser DOM. Browser DOM identity remains a UUID string that JavaScript can resolve on its side.

## Public JavaScript Bindings

When built through Emscripten embind, the module exposes:

- `Module.QHtmlParser`
- `Module.QDomDocument`
- `Module.QDomBuilder`
- `Module.QDomNode`
- `Module.QDomDocumentNode`
- `Module.QDomElementNode`
- `Module.QDomTextNode`
- `Module.QDomRawHtmlNode`
- `Module.QDomModelNode`
- `Module.QDomRepeaterNode`
- `Module.QDomComponentNode`
- `Module.QDomComponentInstanceNode`
- `Module.QDomTemplateInstanceNode`
- `Module.QDomStructNode`
- `Module.QDomStructInstanceNode`
- `Module.QDomClassNode`
- `Module.QDomClassInstanceNode`
- `Module.QDomSlotNode`
- `Module.QDomSlotDefaultNode`
- `Module.QDomScriptRuleNode`
- `Module.QDomColorNode`

## Parser API

```js
const parser = new Module.QHtmlParser();
const ast = parser.toAST(source);
const astJson = parser.toASTJson(source);
```

`toAST()` returns a JavaScript object parsed from the Qt JSON output. `toASTJson()` returns the compact JSON string directly.

## QDom Builder API

```js
const parser = new Module.QHtmlParser();
const doc = new Module.QDomDocument().fromAST(parser.toAST(source));
const root = doc.root();
```

`QDomDocument` is the preferred factory/runtime owner for the Qt-backed QDom tree. It supports:

```js
doc.fromAST(astObject);
doc.fromASTJson(astJson);
doc.root();
doc.createElement(tagName);
doc.createText(text);
doc.createInstance(typeName, name, argsJson);
doc.findByUuid(uuid);
doc.findByName(name);
doc.findByKind(kind);
doc.find(query);
```

`QDomBuilder` remains available for lower-level construction:

```js
const ast = parser.toAST(source);
const builder = new Module.QDomBuilder();
const qdom = builder.fromAST(ast);
const sameQdom = builder.fromASTJson(parser.toASTJson(source));
```

`fromAST()` and `fromASTJson()` return a `QDomDocumentNode`. The returned document owns its child QObject tree.

The builder registers definitions as it walks the AST. Later elements whose tag matches a previously seen `q-component`, `q-template`, `q-class`, or named `q-object` become the corresponding instance node type.

## Shared QDom Node API

All QDom node classes inherit from `QDomNode` and support:

```js
node.kind();
node.objectName();
node.setObjectName(name);
node.parent();
node.setParent(parentNode);
node.uuid();
node.setUuid(uuid);
node.domUuid();
node.setDomUuid(uuid);

node.addChild(child);
node.insertChild(index, child);
node.removeChild(child);
node.childAt(index);
node.childCount();
node.children();       // JSON snapshot of child nodes
node.parentNode();

node.findByUuid(uuid);
node.findByKind(kind);
node.findByName(name);
node.findByTagName(tagName);

node.setMetaValue(name, value);
node.metaValue(name);
node.metaJson();
node.setMetaJson(json);

node.setStringProperty(name, value);
node.setNumberProperty(name, value);
node.setBoolProperty(name, value);
node.stringProperty(name);
node.numberProperty(name);
node.boolProperty(name);
node.hasProperty(name);
node.setPropertyValue(name, value);
node.propertyValue(name);
node.propertyJson(name);
node.propertyKeys();

const connectionId = node.connect("ready", (payload) => {});
node.emit("ready", { ok: true });
node.disconnect(connectionId);

node.toJson();
node.toObject();
```

## Typed Node APIs

`QDomElementNode` exposes `tagName`, `setTagName`, `setAttribute`, `attribute`, `hasAttribute`, `attributesJson`, `setTextContent`, and `textContent`.

`QDomComponentNode` exposes `componentId`, `definitionType`, and `definitionJson`.

`QDomComponentInstanceNode` exposes `componentId`, `alias`, `attributesJson`, `propsJson`, `setAttribute`, `attribute`, `setProp`, and `prop`.

`QDomClassNode` exposes `classId`, `extendsClassId`, `constructorJson`, `methodsJson`, and `slotDeclarationsJson`.

`QDomClassInstanceNode` exposes `classId`, `alias`, `argumentSource`, `argumentsJson`, `attributesJson`, `propsJson`, `setAttribute`, `attribute`, `setProp`, and `prop`.

`QDomStructNode` and `QDomStructInstanceNode` expose `structId`; struct instances also expose `alias`, `setProp`, `prop`, and `propsJson`.

`QDomTextNode`, `QDomRawHtmlNode`, `QDomModelNode`, `QDomRepeaterNode`, `QDomSlotNode`, `QDomScriptRuleNode`, and `QDomColorNode` expose simple accessors matching their names and serialized payloads.

## Compatibility Notes

- QDom nodes are symbolic Qt objects, not JavaScript runtime components.
- JavaScript bodies from q-class, function, callback, signal, and event blocks are stored as strings.
- Browser DOM references are stored as `domUuid` and resolved by the browser-side WASM QDom interface.
- Child ownership follows QObject parent ownership. Keep browser-side references to nodes only while the owning document is alive.

## Browser WASM Runtime Facade

`dist/qhtml-wasm/qhtml-wasm.js` loads only the Qt/WASM runtime path:

1. `qhtml-wasm-glue.js`
2. `qhtml-wasm-dom-runtime.js`
3. `qhtml-wasm-dom-renderer.js`

The Qt-generated glue is copied from `qhtml-qt.js` to `qhtml-wasm-glue.js`, and the Qt-generated wasm file is copied from `qhtml-qt.wasm` to `qhtml-wasm.wasm`. The entrypoint overrides the glue file's wasm lookup so it resolves the public `qhtml-wasm.wasm` filename.

It does not load `dist/qhtml.js`. After startup, it exposes:

```js
window.QHTMLQt;
window.QHTMLQtReady;
window.QHtml;
```

`QHTMLQt` owns the Qt module and helpers. `QHtml` is a small compatibility facade with `mountQHtmlElement`, `mountAll`, `parse`, and `createDocument` for simple WASM-backed mounting.

The browser-side WASM runtime also owns QHTML Context behavior for the Qt path. It keeps lexical named-instance aliases, scoped `q-var` values, inline expression interpolation, event/lifecycle script scope, and `q-connect` wiring in JavaScript while reading and writing QDom identity, properties, and signals through Qt-backed node handles. The facade exposes root context helpers:

```js
QHtml.rootContext.set(name, value);
QHtml.rootContext.get(name);
QHtml.rootContext.has(name);
QHtml.rootContext.child(parent);
QHtml.rootContext.toObject();
QHtml.setContextProperty(name, value);
QHtml.getContextProperty(name);
QHtml.createChildContext(parent);
```
