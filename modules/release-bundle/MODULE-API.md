# MODULE API — release-bundle

## Purpose
Generate the distributable single-file QHTML runtime bundle.

## Entrypoint
- `build-release.sh`

## Behavior
- Computes project paths relative to script location.
- Ensures output directory exists (`dist/`).
- Validates presence of all required module sources.
- Concatenates sources in dependency order with `BEGIN/END` markers.
- Writes output to `dist/qhtml.js`.

## Inputs
- `modules/qdom-core/src/qdom-core.js`
- `modules/qhtml-parser/src/qhtml-parser.js`
- `modules/dom-renderer/src/dom-renderer.js`
- `modules/qhtml-runtime/src/qhtml-runtime.js`
- `src/root-integration.js`

## Outputs
- `dist/qhtml.js`
  - Contains synchronized parser/runtime behavior from source modules, including `q-property`, `q-bind`, assignment-form `q-script` bindings, and runtime `updateQHtmlElement`.

## Exit behavior
- Non-zero exit on missing input source.
- Zero on successful bundle creation.
