# MODULE API

## Purpose
`release-bundle` produces the distributable browser artifact by combining all module scripts into a single dependency-ordered file.

## Boundaries
- Owns release assembly mechanics only.
- Does not implement parser/runtime/renderer logic.

## Public Definitions
- `build-release.sh`
  - Command script that generates `dist/qhtml.js` from module source files in dependency order.

## Side Effects and External Dependencies
- Creates/overwrites `dist/qhtml.js` in project root.
- Requires source module files plus root integration file to exist.

## Cross-Module Imports/Exports
- Reads outputs from:
  - `modules/qdom-core/src/qdom-core.js`
  - `modules/qhtml-parser/src/qhtml-parser.js`
  - `modules/dom-renderer/src/dom-renderer.js`
  - `modules/qhtml-runtime/src/qhtml-runtime.js`
  - `src/root-integration.js`

## Backward Compatibility Notes
- Initial build format is concatenated IIFE-compatible script.
