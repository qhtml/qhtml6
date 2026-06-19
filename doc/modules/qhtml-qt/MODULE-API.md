# qhtml-qt Module API

## Purpose

`src/modules/qhtml-qt` provides the QtCore/WASM side of QHTML parsing and symbolic QDom construction. It does not evaluate JavaScript, mount runtime components, or project browser DOM. Browser DOM identity remains a UUID string that JavaScript can resolve on its side.

## Public JavaScript Bindings

When built through Emscripten embind, the module exposes:

- `Module.QHtmlParser`
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
const builder = new Module.QDomBuilder();

const ast = parser.toAST(source);
const qdom = builder.fromAST(ast);
const sameQdom = builder.fromASTJson(parser.toASTJson(source));
```

`fromAST()` and `fromASTJson()` return a `QDomDocumentNode`. The returned document owns its child QObject tree.

The builder registers definitions as it walks the AST. Later elements whose tag matches a previously seen `q-component`, `q-template`, `q-class`, or named `q-object` become the corresponding instance node type.

## Shared QDom Node API

All QDom node classes inherit from `QDomNode` and support:

```js
node.kind();
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
- Browser DOM references are stored as `domUuid` only.
- Child ownership follows QObject parent ownership. Keep browser-side references to nodes only while the owning document is alive.
