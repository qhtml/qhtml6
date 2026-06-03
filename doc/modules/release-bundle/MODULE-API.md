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

## Inputs
- `src/modules/qdom-core/src/qdom-core.js`
- `src/modules/qhtml-parser/src/qhtml-parser.js`
- `src/modules/dom-renderer/src/dom-renderer.js`
- `src/modules/qhtml-runtime/src/qhtml-runtime.js`
- `src/root-integration.js`
- `src/particle-emitter.js`
- `dist/w3.css`
  - Optional input for `tools/w3-css-to-qhtml.js` during release builds.

## Outputs
- `dist/qhtml.js`
  - Contains synchronized parser/runtime behavior from source modules, including `q-property`, `q-bind`, assignment-form `q-script` bindings, runtime `updateQHtmlElement`, and the native `particle-emitter` / `q-particle-emitter` custom elements.
- `dist/w3.qhtml`
  - Generated W3CSS q-theme import containing `q-theme w3-css` rules derived from `dist/w3.css`.

## Exit behavior
- Non-zero exit on missing input source.
- Zero on successful bundle creation.
