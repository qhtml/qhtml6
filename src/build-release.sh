#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
DIST_DIR="$PROJECT_ROOT/dist"
OUT_FILE="$DIST_DIR/qhtml.js"
WASM_SRC_FILE="$PROJECT_ROOT/src/qhtml-wasm.js"
WASM_ASSET_OUT_DIR="$DIST_DIR/qhtml-wasm"
WASM_OUT_FILE="$WASM_ASSET_OUT_DIR/qhtml-wasm.js"
WASM_RUNTIME_SRC_FILE="$PROJECT_ROOT/src/qhtml-wasm-dom-runtime.js"
WASM_RENDERER_SRC_FILE="$PROJECT_ROOT/src/qhtml-wasm-dom-renderer.js"
QT_WASM_BUILD_DIR="$PROJECT_ROOT/src/modules/qhtml-qt/build/qhtml-qt/MinSizeRel/WebAssembly_Qt_6_11_1_single_threaded"
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

if [[ ! -f "$WASM_SRC_FILE" ]]; then
  echo "Missing source file: $WASM_SRC_FILE" >&2
  exit 1
fi

for wasm_runtime_src in "$WASM_RUNTIME_SRC_FILE" "$WASM_RENDERER_SRC_FILE"; do
  if [[ ! -f "$wasm_runtime_src" ]]; then
    echo "Missing source file: $wasm_runtime_src" >&2
    exit 1
  fi
done

mkdir -p "$WASM_ASSET_OUT_DIR"
cp "$WASM_SRC_FILE" "$WASM_OUT_FILE"
echo "Wrote $WASM_OUT_FILE"

for wasm_runtime_src in "$WASM_RUNTIME_SRC_FILE" "$WASM_RENDERER_SRC_FILE"; do
  wasm_runtime_dest="$WASM_ASSET_OUT_DIR/$(basename "$wasm_runtime_src")"
  cp "$wasm_runtime_src" "$wasm_runtime_dest"
  echo "Wrote $wasm_runtime_dest"
done

if [[ ! -d "$QT_WASM_BUILD_DIR" ]]; then
  echo "Missing Qt wasm build output directory: $QT_WASM_BUILD_DIR" >&2
  exit 1
fi

declare -A wasm_assets=(
  ["qhtml-qt.js"]="qhtml-wasm-glue.js"
  ["qhtml-qt.wasm"]="qhtml-wasm.wasm"
)

for wasm_asset in "${!wasm_assets[@]}"; do
  src_asset="$QT_WASM_BUILD_DIR/$wasm_asset"
  dest_asset="$WASM_ASSET_OUT_DIR/${wasm_assets[$wasm_asset]}"
  if [[ ! -f "$src_asset" ]]; then
    echo "Missing wasm asset: $src_asset" >&2
    exit 1
  fi

  cp "$src_asset" "$dest_asset"
  if [[ "$dest_asset" == *.js ]]; then
    sed -i -e $'s/\r$//' -e 's/[[:blank:]]*$//' "$dest_asset"
  fi
  echo "Wrote $dest_asset"
done

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
