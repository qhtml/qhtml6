#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
DIST_DIR="$PROJECT_ROOT/dist"
OUT_FILE="$DIST_DIR/qhtml.js"
DOC_OUT_FILE="$PROJECT_ROOT/doc/qhtml.js"

mkdir -p "$DIST_DIR"

sources=(
  "$PROJECT_ROOT/src/modules/qdom-core/src/qdom-core.js"
  "$PROJECT_ROOT/src/modules/qhtml-parser/src/qhtml-parser.js"
  "$PROJECT_ROOT/src/modules/dom-renderer/src/dom-renderer.js"
  "$PROJECT_ROOT/src/modules/qhtml-runtime/src/qhtml-runtime.js"
  "$PROJECT_ROOT/src/root-integration.js"
  "$PROJECT_ROOT/src/particle-emitter.js"
)

for src in "${sources[@]}"; do
  if [[ ! -f "$src" ]]; then
    echo "Missing source file: $src" >&2
    exit 1
  fi
done

{
  echo "/* qhtml.js release bundle */"
  echo "/* generated: $(date -u +%Y-%m-%dT%H:%M:%SZ) */"
  echo ""
  for i in "${!sources[@]}"; do
    src="${sources[$i]}"
    echo "/*** BEGIN: ${src#$PROJECT_ROOT/} ***/"
    cat "$src"
    echo ""
    echo "/*** END: ${src#$PROJECT_ROOT/} ***/"
    if (( i < ${#sources[@]} - 1 )); then
      echo ""
    fi
  done
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"

if [[ -d "$PROJECT_ROOT/doc" ]]; then
  cp "$OUT_FILE" "$DOC_OUT_FILE"
  echo "Wrote $DOC_OUT_FILE"
fi

W3_QHTML_GENERATOR="$PROJECT_ROOT/tools/w3-css-to-qhtml.js"
W3_CSS_FILE="$DIST_DIR/w3.css"
W3_QHTML_FILE="$DIST_DIR/w3.qhtml"

if [[ -f "$W3_QHTML_GENERATOR" && -f "$W3_CSS_FILE" ]]; then
  if command -v node >/dev/null 2>&1; then
    node "$W3_QHTML_GENERATOR" "$W3_CSS_FILE" "$W3_QHTML_FILE"
  else
    echo "Warning: node not found; skipped w3.qhtml generation." >&2
  fi
fi
