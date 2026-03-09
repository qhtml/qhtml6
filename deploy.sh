#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./deploy.sh path/to/project

Description:
  Builds the QHTML release bundle and copies deploy artifacts into:
    path/to/project/qhtml
USAGE
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

PROJECT_ARG="$1"
if [[ ! -d "$PROJECT_ARG" ]]; then
  echo "Error: project path does not exist or is not a directory: $PROJECT_ARG" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
PROJECT_ROOT="$(cd "$PROJECT_ARG" && pwd)"
TARGET_DIR="$PROJECT_ROOT/qhtml"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Error: dist directory not found at $DIST_DIR" >&2
  exit 1
fi

echo "Building release bundle..."
if [[ -x "$SCRIPT_DIR/modules/release-bundle/build-release.sh" ]]; then
  (
    cd "$SCRIPT_DIR/modules/release-bundle"
    ./build-release.sh
  )
elif [[ -x "$SCRIPT_DIR/build-release.sh" ]]; then
  (
    cd "$SCRIPT_DIR"
    ./build-release.sh
  )
else
  echo "Error: could not find an executable build-release.sh script." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
mkdir -p "$TARGET_DIR/q-components"
mkdir -p "$TARGET_DIR/codemirror"

copy_if_exists() {
  local src="$1"
  local dst="$2"
  if [[ -e "$src" ]]; then
    cp -f "$src" "$dst"
    echo "Copied: $src -> $dst"
  else
    echo "Warning: missing file: $src" >&2
  fi
}

copy_glob_files() {
  local pattern="$1"
  local dst="$2"
  shopt -s nullglob
  local files=( $pattern )
  shopt -u nullglob
  if (( ${#files[@]} == 0 )); then
    echo "Warning: no matches for pattern: $pattern" >&2
    return
  fi
  local f
  for f in "${files[@]}"; do
    cp -f "$f" "$dst"
    echo "Copied: $f -> $dst"
  done
}

# Required core files
copy_if_exists "$DIST_DIR/qhtml.js" "$TARGET_DIR/"
copy_if_exists "$DIST_DIR/q-components.qhtml" "$TARGET_DIR/"

# q-components module files
copy_glob_files "$DIST_DIR/q-components/*.qhtml" "$TARGET_DIR/q-components/"

# CSS and HTML assets
copy_glob_files "$DIST_DIR/*.css" "$TARGET_DIR/"
copy_glob_files "$DIST_DIR/*.html" "$TARGET_DIR/"

# codemirror assets
if [[ -d "$DIST_DIR/codemirror" ]]; then
  cp -Rf "$DIST_DIR/codemirror/." "$TARGET_DIR/codemirror/"
  echo "Copied: $DIST_DIR/codemirror/* -> $TARGET_DIR/codemirror/"
else
  echo "Warning: missing directory: $DIST_DIR/codemirror" >&2
fi

# Extra JS helpers
copy_if_exists "$DIST_DIR/w3-tags.js" "$TARGET_DIR/"
copy_if_exists "$DIST_DIR/bs-tags.js" "$TARGET_DIR/"

echo
echo "Deploy copy complete."
echo "Project root: $PROJECT_ROOT"
echo "QHTML assets: $TARGET_DIR"
echo

read -r -p "Would you like to run a local HTTP server to test qhtml in the browser? [Y/n] " RUN_SERVER
RUN_SERVER="$(printf '%s' "$RUN_SERVER" | tr '[:upper:]' '[:lower:]')"

if [[ -z "$RUN_SERVER" || "$RUN_SERVER" == "y" || "$RUN_SERVER" == "yes" ]]; then
  echo "temporary web server running - open http://127.0.0.1:8000 in your browser"
  cd "$PROJECT_ROOT"
  if command -v python >/dev/null 2>&1; then
    python -m http.server 8000 --bind 127.0.0.1
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m http.server 8000 --bind 127.0.0.1
  else
    echo "Error: neither python nor python3 is available on PATH." >&2
    exit 1
  fi
else
  echo "Done. Exiting without starting server."
fi
