#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
DIST_DIR="$PROJECT_ROOT/dist"
OUT_FILE="$DIST_DIR/qhtml.js"
WASM_SRC_FILE="$PROJECT_ROOT/src/qhtml-wasm.js"
WASM_ASSET_OUT_DIR="$DIST_DIR/qhtml-wasm"
WASM_OUT_FILE="$WASM_ASSET_OUT_DIR/qhtml-wasm.js"
WASM_ASSET_SRC_DIR="$WASM_ASSET_OUT_DIR"
QT_WASM_BUILD_DIR="$PROJECT_ROOT/src/modules/qhtml-qt/build/qhtml-qt/MinSizeRel/WebAssembly_Qt_6_11_1_single_threaded"
QT_WASM_OUT_DIR="$DIST_DIR/qt-wasm"
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

mkdir -p "$WASM_ASSET_OUT_DIR"
cp "$WASM_SRC_FILE" "$WASM_OUT_FILE"
echo "Wrote $WASM_OUT_FILE"

for wasm_asset in qtloader.js qhtml-qt.js qhtml-qt.wasm; do
  src_asset="$WASM_ASSET_SRC_DIR/$wasm_asset"
  dest_asset="$WASM_ASSET_OUT_DIR/$wasm_asset"
  if [[ ! -f "$src_asset" ]]; then
    echo "Missing wasm asset: $src_asset" >&2
    exit 1
  fi

  if [[ "$src_asset" != "$dest_asset" ]]; then
    cp "$src_asset" "$dest_asset"
    echo "Wrote $dest_asset"
  else
    echo "Verified $dest_asset"
  fi
done

if [[ -d "$QT_WASM_BUILD_DIR" ]]; then
  mkdir -p "$QT_WASM_OUT_DIR"
  shopt -s nullglob
  qt_wasm_assets=("$QT_WASM_BUILD_DIR"/*.wasm "$QT_WASM_BUILD_DIR"/*.js)
  shopt -u nullglob

  if (( ${#qt_wasm_assets[@]} == 0 )); then
    echo "Warning: no Qt wasm .wasm or .js assets found in $QT_WASM_BUILD_DIR" >&2
  fi

  for qt_wasm_asset in "${qt_wasm_assets[@]}"; do
    dest_asset="$QT_WASM_OUT_DIR/$(basename "$qt_wasm_asset")"
    cp "$qt_wasm_asset" "$dest_asset"
    if [[ "$dest_asset" == *.js ]]; then
      sed -i -e $'s/\r$//' -e 's/[[:blank:]]*$//' "$dest_asset"
    fi
    echo "Wrote $dest_asset"
  done
else
  echo "Warning: Qt wasm build output directory not found: $QT_WASM_BUILD_DIR" >&2
fi

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
