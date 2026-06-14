# MODULE API — release-bundle

## Purpose
Generate the distributable single-file QHTML runtime bundle.

## Entrypoint
- `src/build-release.sh`
- `build-release.sh` compatibility wrapper

## Behavior
- Computes project paths relative to script location.
- Ensures output directory exists (`dist/`).
- Validates presence of all required module sources.
- Concatenates sources in dependency order with `BEGIN/END` markers.
- Writes output to `dist/qhtml.js`.
- Copies the QHTML wasm bootstrap wrapper to `dist/qhtml-wasm.js`.
- Creates `dist/qhtml-wasm/` and copies the required Qt wasm loader assets from `dist/q-components/qhtml-qt/`.

## Inputs
- `src/modules/qdom-core/src/qdom-core.js`
- `src/modules/qhtml-parser/src/qhtml-parser.js`
- `src/modules/dom-renderer/src/dom-renderer.js`
- `src/modules/qhtml-runtime/src/qhtml-runtime.js`
- `src/root-integration.js`
- `src/particle-emitter.js`
- `src/qhtml-wasm.js`
- `dist/q-components/qhtml-qt/qtloader.js`
- `dist/q-components/qhtml-qt/qhtml-qt.js`
- `dist/q-components/qhtml-qt/qhtml-qt.wasm`
- `dist/w3.css`
  - Optional input for `tools/w3-css-to-qhtml.js` during release builds.

## Outputs
- `dist/qhtml.js`
  - Contains synchronized parser/runtime behavior from source modules, including `q-property`, `q-bind`, assignment-form `q-script` bindings, runtime `updateQHtmlElement`, and the native `particle-emitter` / `q-particle-emitter` custom elements.
- `dist/qhtml-wasm.js`
  - Loads `dist/qhtml-wasm/qtloader.js`, then `dist/qhtml-wasm/qhtml-qt.js`, initializes `qhtml_qt_entry()`, assigns the resolved module to the global `Module` handle, exposes `window.QtWasm`, `window.QHTMLQt`, and `window.QHTMLQtReady` when the Qt wasm runtime initializes, then loads `dist/qhtml.js`.
  - Dispatches `QHTMLQtReady` with `{ Module, Qt }` after both the Qt wasm runtime and standard QHTML runtime are loaded.
- `dist/qhtml-wasm/qtloader.js`
- `dist/qhtml-wasm/qhtml-qt.js`
- `dist/qhtml-wasm/qhtml-qt.wasm`
- `dist/w3.qhtml`
  - Generated W3CSS q-theme import containing `q-theme w3-css` rules derived from `dist/w3.css`.

## Exit behavior
- Non-zero exit on missing input source.
- Zero on successful bundle creation.
