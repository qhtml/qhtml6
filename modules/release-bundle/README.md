# release-bundle

`release-bundle` is the packaging module for producing the browser-distributed `dist/qhtml.js` artifact.

## What this module actually does

- Defines strict module concatenation order so global module dependencies attach correctly:
  1. `qdom-core`
  2. `qhtml-parser`
  3. `dom-renderer`
  4. `qhtml-runtime`
  5. `src/root-integration.js`
- Verifies required source files exist before building.
- Writes a generated header with UTC timestamp.
- Produces a single bundle file at `qhtml6/dist/qhtml.js`.
- Bundle includes language/runtime features added in source modules (for example `q-property`, `q-bind`, `.qdom().rewrite(...)`, and `<q-html>.update()` support).

## Why this module matters

- Runtime modules are loaded as IIFE globals, so ordering is required.
- Central build script keeps distribution predictable and reproducible.

## Usage example

```bash
bash modules/release-bundle/build-release.sh
```

**Output result**

```text
Wrote /workspace/qhtml6/qhtml6/dist/qhtml.js
```
