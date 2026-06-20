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
- Creates `dist/qhtml-wasm/`.
- Copies the QHTML wasm bootstrap wrapper and browser-side Qt QDom runtime/renderer into `dist/qhtml-wasm/`.
- Copies the required Qt wasm glue and wasm binary from the `src/modules/qhtml-qt` build output, renaming them to the public QHTML WASM filenames.

## Inputs
- `src/modules/qdom-core/src/qdom-core.js`
- `src/modules/qhtml-parser/src/qhtml-parser.js`
- `src/modules/dom-renderer/src/dom-renderer.js`
- `src/modules/qhtml-runtime/src/qhtml-runtime.js`
- `src/root-integration.js`
- `src/particle-emitter.js`
- `src/qhtml-wasm.js`
- `src/qhtml-wasm-dom-runtime.js`
- `src/qhtml-wasm-dom-renderer.js`
- `src/modules/qhtml-qt/build/qhtml-qt/MinSizeRel/WebAssembly_Qt_6_11_1_single_threaded/qhtml-qt.js`
- `src/modules/qhtml-qt/build/qhtml-qt/MinSizeRel/WebAssembly_Qt_6_11_1_single_threaded/qhtml-qt.wasm`
- `dist/w3.css`
  - Optional input for `tools/w3-css-to-qhtml.js` during release builds.

## Outputs
- `dist/qhtml.js`
  - Contains synchronized parser/runtime behavior from source modules, including `q-property`, `q-bind`, assignment-form `q-script` bindings, runtime `updateQHtmlElement`, and the native `particle-emitter` / `q-particle-emitter` custom elements.
- `dist/qhtml-wasm/qhtml-wasm.js`
  - Loads `qhtml-wasm-glue.js`, `qhtml-wasm-dom-runtime.js`, and `qhtml-wasm-dom-renderer.js` from `dist/qhtml-wasm/`.
  - Initializes `qhtml_qt_entry()`, assigns the resolved module to the global `Module` handle, exposes `window.QtWasm`, `window.QHTMLQt`, `window.QHTMLQtReady`, and a small `window.QHtml` mount facade.
  - Overrides Qt glue wasm resolution so its internal `qhtml-qt.wasm` lookup resolves to `dist/qhtml-wasm/qhtml-wasm.wasm`.
  - Does not load `dist/qhtml.js`; the standard JavaScript runtime remains separate.
- `dist/qhtml-wasm/qhtml-wasm-glue.js`
- `dist/qhtml-wasm/qhtml-wasm.wasm`
- `dist/qhtml-wasm/qhtml-wasm-dom-runtime.js`
- `dist/qhtml-wasm/qhtml-wasm-dom-renderer.js`
- `dist/w3.qhtml`
  - Generated W3CSS q-theme import containing `q-theme w3-css` rules derived from `dist/w3.css`.

## Exit behavior
- Non-zero exit on missing input source.
- Zero on successful bundle creation.
