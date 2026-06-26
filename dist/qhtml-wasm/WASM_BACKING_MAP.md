# QHTML Runtime WASM Backing Map

This package replaces the large `qhtml-runtime.js` control layer with a small compatibility runtime:

- `qhtml-runtime-wasm-lite.js`

It expects the C++ exports from the previous drop-in package:

- `Module.QHTMLNodeTree`
- `Module.QHTMLElement`
- `Module.QHTMLComponent`
- `Module.QHTMLContext`
- `Module.QHTMLBinding`
- `Module.QHTMLPropertyAnimation`

## WASM-backed now

| Runtime area | Backing |
|---|---|
| Node identity | `QHTMLElement::uuid()` |
| Permanent object registry | `QHTMLNodeTree` |
| Parent/child relationships | `QHTMLNodeTree::addChild`, `detach`, `reparent` |
| Tree traversal | `childAt`, `childCount`, `children()` facade |
| Typed property storage | `QVariant` via `setString`, `setNumber`, `setBool`, `setPropertyValue` |
| Property change signals | `QHTMLElement::dispatchPropertyChangedJs` |
| Custom signal bridge | `QHTMLElement::connect`, `emit`, `disconnect` |
| Context lookup | `QHTMLNodeTree::contextFor` |
| Symbol lookup | `QHTMLNodeTree::setSymbol`, `resolveSymbol` |
| Property bindings | `QHTMLNodeTree::bindProperty`, `syncBindingsFrom` |
| Root context storage | Root `QHTMLComponent` node |
| qdom facade | Thin JS proxy over WASM node handles |

## JS fallback boundary

These are explicitly separated under `QHtml.fallback` because they need browser APIs, legacy parser details, or additional C++ runtime classes before they can become native.

| Feature | Reason |
|---|---|
| `toQHtmlSource` | Needs JS serializer/parser or a C++ serializer |
| `listRegisteredComponentIds` | Definition registry is still renderer/parser-side |
| `listRegisteredComponentSlots` | Slot definitions need to move into `QHTMLComponent` |
| `registerWorkerRuntime` / `unregisterWorkerRuntime` / `getWorkerRuntime` | Browser worker lifecycle |
| `startAutoMountObserver` / `stopAutoMountObserver` | `MutationObserver` is browser-only |
| DOM mutation sync | Browser DOM diff/persistence concern |
| `hydrateComponentElement` | Renderer/DOM concern |
| Incremental DOM patching | Current patcher is JS/DOM-specific |
| Full `QModel` behavior | Lite fallback exists; full observable model should become `QHTMLModel` |
| `QCallback` | JS callable wrapper while user script is JavaScript |
| `qmapNode` | Debug/introspection helper |
| SDML/import cache | Parser/import pipeline needs a separate native registry |

## Loading

Load order:

```html
<script src="qhtml-wasm.js"></script>
<script src="qdom-core.js"></script>
<script src="qhtml-parser.js"></script>
<script src="dom-renderer.js"></script>
<script src="qhtml-runtime-wasm-lite.js"></script>
```

If you still need unsupported legacy features while migrating, load the old runtime under a different global first:

```html
<script src="qhtml-runtime-legacy.js"></script>
<script>
  window.QHtmlLegacy = window.QHtml;
</script>
<script src="qhtml-runtime-wasm-lite.js"></script>
```

The lite runtime will delegate unsupported calls to `QHtmlLegacy` when present. If no legacy fallback exists, those calls throw a clear error naming the missing feature.

## Smoke test

```js
await QHtml.ready;

const tree = QHtml.createTree();
const root = tree.createComponent("app");
const card = tree.createElement("q-card");

tree.addChild(root.uuid(), card.uuid());
tree.setSymbol(root.uuid(), "card", card.uuid());

card.connect("widthChanged", event => console.log(event.value));
card.setNumber("width", 320);

console.log(tree.contextFor(card.uuid()).getUUID("card") === card.uuid());
```
