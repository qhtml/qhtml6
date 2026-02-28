#!/usr/bin/env bash

set -euo pipefail

PROG="${0##*/}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_ROOT="${LEAD_ROOT:-$PWD}"
MAIN_DB="${LEAD_MAIN_DB:-$WORK_ROOT/lead-main.db}"
MODULES_DIR="${LEAD_MODULES_DIR:-$WORK_ROOT/modules}"
MAIN_SCHEMA_FILE="$SCRIPT_DIR/sql/lead-main-schema.sql"
MODULE_SCHEMA_FILE="$SCRIPT_DIR/sql/lead-module-schema.sql"
SQLITE_TIMEOUT_MS="${LEAD_SQLITE_BUSY_TIMEOUT_MS:-15000}"
PLACEHOLDER_DESCRIPTION="LEAD: update this description with precise module-specific context"
FIELD_SEP=$'\x1f'

DEFAULT_FILTERS=(
  "*.c" "*.cc" "*.cpp" "*.cxx" "*.h" "*.hpp" "*.hh" "*.hxx"
  "*.qml" "*.py" "*.sh" "*.js" "*.mjs" "*.html" "*.rs"
)

log() { printf '%s\n' "$*"; }
warn() { printf '%s: warning: %s\n' "$PROG" "$*" >&2; }
fatal() { printf '%s: error: %s\n' "$PROG" "$*" >&2; exit 1; }

require_tools() {
  command -v sqlite3 >/dev/null 2>&1 || fatal "sqlite3 not found"
  command -v jq >/dev/null 2>&1 || fatal "jq not found"
  command -v awk >/dev/null 2>&1 || fatal "awk not found"
  command -v find >/dev/null 2>&1 || fatal "find not found"
}

sql_escape() {
  local s=${1:-}
  s=${s//\'/\'\'}
  printf '%s' "$s"
}

json_array_from_args() {
  if [[ $# -eq 0 ]]; then
    printf '[]'
    return
  fi
  printf '%s\n' "$@" | jq -R . | jq -s .
}

sqlite_exec() {
  local db=$1
  local sql=$2
  sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$db" "PRAGMA foreign_keys=ON; $sql"
}

sqlite_exec_mode() {
  local db=$1
  local mode=$2
  local sql=$3
  sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$db" <<SQL
PRAGMA foreign_keys=ON;
.headers on
.mode $mode
$sql
SQL
}

sqlite_json_query() {
  local db=$1
  local sql=$2
  local out
  out="$(sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$db" <<SQL
PRAGMA foreign_keys=ON;
.mode json
$sql
SQL
)"
  if [[ -z "${out//[$'\t\r\n ']/}" ]]; then
    printf '[]\n'
  else
    printf '%s\n' "$out"
  fi
}

require_table_columns() {
  local db=$1
  local table=$2
  shift 2
  local cols
  cols="$(sqlite3 "$db" "PRAGMA table_info($table);" | awk -F'|' '{print $2}')"
  [[ -n "$cols" ]] || fatal "schema mismatch: table '$table' missing in $db"
  local col
  for col in "$@"; do
    printf '%s\n' "$cols" | grep -Fxq "$col" || fatal "schema mismatch: table '$table' missing column '$col' in $db"
  done
}

require_index() {
  local db=$1
  local index_name=$2
  local found
  found="$(sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='index' AND name='$(sql_escape "$index_name")';")"
  [[ -n "$found" ]] || fatal "schema mismatch: required index '$index_name' missing in $db"
}

validate_main_schema() {
  require_table_columns "$MAIN_DB" modules id name path description status created_at updated_at
  require_table_columns "$MAIN_DB" requirements id module_id description priority status created_at updated_at
  require_table_columns "$MAIN_DB" specifications id module_id requirement_id description verification_method created_at updated_at
  require_table_columns "$MAIN_DB" use_cases id module_id description actor preconditions postconditions created_at updated_at
  require_table_columns "$MAIN_DB" test_cases id module_id specification_id description expected_result created_at updated_at
  require_table_columns "$MAIN_DB" dependencies id module_id depends_on_module_id type created_at updated_at
  require_table_columns "$MAIN_DB" bugs id module_id description severity status created_at updated_at
  require_table_columns "$MAIN_DB" constraints id module_id description type created_at updated_at
  require_table_columns "$MAIN_DB" clarification_requests id module_id source prompt status response description created_at updated_at
  require_table_columns "$MAIN_DB" intent_runs id module_id request_payload response_payload status description created_at updated_at

  local dep_fk_count
  dep_fk_count="$(sqlite3 "$MAIN_DB" "PRAGMA foreign_key_list(dependencies);" | wc -l | tr -d ' ')"
  (( dep_fk_count >= 2 )) || fatal "schema mismatch: dependencies missing foreign keys in $MAIN_DB"

  require_index "$MAIN_DB" idx_requirements_module_id
  require_index "$MAIN_DB" idx_specifications_requirement_id
  require_index "$MAIN_DB" idx_dependencies_depends_on_module_id
  require_index "$MAIN_DB" idx_clarification_requests_status
}

validate_module_schema() {
  local module_db=$1
  require_table_columns "$module_db" files id path description created_at updated_at
  require_table_columns "$module_db" definitions id file_id name type signature description created_at updated_at
  require_table_columns "$module_db" methods id definition_id description created_at updated_at
  require_table_columns "$module_db" requirements id description created_at updated_at
  require_table_columns "$module_db" specifications id requirement_id description created_at updated_at
  require_table_columns "$module_db" use_cases id description created_at updated_at
  require_table_columns "$module_db" test_cases id specification_id description expected_result created_at updated_at
  require_table_columns "$module_db" dependencies id description created_at updated_at
  require_table_columns "$module_db" bugs id description severity status created_at updated_at

  local def_fk_count
  def_fk_count="$(sqlite3 "$module_db" "PRAGMA foreign_key_list(definitions);" | wc -l | tr -d ' ')"
  (( def_fk_count >= 1 )) || fatal "schema mismatch: definitions missing foreign key in $module_db"

  require_index "$module_db" idx_definitions_file_id
  require_index "$module_db" idx_methods_definition_id
  require_index "$module_db" idx_specifications_requirement_id
  require_index "$module_db" idx_test_cases_specification_id
}

ensure_main_db() {
  [[ -f "$MAIN_SCHEMA_FILE" ]] || fatal "main schema file not found: $MAIN_SCHEMA_FILE"
  mkdir -p "$WORK_ROOT"
  if [[ ! -f "$MAIN_DB" ]]; then
    sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$MAIN_DB" < "$MAIN_SCHEMA_FILE"
  fi
  validate_main_schema
}

normalize_module_name() {
  local name=$1
  [[ -n "$name" ]] || fatal "module name cannot be empty"
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || fatal "invalid module name '$name' (allowed: letters, digits, ., _, -)"
  printf '%s' "$name"
}

module_path_for_name() {
  local module_name
  module_name="$(normalize_module_name "$1")"
  local escaped
  escaped="$(sql_escape "$module_name")"
  local module_path
  module_path="$(sqlite3 "$MAIN_DB" "SELECT path FROM modules WHERE name='$escaped' LIMIT 1;")"
  if [[ -n "$module_path" ]]; then
    printf '%s' "$module_path"
    return
  fi
  printf '%s/%s' "$MODULES_DIR" "$module_name"
}

module_id_for_name() {
  local module_name
  module_name="$(normalize_module_name "$1")"
  local escaped
  escaped="$(sql_escape "$module_name")"
  sqlite3 "$MAIN_DB" "SELECT id FROM modules WHERE name='$escaped' LIMIT 1;"
}

register_module() {
  local module_name module_path description status
  module_name="$(normalize_module_name "$1")"
  module_path=${2:-"$MODULES_DIR/$module_name"}
  description=${3:-"Module '$module_name' tracked by LEAD"}
  status=${4:-active}

  mkdir -p "$module_path"

  local name_esc path_esc desc_esc status_esc
  name_esc="$(sql_escape "$module_name")"
  path_esc="$(sql_escape "$module_path")"
  desc_esc="$(sql_escape "$description")"
  status_esc="$(sql_escape "$status")"

  sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT INTO modules(name, path, description, status)
VALUES('$name_esc', '$path_esc', '$desc_esc', '$status_esc')
ON CONFLICT(name) DO UPDATE SET
  path=excluded.path,
  description=excluded.description,
  status=excluded.status;
COMMIT;"
}

ensure_module_db() {
  local module_name
  module_name="$(normalize_module_name "$1")"

  ensure_main_db
  register_module "$module_name"

  local module_path module_db
  module_path="$(module_path_for_name "$module_name")"
  module_db="$module_path/lead-module.db"

  mkdir -p "$module_path"
  [[ -f "$MODULE_SCHEMA_FILE" ]] || fatal "module schema file not found: $MODULE_SCHEMA_FILE"

  if [[ ! -f "$module_db" ]]; then
    sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$module_db" < "$MODULE_SCHEMA_FILE"
  fi

  validate_module_schema "$module_db"

  local module_name_esc module_path_esc
  module_name_esc="$(sql_escape "$module_name")"
  module_path_esc="$(sql_escape "$module_path")"

  sqlite_exec "$module_db" "
BEGIN;
INSERT INTO module_metadata(key, value, description)
VALUES
('module_name', '$module_name_esc', 'Module name for this module database'),
('module_path', '$module_path_esc', 'Filesystem path for this module database')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, description=excluded.description;
COMMIT;"

}

normalize_relpath() {
  local base=$1
  local file=$2
  base=${base%/}
  if [[ "$file" == "$base/"* ]]; then
    printf '%s' "${file#"$base/"}"
    return
  fi
  if [[ "$file" == "$base" ]]; then
    printf '.'
    return
  fi
  if [[ "$file" == ./* ]]; then
    printf '%s' "${file#./}"
    return
  fi
  printf '%s' "$file"
}

extract_name_from_signature() {
  local sig=${1:-}
  local name
  name="$(printf '%s\n' "$sig" | sed -E '
    s/.*\b(class|struct|enum|trait|impl|mod|type)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\2/;t
    s/.*\bdef[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/;t
    s/.*\bfunction[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/;t
    s/.*\b([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*\(.*/\1/;t
    s/.*::([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*\(.*/\1/;t
    s/.*\bconst[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/;t
    s/^([A-Za-z_][A-Za-z0-9_]*).*/\1/
  ' | head -n 1)"
  if [[ -z "$name" ]]; then
    name="unknown"
  fi
  printf '%s' "$name"
}

map_definition_type() {
  local t=${1:-unknown}
  case "$t" in
    function|class|const|method|signal|property|handler|script|style|template|attribute|struct|enum|trait|impl|module|macro|static|type)
      printf '%s' "$t"
      ;;
    *)
      printf 'unknown'
      ;;
  esac
}

scan_cpp_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      line=$0
      trimmed=line
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^(class|struct)[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "class" sep trimmed sep sig
      } else if (match(trimmed,/^[A-Za-z_][A-Za-z0-9_:<>~*& \t]*[ \t]+[A-Za-z_][A-Za-z0-9_:<>~]*[ \t]*\([^;{}]*\)[ \t]*(const)?[ \t]*(noexcept[^{]*)?\{/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (index(trimmed,";") == 0 && match(trimmed,/^[A-Za-z_][A-Za-z0-9_:<>~*& \t]*[ \t]+[A-Za-z_][A-Za-z0-9_:<>~]*[ \t]*\([^)]*\)[ \t]*(const)?[ \t]*(noexcept[^{]*)?$/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      }
    }
  ' "$file"
}

scan_python_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^class[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "class" sep trimmed sep sig
      } else if (match(trimmed,/^def[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)[ \t]*:/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      }
    }
  ' "$file"
}

scan_shell_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^function[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*(\(\))?[ \t]*\{?/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^[A-Za-z_][A-Za-z0-9_]*[ \t]*\(\)[ \t]*\{?/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      }
    }
  ' "$file"
}

scan_qml_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^function[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)[ \t]*\{?/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^signal[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)?/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "signal" sep trimmed sep sig
      } else if (match(trimmed,/^property[ \t]+[A-Za-z0-9_<>.]+[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "property" sep trimmed sep sig
      } else if (match(trimmed,/^on[A-Z][A-Za-z0-9_]*[ \t]*:/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "handler" sep trimmed sep sig
      }
    }
  ' "$file"
}

scan_javascript_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^(export[ \t]+)?(default[ \t]+)?class[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "class" sep trimmed sep sig
      } else if (match(trimmed,/^(export[ \t]+)?default[ \t]+class/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "class" sep trimmed sep sig
      } else if (match(trimmed,/^(export[ \t]+)?(async[ \t]+)?function[ \t]*\*?[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^(export[ \t]+)?default[ \t]+(async[ \t]+)?function[ \t]*\*?[ \t]*\([^)]*\)/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^(export[ \t]+)?(const|let|var)[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*(async[ \t]+)?(function[ \t]*\*?[ \t]*\([^)]*\)|\([^)]*\)[ \t]*=>|[A-Za-z_][A-Za-z0-9_]*[ \t]*=>)/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^export[ \t]+const[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "const" sep trimmed sep sig
      }
    }
  ' "$file"
}

scan_html_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    BEGIN { in_script=0 }
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)
      lower=tolower(trimmed)

      if (match(lower,/<script[^>]*>/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "script" sep trimmed sep sig
        in_script=1
      }
      if (match(lower,/<style[^>]*>/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "style" sep trimmed sep sig
      }
      if (match(lower,/<template[^>]*>/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "template" sep trimmed sep sig
      }
      if (match(trimmed,/(id|name)[ \t]*=[ \t]*"[^"]+"/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "attribute" sep trimmed sep sig
      } else if (match(trimmed,/(id|name)[ \t]*=[ \t]*'\''[^'\'']+'\''/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "attribute" sep trimmed sep sig
      }

      if (in_script) {
        if (match(trimmed,/^(export[ \t]+)?(default[ \t]+)?class[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
          sig=substr(trimmed,RSTART,RLENGTH)
          print NR sep "class" sep trimmed sep sig
        } else if (match(trimmed,/^(export[ \t]+)?(async[ \t]+)?function[ \t]*\*?[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)/)) {
          sig=substr(trimmed,RSTART,RLENGTH)
          print NR sep "function" sep trimmed sep sig
        } else if (match(trimmed,/^(export[ \t]+)?(const|let|var)[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*(async[ \t]+)?(function[ \t]*\*?[ \t]*\([^)]*\)|\([^)]*\)[ \t]*=>|[A-Za-z_][A-Za-z0-9_]*[ \t]*=>)/)) {
          sig=substr(trimmed,RSTART,RLENGTH)
          print NR sep "function" sep trimmed sep sig
        } else if (match(trimmed,/^export[ \t]+const[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
          sig=substr(trimmed,RSTART,RLENGTH)
          print NR sep "const" sep trimmed sep sig
        }
      }

      if (match(lower,/<\/script[ \t]*>/)) {
        in_script=0
      }
    }
  ' "$file"
}

scan_rust_file() {
  local file=$1
  local sep=$2
  awk -v sep="$sep" '
    {
      trimmed=$0
      sub(/^[ \t]+/,"",trimmed)
      gsub(/[ \t]+$/,"",trimmed)

      if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?((async|const|unsafe)[ \t]+)*fn[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "function" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?struct[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "struct" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?enum[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "enum" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?trait[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "trait" sep trimmed sep sig
      } else if (match(trimmed,/^impl([ \t]*<[^>]+>)?[ \t]+[A-Za-z_][A-Za-z0-9_:<>]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "impl" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?type[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "type" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?const[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "const" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?static[ \t]+(mut[ \t]+)?[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "static" sep trimmed sep sig
      } else if (match(trimmed,/^macro_rules![ \t]*[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "macro" sep trimmed sep sig
      } else if (match(trimmed,/^macro[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "macro" sep trimmed sep sig
      } else if (match(trimmed,/^(pub(\([^)]*\))?[ \t]+)?mod[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        sig=substr(trimmed,RSTART,RLENGTH)
        print NR sep "module" sep trimmed sep sig
      }
    }
  ' "$file"
}

discover_files() {
  local base_path=$1
  local max_depth=$2
  shift 2
  local -a filters=("$@")

  local -a cmd=(find "$base_path")
  if (( max_depth > 0 )); then
    cmd+=(-maxdepth "$max_depth")
  fi

  if ((${#SCAN_EXCLUDES[@]} > 0)); then
    local -a prune_expr=()
    local ex ex_path
    for ex in "${SCAN_EXCLUDES[@]}"; do
      ex_path="$ex"
      if [[ "$ex_path" != /* ]]; then
        ex_path="${base_path%/}/${ex_path#/}"
      fi
      ex_path="${ex_path%/}"
      if ((${#prune_expr[@]} > 0)); then
        prune_expr+=(-o)
      fi
      prune_expr+=(-path "$ex_path" -o -path "$ex_path/*")
    done
    cmd+=("(" "${prune_expr[@]}" ")" -prune -o)
  fi

  if ((${#filters[@]} > 0)); then
    cmd+=("(")
    local i
    for i in "${!filters[@]}"; do
      cmd+=(-name "${filters[$i]}")
      if (( i < ${#filters[@]} - 1 )); then
        cmd+=(-o)
      fi
    done
    cmd+=(")")
  fi

  cmd+=(-type f -print0)
  "${cmd[@]}"
}

process_scan_file() {
  local file=$1
  local rel_path=$2
  local result_ndjson=$3
  local sync_tsv=$4

  local ext=${file##*.}
  ext=${ext,,}

  local scanner=""
  local language=""

  case "$ext" in
    c|cc|cpp|cxx|h|hpp|hh|hxx)
      scanner=scan_cpp_file
      language=cpp
      ;;
    py)
      scanner=scan_python_file
      language=python
      ;;
    sh)
      scanner=scan_shell_file
      language=shell
      ;;
    qml)
      scanner=scan_qml_file
      language=qml
      ;;
    js|mjs)
      scanner=scan_javascript_file
      language=javascript
      ;;
    html)
      scanner=scan_html_file
      language=html
      ;;
    rs)
      scanner=scan_rust_file
      language=rust
      ;;
    *)
      return
      ;;
  esac

  [[ -r "$file" ]] || {
    warn "Skipping unreadable file: $file"
    return
  }

  local scan_tmp
  scan_tmp=$(mktemp)
  "$scanner" "$file" "$FIELD_SEP" > "$scan_tmp" || true

  while IFS="$FIELD_SEP" read -r line dtype text sig; do
    [[ -z "$line" || -z "$dtype" ]] && continue
    sig=${sig:-$text}

    local logical_type
    logical_type="$dtype"
    if [[ "$logical_type" == "function" && "$sig" == *"::"* ]]; then
      logical_type="method"
    fi

    local def_type name
    def_type="$(map_definition_type "$logical_type")"
    name="$(extract_name_from_signature "$sig")"

    jq -nc \
      --arg file "$rel_path" \
      --argjson line "$line" \
      --arg text "$text" \
      --arg type "$dtype" \
      --arg signature "$sig" \
      --arg language "$language" \
      '{file:$file,line:$line,text:$text,type:$type,signature:$signature,language:$language}' >> "$result_ndjson"

    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$rel_path" "$def_type" "$name" "$sig" "$text" "$language" >> "$sync_tsv"
  done < "$scan_tmp"

  rm -f "$scan_tmp"
}

sync_scan_results_to_module_db() {
  local module_db=$1
  local sync_tsv=$2

  [[ -s "$sync_tsv" ]] || return 0

  local sql_tmp
  sql_tmp=$(mktemp)

  {
    printf 'PRAGMA foreign_keys=ON;\nBEGIN;\n'

    while IFS=$'\t' read -r rel_path def_type def_name signature matched_text language; do
      local rel_esc type_esc name_esc sig_esc text_esc lang_esc
      rel_esc="$(sql_escape "$rel_path")"
      type_esc="$(sql_escape "$def_type")"
      name_esc="$(sql_escape "$def_name")"
      sig_esc="$(sql_escape "$signature")"
      text_esc="$(sql_escape "$matched_text")"
      lang_esc="$(sql_escape "$language")"

      printf "INSERT OR IGNORE INTO files(path, description) VALUES('%s', '%s');\n" "$rel_esc" "$(sql_escape "$PLACEHOLDER_DESCRIPTION")"
      printf "INSERT OR IGNORE INTO definitions(file_id, name, type, signature, description)\n"
      printf "SELECT id, '%s', '%s', '%s', '%s | language=%s' FROM files WHERE path='%s';\n" \
        "$name_esc" "$type_esc" "$sig_esc" "$text_esc" "$lang_esc" "$rel_esc"

      if [[ "$def_type" == "function" || "$def_type" == "method" ]]; then
        printf "INSERT OR IGNORE INTO methods(definition_id, description)\n"
        printf "SELECT d.id, '%s' FROM definitions d\n" "$(sql_escape "Method derived from scan signature: $signature")"
        printf "JOIN files f ON f.id=d.file_id\n"
        printf "WHERE f.path='%s' AND d.name='%s' AND d.type='%s' AND d.signature='%s';\n" \
          "$rel_esc" "$name_esc" "$type_esc" "$sig_esc"
      fi
    done < "$sync_tsv"

    printf 'COMMIT;\n'
  } > "$sql_tmp"

  sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$module_db" < "$sql_tmp"
  rm -f "$sql_tmp"
}

append_global_search_rows() {
  local out=$1

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',name,
  'entity','module',
  'id',id,
  'name',name,
  'path',path,
  'type',NULL,
  'signature',NULL,
  'description',description,
  'status',status,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',created_at,
  'updated_at',updated_at
) FROM modules;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','requirement',
  'id',r.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',r.description,
  'status',r.status,
  'priority',r.priority,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',r.id,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',r.created_at,
  'updated_at',r.updated_at
) FROM requirements r JOIN modules m ON m.id=r.module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','specification',
  'id',s.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',s.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',s.requirement_id,
  'specification_id',s.id,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',s.verification_method,
  'expected_result',NULL,
  'source_db','global',
  'created_at',s.created_at,
  'updated_at',s.updated_at
) FROM specifications s JOIN modules m ON m.id=s.module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','use_case',
  'id',u.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',u.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',u.actor,
  'preconditions',u.preconditions,
  'postconditions',u.postconditions,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',u.created_at,
  'updated_at',u.updated_at
) FROM use_cases u JOIN modules m ON m.id=u.module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','test_case',
  'id',t.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',t.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',t.specification_id,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',t.expected_result,
  'source_db','global',
  'created_at',t.created_at,
  'updated_at',t.updated_at
) FROM test_cases t JOIN modules m ON m.id=t.module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','dependency',
  'id',d.id,
  'name',NULL,
  'path',NULL,
  'type',d.type,
  'signature',NULL,
  'description',m.name || ' depends on ' || dm.name,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',dm.name,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',d.created_at,
  'updated_at',d.updated_at
) FROM dependencies d
JOIN modules m ON m.id=d.module_id
JOIN modules dm ON dm.id=d.depends_on_module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',m.name,
  'entity','bug',
  'id',b.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',b.description,
  'status',b.status,
  'priority',NULL,
  'severity',b.severity,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',b.created_at,
  'updated_at',b.updated_at
) FROM bugs b JOIN modules m ON m.id=b.module_id;" >> "$out"

  sqlite_exec "$MAIN_DB" "
SELECT json_object(
  'scope','global',
  'module',COALESCE(m.name, ''),
  'entity','constraint',
  'id',c.id,
  'name',NULL,
  'path',NULL,
  'type',c.type,
  'signature',NULL,
  'description',c.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','global',
  'created_at',c.created_at,
  'updated_at',c.updated_at
) FROM constraints c LEFT JOIN modules m ON m.id=c.module_id;" >> "$out"
}

append_module_search_rows() {
  local module_name=$1
  local module_db=$2
  local out=$3
  local module_esc
  module_esc="$(sql_escape "$module_name")"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','file',
  'id',f.id,
  'name',NULL,
  'path',f.path,
  'type',NULL,
  'signature',NULL,
  'description',f.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',f.path,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',f.created_at,
  'updated_at',f.updated_at
) FROM files f;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','definition',
  'id',d.id,
  'name',d.name,
  'path',f.path,
  'type',d.type,
  'signature',d.signature,
  'description',d.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',f.path,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',d.created_at,
  'updated_at',d.updated_at
) FROM definitions d JOIN files f ON f.id=d.file_id;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','method',
  'id',m.id,
  'name',d.name,
  'path',f.path,
  'type',d.type,
  'signature',d.signature,
  'description',m.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',f.path,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',m.created_at,
  'updated_at',m.updated_at
) FROM methods m
JOIN definitions d ON d.id=m.definition_id
JOIN files f ON f.id=d.file_id;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','requirement',
  'id',r.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',r.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',r.id,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',r.created_at,
  'updated_at',r.updated_at
) FROM requirements r;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','specification',
  'id',s.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',s.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',s.requirement_id,
  'specification_id',s.id,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',s.created_at,
  'updated_at',s.updated_at
) FROM specifications s;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','use_case',
  'id',u.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',u.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',u.created_at,
  'updated_at',u.updated_at
) FROM use_cases u;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','test_case',
  'id',t.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',t.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',t.specification_id,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',t.expected_result,
  'source_db','$module_esc',
  'created_at',t.created_at,
  'updated_at',t.updated_at
) FROM test_cases t;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','dependency',
  'id',d.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',d.description,
  'status',NULL,
  'priority',NULL,
  'severity',NULL,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',d.created_at,
  'updated_at',d.updated_at
) FROM dependencies d;" >> "$out"

  sqlite_exec "$module_db" "
SELECT json_object(
  'scope','module',
  'module','$module_esc',
  'entity','bug',
  'id',b.id,
  'name',NULL,
  'path',NULL,
  'type',NULL,
  'signature',NULL,
  'description',b.description,
  'status',b.status,
  'priority',NULL,
  'severity',b.severity,
  'depends_on',NULL,
  'requirement_id',NULL,
  'specification_id',NULL,
  'file',NULL,
  'actor',NULL,
  'preconditions',NULL,
  'postconditions',NULL,
  'verification_method',NULL,
  'expected_result',NULL,
  'source_db','$module_esc',
  'created_at',b.created_at,
  'updated_at',b.updated_at
) FROM bugs b;" >> "$out"
}

collect_search_dataset() {
  local out=$1
  : > "$out"
  append_global_search_rows "$out"

  local modules
  modules="$(sqlite3 "$MAIN_DB" "SELECT name || '|' || path FROM modules ORDER BY name;")"
  [[ -n "$modules" ]] || return 0

  while IFS='|' read -r module_name module_path; do
    [[ -n "$module_name" && -n "$module_path" ]] || continue
    local module_db="$module_path/lead-module.db"
    if [[ -f "$module_db" ]]; then
      append_module_search_rows "$module_name" "$module_db" "$out"
    fi
  done <<< "$modules"
}

apply_search_filters() {
  local in_ndjson=$1
  local out_json=$2
  local module_filters_json=$3
  local file_filters_json=$4
  local method_filters_json=$5
  local def_filters_json=$6
  local desc_filters_json=$7
  local req_filters_json=$8
  local use_case_filters_json=$9
  local test_case_filters_json=${10}
  local dep_filters_json=${11}
  local limit=${12}

  jq -s \
    --argjson moduleFilters "$module_filters_json" \
    --argjson fileFilters "$file_filters_json" \
    --argjson methodFilters "$method_filters_json" \
    --argjson defFilters "$def_filters_json" \
    --argjson descFilters "$desc_filters_json" \
    --argjson reqFilters "$req_filters_json" \
    --argjson useCaseFilters "$use_case_filters_json" \
    --argjson testCaseFilters "$test_case_filters_json" \
    --argjson depFilters "$dep_filters_json" \
    --argjson limit "$limit" '
      def glob_re($g):
        "^" + ($g
          | gsub("([][().+^$|{}\\\\])"; "\\\\\\1")
          | gsub("\\*"; ".*")
          | gsub("\\?"; ".")) + "$";

      def any_glob($value; $patterns):
        if ($patterns | length) == 0 then true
        else any($patterns[]; . as $p | (($value // "") | tostring | test(glob_re($p); "i")))
        end;

      def any_id_or_glob($row; $field; $patterns):
        if ($patterns | length) == 0 then true
        else any($patterns[];
          . as $p |
          ((($p | test("^[0-9]+$")) and (($row.id // -1) == ($p | tonumber)))
          or ((($row[$field] // "") | tostring) | test(glob_re($p); "i"))
          or ((($row.description // "") | tostring) | test(glob_re($p); "i")))
        )
        end;

      map(select(
        any_glob(.module; $moduleFilters)
        and any_id_or_glob(.; "file"; $fileFilters)
        and any_id_or_glob(.; "signature"; $methodFilters)
        and any_id_or_glob(.; "signature"; $defFilters)
        and any_id_or_glob(.; "description"; $descFilters)
        and (
          if ($reqFilters | length) == 0 then true
          else ((.entity == "requirement") and any_id_or_glob(.; "description"; $reqFilters))
            or ((.entity != "requirement") and any($reqFilters[]; . as $p | (($p | test("^[0-9]+$")) and ((.requirement_id // -1) == ($p | tonumber)))) )
          end
        )
        and (
          if ($useCaseFilters | length) == 0 then true
          else (.entity == "use_case" and any_id_or_glob(.; "description"; $useCaseFilters))
          end
        )
        and (
          if ($testCaseFilters | length) == 0 then true
          else (.entity == "test_case" and any_id_or_glob(.; "description"; $testCaseFilters))
          end
        )
        and (
          if ($depFilters | length) == 0 then true
          else (.entity == "dependency" and (
            any_id_or_glob(.; "description"; $depFilters)
            or any_id_or_glob(.; "depends_on"; $depFilters)
            or any_id_or_glob(.; "type"; $depFilters)
          ))
          end
        )
      ))
      | .[:$limit]
    ' "$in_ndjson" > "$out_json"
}

render_search_output() {
  local filtered_json=$1
  local mode=$2
  local columns_json=$3

  case "$mode" in
    json)
      jq --argjson cols "$columns_json" '
        if ($cols | length) == 0 then .
        else
          map(. as $row |
            reduce $cols[] as $c ({}; . + {($c): ($row[$c] // null)})
          )
        end
      ' "$filtered_json"
      ;;
    csv)
      jq -r --argjson cols "$columns_json" '
        def default_cols:
          ["scope","module","entity","id","file","name","type","signature","description"];
        ($cols | if length == 0 then default_cols else . end) as $out_cols |
        ($out_cols | @csv),
        (.[] | [ $out_cols[] as $c | (.[$c] // "") ] | @csv)
      ' "$filtered_json"
      ;;
    table)
      local tsv
      tsv="$(jq -r --argjson cols "$columns_json" '
        def default_cols:
          ["scope","module","entity","id","file","name","type","signature","description"];
        ($cols | if length == 0 then default_cols else . end) as $out_cols |
        ($out_cols | @tsv),
        (.[] | [ $out_cols[] as $c | (.[$c] // "") ] | @tsv)
      ' "$filtered_json")"
      if command -v column >/dev/null 2>&1; then
        printf '%s\n' "$tsv" | column -t -s $'\t'
      else
        printf '%s\n' "$tsv"
      fi
      ;;
    *)
      fatal "unknown output mode: $mode"
      ;;
  esac
}

infer_item_module_name() {
  local item=$1
  local default_module=$2
  shift 2
  local module
  for module in "$@"; do
    if [[ "$item" == "$module:"* || "$item" == "[$module]"* || "$item" == "$module -"* ]]; then
      printf '%s' "$module"
      return
    fi
  done
  printf '%s' "$default_module"
}

collect_readme_section_items() {
  local readme=$1
  local section=$2
  awk -v want="$section" '
    function norm(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      s=tolower(s)
      gsub(/[^a-z0-9]+/, "_", s)
      return s
    }
    {
      line=$0
      if (match(line, /^#{1,6}[[:space:]]+/)) {
        heading=line
        sub(/^#{1,6}[[:space:]]+/, "", heading)
        current=norm(heading)
        next
      }

      trimmed=line
      sub(/^[[:space:]]+/, "", trimmed)

      if (trimmed ~ /^[-*][[:space:]]+/ || trimmed ~ /^[0-9]+\.[[:space:]]+/) {
        item=trimmed
        sub(/^[-*][[:space:]]+/, "", item)
        sub(/^[0-9]+\.[[:space:]]+/, "", item)

        if (want == "modules") {
          if (current ~ /module/ || item ~ /^[Mm]odule[[:space:]]*:/) {
            sub(/^[Mm]odule[[:space:]]*:[[:space:]]*/, "", item)
            print item
          }
        } else if (want == "requirements" && current ~ /requirement/) {
          print item
        } else if (want == "constraints" && current ~ /constraint/) {
          print item
        } else if (want == "use_cases" && current ~ /use_case|usecases|usecase/) {
          print item
        } else if (want == "dependencies" && current ~ /depend/) {
          print item
        }
      }

      if (want == "modules" && trimmed ~ /^[Mm]odule[[:space:]]*:/) {
        item=trimmed
        sub(/^[Mm]odule[[:space:]]*:[[:space:]]*/, "", item)
        print item
      }
    }
  ' "$readme"
}

open_clarifications_interactive() {
  local prompt_mode=$1
  [[ "$prompt_mode" == "interactive" ]] || return 0
  [[ -t 0 ]] || return 0

  local open_rows
  open_rows="$(sqlite3 "$MAIN_DB" "SELECT id || '|' || prompt FROM clarification_requests WHERE status='open' ORDER BY id;")"
  [[ -n "$open_rows" ]] || return 0

  while IFS='|' read -r cid prompt; do
    [[ -n "$cid" ]] || continue
    printf 'Clarification %s: %s\n' "$cid" "$prompt" >&2
    printf 'Response (leave empty to keep open): ' >&2
    local answer
    IFS= read -r answer || true
    if [[ -n "$answer" ]]; then
      local answer_esc
      answer_esc="$(sql_escape "$answer")"
      sqlite_exec "$MAIN_DB" "UPDATE clarification_requests SET status='answered', response='$answer_esc' WHERE id=$cid;"
    fi
  done <<< "$open_rows"
}

insert_analysis_payload() {
  local readme_path=$1
  local payload_json=$2
  local readme_esc payload_esc
  readme_esc="$(sql_escape "$readme_path")"
  payload_esc="$(sql_escape "$payload_json")"
  sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT INTO analysis_runs(readme_path, result_payload, description)
VALUES('$readme_esc', '$payload_esc', 'Deterministic README analysis run');
COMMIT;"
}

build_intent_payload() {
  local module_name=$1
  local module_id=$2
  local module_db=$3
  local out_json=$4
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local global_requirements global_specs global_dependencies global_tests global_use_cases global_bugs global_constraints
  local module_files module_definitions module_methods module_requirements module_specs module_use_cases module_tests module_dependencies module_bugs
  local module_links

  global_requirements="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, description, priority, status, created_at, updated_at FROM requirements WHERE module_id=$module_id ORDER BY id;")"
  global_specs="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, requirement_id, description, verification_method, created_at, updated_at FROM specifications WHERE module_id=$module_id ORDER BY id;")"
  global_dependencies="$(sqlite_json_query "$MAIN_DB" "SELECT d.id, d.module_id, d.depends_on_module_id, dm.name AS depends_on_module_name, d.type, d.created_at, d.updated_at FROM dependencies d JOIN modules dm ON dm.id=d.depends_on_module_id WHERE d.module_id=$module_id ORDER BY d.id;")"
  global_tests="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, specification_id, description, expected_result, created_at, updated_at FROM test_cases WHERE module_id=$module_id ORDER BY id;")"
  global_use_cases="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, description, actor, preconditions, postconditions, created_at, updated_at FROM use_cases WHERE module_id=$module_id ORDER BY id;")"
  global_bugs="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, description, severity, status, created_at, updated_at FROM bugs WHERE module_id=$module_id ORDER BY id;")"
  global_constraints="$(sqlite_json_query "$MAIN_DB" "SELECT id, module_id, description, type, created_at, updated_at FROM constraints WHERE module_id=$module_id OR module_id IS NULL ORDER BY id;")"

  module_files="$(sqlite_json_query "$module_db" "SELECT id, path, description, created_at, updated_at FROM files ORDER BY id;")"
  module_definitions="$(sqlite_json_query "$module_db" "SELECT d.id, d.file_id, f.path, d.name, d.type, d.signature, d.description, d.created_at, d.updated_at FROM definitions d JOIN files f ON f.id=d.file_id ORDER BY d.id;")"
  module_methods="$(sqlite_json_query "$module_db" "SELECT m.id, m.definition_id, d.name, d.signature, m.description, m.created_at, m.updated_at FROM methods m JOIN definitions d ON d.id=m.definition_id ORDER BY m.id;")"
  module_requirements="$(sqlite_json_query "$module_db" "SELECT id, description, created_at, updated_at FROM requirements ORDER BY id;")"
  module_specs="$(sqlite_json_query "$module_db" "SELECT id, requirement_id, description, created_at, updated_at FROM specifications ORDER BY id;")"
  module_use_cases="$(sqlite_json_query "$module_db" "SELECT id, description, created_at, updated_at FROM use_cases ORDER BY id;")"
  module_tests="$(sqlite_json_query "$module_db" "SELECT id, specification_id, description, expected_result, created_at, updated_at FROM test_cases ORDER BY id;")"
  module_dependencies="$(sqlite_json_query "$module_db" "SELECT id, description, created_at, updated_at FROM dependencies ORDER BY id;")"
  module_bugs="$(sqlite_json_query "$module_db" "SELECT id, description, severity, status, created_at, updated_at FROM bugs ORDER BY id;")"

  module_links="$(jq -n \
    --argjson definition_requirements "$(sqlite_json_query "$module_db" "SELECT id, definition_id, requirement_id, description, created_at, updated_at FROM definition_requirements ORDER BY id;")" \
    --argjson definition_use_cases "$(sqlite_json_query "$module_db" "SELECT id, definition_id, use_case_id, description, created_at, updated_at FROM definition_use_cases ORDER BY id;")" \
    --argjson method_requirements "$(sqlite_json_query "$module_db" "SELECT id, method_id, requirement_id, description, created_at, updated_at FROM method_requirements ORDER BY id;")" \
    --argjson method_use_cases "$(sqlite_json_query "$module_db" "SELECT id, method_id, use_case_id, description, created_at, updated_at FROM method_use_cases ORDER BY id;")" \
    --argjson requirement_specifications "$(sqlite_json_query "$module_db" "SELECT id, requirement_id, specification_id, description, created_at, updated_at FROM requirement_specifications ORDER BY id;")" \
    --argjson specification_test_cases "$(sqlite_json_query "$module_db" "SELECT id, specification_id, test_case_id, description, created_at, updated_at FROM specification_test_cases ORDER BY id;")" \
    --argjson file_requirements "$(sqlite_json_query "$module_db" "SELECT id, file_id, requirement_id, description, created_at, updated_at FROM file_requirements ORDER BY id;")" \
    --argjson file_use_cases "$(sqlite_json_query "$module_db" "SELECT id, file_id, use_case_id, description, created_at, updated_at FROM file_use_cases ORDER BY id;")" \
    '{
      definition_requirements: $definition_requirements,
      definition_use_cases: $definition_use_cases,
      method_requirements: $method_requirements,
      method_use_cases: $method_use_cases,
      requirement_specifications: $requirement_specifications,
      specification_test_cases: $specification_test_cases,
      file_requirements: $file_requirements,
      file_use_cases: $file_use_cases
    }')"

  jq -n \
    --arg module "$module_name" \
    --argjson module_id "$module_id" \
    --arg generated_at "$timestamp" \
    --argjson global_requirements "$global_requirements" \
    --argjson global_specs "$global_specs" \
    --argjson global_dependencies "$global_dependencies" \
    --argjson global_tests "$global_tests" \
    --argjson global_use_cases "$global_use_cases" \
    --argjson global_bugs "$global_bugs" \
    --argjson global_constraints "$global_constraints" \
    --argjson module_files "$module_files" \
    --argjson module_definitions "$module_definitions" \
    --argjson module_methods "$module_methods" \
    --argjson module_requirements "$module_requirements" \
    --argjson module_specs "$module_specs" \
    --argjson module_use_cases "$module_use_cases" \
    --argjson module_tests "$module_tests" \
    --argjson module_dependencies "$module_dependencies" \
    --argjson module_bugs "$module_bugs" \
    --argjson module_links "$module_links" \
    '{
      module: { name: $module, id: $module_id },
      generated_at: $generated_at,
      global: {
        requirements: $global_requirements,
        specifications: $global_specs,
        dependencies: $global_dependencies,
        test_cases: $global_tests,
        use_cases: $global_use_cases,
        bugs: $global_bugs,
        constraints: $global_constraints
      },
      module_db: {
        files: $module_files,
        definitions: $module_definitions,
        methods: $module_methods,
        requirements: $module_requirements,
        specifications: $module_specs,
        use_cases: $module_use_cases,
        test_cases: $module_tests,
        dependencies: $module_dependencies,
        bugs: $module_bugs,
        links: $module_links
      }
    }' > "$out_json"
}

persist_intent_run() {
  local module_id=$1
  local request_json=$2
  local response_json=$3
  local status=$4
  local description=$5

  local req_esc resp_esc desc_esc
  req_esc="$(sql_escape "$request_json")"
  desc_esc="$(sql_escape "$description")"

  if [[ -n "$response_json" ]]; then
    resp_esc="'$(sql_escape "$response_json")'"
  else
    resp_esc="NULL"
  fi

  sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT INTO intent_runs(module_id, request_payload, response_payload, status, description)
VALUES($module_id, '$req_esc', $resp_esc, '$(sql_escape "$status")', '$desc_esc');
COMMIT;"
}

persist_module_intent_run() {
  local module_db=$1
  local request_json=$2
  local response_json=$3
  local status=$4
  local description=$5

  local req_esc resp_esc desc_esc
  req_esc="$(sql_escape "$request_json")"
  desc_esc="$(sql_escape "$description")"

  if [[ -n "$response_json" ]]; then
    resp_esc="'$(sql_escape "$response_json")'"
  else
    resp_esc="NULL"
  fi

  sqlite_exec "$module_db" "
BEGIN;
INSERT INTO intent_implementation_runs(description, request_payload, response_payload, status)
VALUES('$desc_esc', '$req_esc', $resp_esc, '$(sql_escape "$status")');
COMMIT;"
}

apply_intent_links() {
  local module_db=$1
  local response_json=$2

  local sql_tmp
  sql_tmp=$(mktemp)
  printf 'PRAGMA foreign_keys=ON;\nBEGIN;\n' > "$sql_tmp"

  jq -c '.links.definition_requirements[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local definition_id requirement_id description
    definition_id="$(jq -r '.definition_id // empty' <<< "$row")"
    requirement_id="$(jq -r '.requirement_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$definition_id" && -n "$requirement_id" ]] || continue
    printf "INSERT OR IGNORE INTO definition_requirements(definition_id, requirement_id, description) VALUES(%s, %s, '%s');\n" \
      "$definition_id" "$requirement_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  jq -c '.links.definition_use_cases[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local definition_id use_case_id description
    definition_id="$(jq -r '.definition_id // empty' <<< "$row")"
    use_case_id="$(jq -r '.use_case_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$definition_id" && -n "$use_case_id" ]] || continue
    printf "INSERT OR IGNORE INTO definition_use_cases(definition_id, use_case_id, description) VALUES(%s, %s, '%s');\n" \
      "$definition_id" "$use_case_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  jq -c '.links.method_requirements[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local method_id requirement_id description
    method_id="$(jq -r '.method_id // empty' <<< "$row")"
    requirement_id="$(jq -r '.requirement_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$method_id" && -n "$requirement_id" ]] || continue
    printf "INSERT OR IGNORE INTO method_requirements(method_id, requirement_id, description) VALUES(%s, %s, '%s');\n" \
      "$method_id" "$requirement_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  jq -c '.links.method_use_cases[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local method_id use_case_id description
    method_id="$(jq -r '.method_id // empty' <<< "$row")"
    use_case_id="$(jq -r '.use_case_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$method_id" && -n "$use_case_id" ]] || continue
    printf "INSERT OR IGNORE INTO method_use_cases(method_id, use_case_id, description) VALUES(%s, %s, '%s');\n" \
      "$method_id" "$use_case_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  jq -c '.links.requirement_specifications[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local requirement_id specification_id description
    requirement_id="$(jq -r '.requirement_id // empty' <<< "$row")"
    specification_id="$(jq -r '.specification_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$requirement_id" && -n "$specification_id" ]] || continue
    printf "INSERT OR IGNORE INTO requirement_specifications(requirement_id, specification_id, description) VALUES(%s, %s, '%s');\n" \
      "$requirement_id" "$specification_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  jq -c '.links.specification_test_cases[]? // empty' <<< "$response_json" | while IFS= read -r row; do
    local specification_id test_case_id description
    specification_id="$(jq -r '.specification_id // empty' <<< "$row")"
    test_case_id="$(jq -r '.test_case_id // empty' <<< "$row")"
    description="$(jq -r '.description // "Linked by intent response"' <<< "$row")"
    [[ -n "$specification_id" && -n "$test_case_id" ]] || continue
    printf "INSERT OR IGNORE INTO specification_test_cases(specification_id, test_case_id, description) VALUES(%s, %s, '%s');\n" \
      "$specification_id" "$test_case_id" "$(sql_escape "$description")" >> "$sql_tmp"
  done

  printf 'COMMIT;\n' >> "$sql_tmp"
  sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$module_db" < "$sql_tmp"
  rm -f "$sql_tmp"
}

print_usage() {
  cat <<'EOF'
Usage:
  lead.sh init
  lead.sh analyze [--readme README.md] [--interactive]
  lead.sh module list
  lead.sh module add --module NAME [--path PATH] [--description TEXT] [--status STATUS]
  lead.sh module update --module NAME [--new-name NAME] [--path PATH] [--description TEXT] [--status STATUS]
  lead.sh module del --module NAME
  lead.sh scan --module NAME [--path PATH] [--max-depth N] [--filter GLOB]... [--exclude DIR]...
  lead.sh search [filters...] [--columns c1,c2,...] [--limit N] [--json|--csv|--table]
  lead.sh intent --module NAME [focus filters...] [--llm-cmd CMD] [--json|--raw]
  lead.sh query --table TABLE [--module NAME] [--columns c1,c2] [--where SQL] [--order-by SQL] [--limit N] [--json|--csv|--table]
  lead.sh insert [--module NAME] TABLE key=value [key=value...]
  lead.sh update [--module NAME] TABLE --set key=value [--set key=value...] [--id N|--where SQL]
  lead.sh delete [--module NAME] TABLE [--id N|--where SQL]
  lead.sh describe [--module NAME] TABLE [--schema] [--id N|--where SQL]
  lead.sh raw [--module NAME] [SQL]

Search filters:
  --module PATTERN
  --file PATTERN
  --method PATTERN
  --definition PATTERN
  --description PATTERN
  --requirement PATTERN
  --use-case PATTERN
  --test-case PATTERN
  --dependencies PATTERN

Output options:
  --json    JSON output
  --csv     CSV output
  --table   Table output (default where applicable)
EOF
}

cmd_init() {
  local readme_path="$WORK_ROOT/README.md"
  [[ -f "$readme_path" ]] || fatal "README.md not found in $WORK_ROOT"

  ensure_main_db
  mkdir -p "$MODULES_DIR"

  local root_esc readme_esc
  root_esc="$(sql_escape "$WORK_ROOT")"
  readme_esc="$(sql_escape "$readme_path")"

  sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT INTO project_metadata(key, value, description)
VALUES
('project_root', '$root_esc', 'Absolute project root where LEAD was initialized'),
('readme_path', '$readme_esc', 'README path used for deterministic analysis'),
('initialized_at', datetime('now'), 'UTC timestamp when LEAD initialization ran')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, description=excluded.description;
COMMIT;"

  log "Initialized LEAD project database: $MAIN_DB"
}

cmd_module() {
  ensure_main_db

  local sub=${1:-}
  [[ -n "$sub" ]] || fatal "module subcommand required (list/add/update/del)"
  shift || true

  case "$sub" in
    list)
      sqlite_exec_mode "$MAIN_DB" column "SELECT id, name, path, status, description, created_at, updated_at FROM modules ORDER BY name;"
      ;;
    add)
      local module_name="" module_path="" module_desc="" module_status="active"
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --module) module_name=${2:-}; shift 2 ;;
          --path) module_path=${2:-}; shift 2 ;;
          --description) module_desc=${2:-}; shift 2 ;;
          --status) module_status=${2:-}; shift 2 ;;
          *) fatal "unknown module add option: $1" ;;
        esac
      done
      [[ -n "$module_name" ]] || fatal "module add requires --module"
      [[ -n "$module_path" ]] || module_path="$MODULES_DIR/$module_name"
      [[ -n "$module_desc" ]] || module_desc="Module '$module_name' tracked by LEAD"
      register_module "$module_name" "$module_path" "$module_desc" "$module_status"
      ensure_module_db "$module_name"
      log "Module registered: $module_name ($module_path)"
      ;;
    update)
      local module_name="" new_name="" module_path="" module_desc="" module_status=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --module) module_name=${2:-}; shift 2 ;;
          --new-name) new_name=${2:-}; shift 2 ;;
          --path) module_path=${2:-}; shift 2 ;;
          --description) module_desc=${2:-}; shift 2 ;;
          --status) module_status=${2:-}; shift 2 ;;
          *) fatal "unknown module update option: $1" ;;
        esac
      done
      [[ -n "$module_name" ]] || fatal "module update requires --module"
      local current_path
      current_path="$(module_path_for_name "$module_name")"
      [[ -n "$new_name" ]] || new_name="$module_name"
      [[ -n "$module_path" ]] || module_path="$current_path"
      if [[ -z "$module_desc" ]]; then
        module_desc="$(sqlite3 "$MAIN_DB" "SELECT description FROM modules WHERE name='$(sql_escape "$module_name")' LIMIT 1;")"
        [[ -n "$module_desc" ]] || module_desc="Module '$new_name' tracked by LEAD"
      fi
      if [[ -z "$module_status" ]]; then
        module_status="$(sqlite3 "$MAIN_DB" "SELECT status FROM modules WHERE name='$(sql_escape "$module_name")' LIMIT 1;")"
        [[ -n "$module_status" ]] || module_status="active"
      fi

      sqlite_exec "$MAIN_DB" "
BEGIN;
UPDATE modules SET
  name='$(sql_escape "$new_name")',
  path='$(sql_escape "$module_path")',
  description='$(sql_escape "$module_desc")',
  status='$(sql_escape "$module_status")'
WHERE name='$(sql_escape "$module_name")';
COMMIT;"

      if [[ "$current_path" != "$module_path" ]]; then
        mkdir -p "$module_path"
        if [[ -f "$current_path/lead-module.db" && ! -f "$module_path/lead-module.db" ]]; then
          cp "$current_path/lead-module.db" "$module_path/lead-module.db"
        fi
      fi

      ensure_module_db "$new_name"
      log "Module updated: $module_name -> $new_name"
      ;;
    del)
      local module_name=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --module) module_name=${2:-}; shift 2 ;;
          *) fatal "unknown module del option: $1" ;;
        esac
      done
      [[ -n "$module_name" ]] || fatal "module del requires --module"
      sqlite_exec "$MAIN_DB" "
BEGIN;
DELETE FROM modules WHERE name='$(sql_escape "$module_name")';
COMMIT;"
      log "Module removed from global registry: $module_name"
      ;;
    *)
      fatal "unknown module subcommand: $sub"
      ;;
  esac
}

cmd_scan() {
  ensure_main_db

  local module_name=""
  local scan_path=""
  local max_depth=0
  local mode="json"
  local -a filters=()
  SCAN_EXCLUDES=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module)
        module_name=${2:-}
        shift 2
        ;;
      --path)
        scan_path=${2:-}
        shift 2
        ;;
      --max-depth)
        max_depth=${2:-}
        shift 2
        ;;
      --filter)
        filters+=("${2:-}")
        shift 2
        ;;
      --exclude)
        SCAN_EXCLUDES+=("${2:-}")
        shift 2
        ;;
      --json)
        mode="json"
        shift
        ;;
      --csv)
        mode="csv"
        shift
        ;;
      --table)
        mode="table"
        shift
        ;;
      *)
        fatal "unknown scan option: $1"
        ;;
    esac
  done

  [[ -n "$module_name" ]] || fatal "scan requires --module"
  ensure_module_db "$module_name"

  if [[ -z "$scan_path" ]]; then
    scan_path="$(module_path_for_name "$module_name")"
  fi
  [[ -d "$scan_path" ]] || fatal "scan path is not a directory: $scan_path"

  if [[ -n "$max_depth" && "$max_depth" != "0" ]]; then
    [[ "$max_depth" =~ ^[0-9]+$ ]] || fatal "--max-depth must be 0 or a positive integer"
    (( max_depth >= 0 )) || fatal "--max-depth must be >= 0"
  else
    max_depth=0
  fi

  if ((${#filters[@]} == 0)); then
    filters=("${DEFAULT_FILTERS[@]}")
  fi

  local tmp_out tmp_err
  tmp_out=$(mktemp)
  tmp_err=$(mktemp)

  discover_files "$scan_path" "$max_depth" "${filters[@]}" > "$tmp_out" 2> "$tmp_err" || true

  if [[ -s "$tmp_err" ]]; then
    while IFS= read -r line; do
      warn "$line"
    done < "$tmp_err"
  fi
  rm -f "$tmp_err"

  mapfile -d '' SCAN_FILES < <(LC_ALL=C sort -z "$tmp_out")
  rm -f "$tmp_out"

  local result_ndjson sync_tsv
  result_ndjson=$(mktemp)
  sync_tsv=$(mktemp)
  : > "$result_ndjson"
  : > "$sync_tsv"

  local file rel
  for file in "${SCAN_FILES[@]}"; do
    rel="$(normalize_relpath "$scan_path" "$file")"
    process_scan_file "$file" "$rel" "$result_ndjson" "$sync_tsv"
  done

  local module_db
  module_db="$(module_path_for_name "$module_name")/lead-module.db"
  sync_scan_results_to_module_db "$module_db" "$sync_tsv"

  local out_json
  out_json=$(mktemp)
  if [[ -s "$result_ndjson" ]]; then
    jq -s . "$result_ndjson" > "$out_json"
  else
    printf '[]\n' > "$out_json"
  fi

  case "$mode" in
    json)
      cat "$out_json"
      ;;
    csv)
      jq -r '
        ["file","line","type","signature","language","text"] | @csv,
        (.[] | [.file, .line, .type, .signature, .language, .text] | @csv)
      ' "$out_json"
      ;;
    table)
      local tsv
      tsv="$(jq -r '
        ["file","line","type","signature","language","text"] | @tsv,
        (.[] | [.file, .line, .type, .signature, .language, .text] | @tsv)
      ' "$out_json")"
      if command -v column >/dev/null 2>&1; then
        printf '%s\n' "$tsv" | column -t -s $'\t'
      else
        printf '%s\n' "$tsv"
      fi
      ;;
    *)
      fatal "unknown output mode: $mode"
      ;;
  esac

  rm -f "$result_ndjson" "$sync_tsv" "$out_json"
}

cmd_search() {
  ensure_main_db

  local mode="table"
  local limit=2000
  local columns=""

  local -a module_filters=()
  local -a file_filters=()
  local -a method_filters=()
  local -a def_filters=()
  local -a desc_filters=()
  local -a req_filters=()
  local -a use_case_filters=()
  local -a test_case_filters=()
  local -a dep_filters=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_filters+=("${2:-}"); shift 2 ;;
      --file) file_filters+=("${2:-}"); shift 2 ;;
      --method) method_filters+=("${2:-}"); shift 2 ;;
      --definition) def_filters+=("${2:-}"); shift 2 ;;
      --description) desc_filters+=("${2:-}"); shift 2 ;;
      --requirement) req_filters+=("${2:-}"); shift 2 ;;
      --use-case) use_case_filters+=("${2:-}"); shift 2 ;;
      --test-case) test_case_filters+=("${2:-}"); shift 2 ;;
      --dependencies) dep_filters+=("${2:-}"); shift 2 ;;
      --columns) columns=${2:-}; shift 2 ;;
      --limit) limit=${2:-}; shift 2 ;;
      --json) mode="json"; shift ;;
      --csv) mode="csv"; shift ;;
      --table) mode="table"; shift ;;
      *) fatal "unknown search option: $1" ;;
    esac
  done

  [[ "$limit" =~ ^[0-9]+$ ]] || fatal "--limit must be a positive integer"

  local columns_json
  if [[ -n "$columns" ]]; then
    columns_json="$(printf '%s' "$columns" | tr ',' '\n' | awk 'NF{print}' | jq -R . | jq -s .)"
  else
    columns_json='[]'
  fi

  local dataset_ndjson filtered_json
  dataset_ndjson=$(mktemp)
  filtered_json=$(mktemp)

  collect_search_dataset "$dataset_ndjson"

  apply_search_filters \
    "$dataset_ndjson" \
    "$filtered_json" \
    "$(json_array_from_args "${module_filters[@]}")" \
    "$(json_array_from_args "${file_filters[@]}")" \
    "$(json_array_from_args "${method_filters[@]}")" \
    "$(json_array_from_args "${def_filters[@]}")" \
    "$(json_array_from_args "${desc_filters[@]}")" \
    "$(json_array_from_args "${req_filters[@]}")" \
    "$(json_array_from_args "${use_case_filters[@]}")" \
    "$(json_array_from_args "${test_case_filters[@]}")" \
    "$(json_array_from_args "${dep_filters[@]}")" \
    "$limit"

  render_search_output "$filtered_json" "$mode" "$columns_json"

  rm -f "$dataset_ndjson" "$filtered_json"
}

cmd_analyze() {
  ensure_main_db

  local readme_path="$WORK_ROOT/README.md"
  local prompt_mode="noninteractive"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --readme)
        readme_path=${2:-}
        shift 2
        ;;
      --interactive)
        prompt_mode="interactive"
        shift
        ;;
      *)
        fatal "unknown analyze option: $1"
        ;;
    esac
  done

  [[ -f "$readme_path" ]] || fatal "README file not found: $readme_path"

  local -a modules requirements constraints use_cases dependencies

  mapfile -t modules < <(collect_readme_section_items "$readme_path" modules | awk 'NF' | sort -u)
  mapfile -t requirements < <(collect_readme_section_items "$readme_path" requirements | awk 'NF')
  mapfile -t constraints < <(collect_readme_section_items "$readme_path" constraints | awk 'NF')
  mapfile -t use_cases < <(collect_readme_section_items "$readme_path" use_cases | awk 'NF')
  mapfile -t dependencies < <(collect_readme_section_items "$readme_path" dependencies | awk 'NF')

  if ((${#modules[@]} == 0)); then
    modules=(core)
  fi

  local primary_module=${modules[0]}
  local module
  for module in "${modules[@]}"; do
    module="$(normalize_module_name "$module")"
    ensure_module_db "$module"
  done

  local item target_module target_module_id item_esc

  sqlite_exec "$MAIN_DB" "BEGIN; COMMIT;"

  for item in "${requirements[@]}"; do
    target_module="$(infer_item_module_name "$item" "$primary_module" "${modules[@]}")"
    target_module_id="$(module_id_for_name "$target_module")"
    [[ -n "$target_module_id" ]] || continue
    item_esc="$(sql_escape "$item")"
    sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO requirements(module_id, description, priority, status)
VALUES($target_module_id, '$item_esc', 'medium', 'open');
COMMIT;"
  done

  for item in "${constraints[@]}"; do
    target_module="$(infer_item_module_name "$item" "$primary_module" "${modules[@]}")"
    target_module_id="$(module_id_for_name "$target_module")"
    [[ -n "$target_module_id" ]] || continue
    item_esc="$(sql_escape "$item")"
    sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO constraints(module_id, description, type)
VALUES($target_module_id, '$item_esc', 'readme');
COMMIT;"
  done

  for item in "${use_cases[@]}"; do
    target_module="$(infer_item_module_name "$item" "$primary_module" "${modules[@]}")"
    target_module_id="$(module_id_for_name "$target_module")"
    [[ -n "$target_module_id" ]] || continue
    item_esc="$(sql_escape "$item")"
    sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO use_cases(module_id, description, actor, preconditions, postconditions)
VALUES($target_module_id, '$item_esc', 'user', 'N/A', 'N/A');
COMMIT;"
  done

  for item in "${dependencies[@]}"; do
    local dep_from dep_to dep_type
    dep_type="logical"
    dep_from=""
    dep_to=""

    local dep_pattern='^([A-Za-z0-9._-]+)[[:space:]]*[-=][[:space:]]*>[[:space:]]*([A-Za-z0-9._-]+)'
    if [[ "$item" =~ $dep_pattern ]]; then
      dep_from="${BASH_REMATCH[1]}"
      dep_to="${BASH_REMATCH[2]}"
    fi

    if [[ -n "$dep_from" && -n "$dep_to" ]]; then
      dep_from="$(normalize_module_name "$dep_from")"
      dep_to="$(normalize_module_name "$dep_to")"
      ensure_module_db "$dep_from"
      ensure_module_db "$dep_to"

      local from_id to_id
      from_id="$(module_id_for_name "$dep_from")"
      to_id="$(module_id_for_name "$dep_to")"
      if [[ -n "$from_id" && -n "$to_id" && "$from_id" != "$to_id" ]]; then
        sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO dependencies(module_id, depends_on_module_id, type)
VALUES($from_id, $to_id, '$dep_type');
COMMIT;"
      fi
    fi
  done

  local req_rows
  req_rows="$(sqlite3 "$MAIN_DB" "SELECT id, module_id, description FROM requirements ORDER BY id;")"
  if [[ -n "$req_rows" ]]; then
    while IFS='|' read -r req_id req_module_id req_desc; do
      [[ -n "$req_id" ]] || continue
      local spec_desc spec_verification
      spec_desc="Specification derived from requirement $req_id: $req_desc"
      spec_verification="Deterministic verification: linked test case for requirement $req_id must pass"
      sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO specifications(module_id, requirement_id, description, verification_method)
VALUES($req_module_id, $req_id, '$(sql_escape "$spec_desc")', '$(sql_escape "$spec_verification")');
COMMIT;"
    done <<< "$req_rows"
  fi

  local spec_rows
  spec_rows="$(sqlite3 "$MAIN_DB" "SELECT id, module_id, description FROM specifications ORDER BY id;")"
  if [[ -n "$spec_rows" ]]; then
    while IFS='|' read -r spec_id spec_module_id spec_desc; do
      [[ -n "$spec_id" ]] || continue
      sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT OR IGNORE INTO test_cases(module_id, specification_id, description, expected_result)
VALUES($spec_module_id, $spec_id, '$(sql_escape "Test for specification $spec_id")', '$(sql_escape "Specification $spec_id passes deterministic verification")');
COMMIT;"
    done <<< "$spec_rows"
  fi

  local ambiguity_rows
  ambiguity_rows="$(grep -nEi '\\b(TBD|TODO|FIXME|XXX|maybe|unclear|ambiguous)\\b|\\?' "$readme_path" || true)"
  if [[ -n "$ambiguity_rows" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      local prompt prompt_esc
      prompt="Clarify README ambiguity: $line"
      prompt_esc="$(sql_escape "$prompt")"
      sqlite_exec "$MAIN_DB" "
BEGIN;
INSERT INTO clarification_requests(module_id, source, prompt, status, response, description)
VALUES(NULL, 'README', '$prompt_esc', 'open', NULL, 'Clarification required from deterministic README analysis');
COMMIT;"
    done <<< "$ambiguity_rows"
  fi

  local analysis_payload
  analysis_payload="$(jq -n \
    --arg readme "$readme_path" \
    --argjson modules "$(json_array_from_args "${modules[@]}")" \
    --argjson requirements "$(json_array_from_args "${requirements[@]}")" \
    --argjson constraints "$(json_array_from_args "${constraints[@]}")" \
    --argjson use_cases "$(json_array_from_args "${use_cases[@]}")" \
    --argjson dependencies "$(json_array_from_args "${dependencies[@]}")" \
    --argjson ambiguities "$(if [[ -n "$ambiguity_rows" ]]; then printf '%s\n' "$ambiguity_rows" | jq -R . | jq -s .; else printf '[]'; fi)" \
    '{
      readme: $readme,
      modules: $modules,
      requirements: $requirements,
      constraints: $constraints,
      use_cases: $use_cases,
      dependencies: $dependencies,
      ambiguities: $ambiguities
    }')"

  insert_analysis_payload "$readme_path" "$analysis_payload"
  open_clarifications_interactive "$prompt_mode"

  printf '%s\n' "$analysis_payload"
}

cmd_intent() {
  ensure_main_db

  local module_name=""
  local llm_cmd="${LEAD_LLM_CMD:-}"
  local mode="json"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module)
        module_name=${2:-}
        shift 2
        ;;
      --llm-cmd)
        llm_cmd=${2:-}
        shift 2
        ;;
      --json)
        mode="json"
        shift
        ;;
      --raw)
        mode="raw"
        shift
        ;;
      --file|--method|--definition|--requirement|--use-case|--test-case|--dependencies|--description)
        shift 2
        ;;
      *)
        fatal "unknown intent option: $1"
        ;;
    esac
  done

  [[ -n "$module_name" ]] || fatal "intent requires --module"
  ensure_module_db "$module_name"

  local module_id module_db
  module_id="$(module_id_for_name "$module_name")"
  [[ -n "$module_id" ]] || fatal "module not found: $module_name"
  module_db="$(module_path_for_name "$module_name")/lead-module.db"

  local payload_file
  payload_file=$(mktemp)
  build_intent_payload "$module_name" "$module_id" "$module_db" "$payload_file"

  local payload_json
  payload_json="$(cat "$payload_file")"

  if [[ -z "$llm_cmd" ]]; then
    persist_intent_run "$module_id" "$payload_json" "" "context_ready" "Intent context prepared for module '$module_name'"
    persist_module_intent_run "$module_db" "$payload_json" "" "context_ready" "Intent context prepared for module '$module_name'"
    if [[ "$mode" == "raw" ]]; then
      cat "$payload_file"
    else
      jq . "$payload_file"
    fi
    rm -f "$payload_file"
    return
  fi

  local llm_response status
  if ! llm_response="$(printf '%s' "$payload_json" | bash -lc "$llm_cmd")"; then
    persist_intent_run "$module_id" "$payload_json" "" "failed" "Intent LLM request failed for module '$module_name'"
    persist_module_intent_run "$module_db" "$payload_json" "" "failed" "Intent LLM request failed for module '$module_name'"
    rm -f "$payload_file"
    fatal "LLM command failed"
  fi

  if ! jq . >/dev/null 2>&1 <<< "$llm_response"; then
    persist_intent_run "$module_id" "$payload_json" "$llm_response" "failed" "Intent LLM response was invalid JSON"
    persist_module_intent_run "$module_db" "$payload_json" "$llm_response" "failed" "Intent LLM response was invalid JSON"
    rm -f "$payload_file"
    fatal "LLM response is not valid JSON"
  fi

  apply_intent_links "$module_db" "$llm_response"
  status="completed"
  persist_intent_run "$module_id" "$payload_json" "$llm_response" "$status" "Intent implementation generated for module '$module_name'"
  persist_module_intent_run "$module_db" "$payload_json" "$llm_response" "$status" "Intent implementation generated for module '$module_name'"

  if [[ "$mode" == "raw" ]]; then
    printf '%s\n' "$llm_response"
  else
    jq . <<< "$llm_response"
  fi

  rm -f "$payload_file"
}

resolve_target_db() {
  local module_name=${1:-}
  if [[ -z "$module_name" ]]; then
    ensure_main_db
    printf '%s' "$MAIN_DB"
    return
  fi
  ensure_module_db "$module_name"
  printf '%s/lead-module.db' "$(module_path_for_name "$module_name")"
}

cmd_query() {
  local module_name=""
  local table=""
  local columns="*"
  local where_clause=""
  local order_by=""
  local limit=50
  local mode="table"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      --table) table=${2:-}; shift 2 ;;
      --columns) columns=${2:-}; shift 2 ;;
      --where) where_clause=${2:-}; shift 2 ;;
      --order-by) order_by=${2:-}; shift 2 ;;
      --limit) limit=${2:-}; shift 2 ;;
      --json) mode="json"; shift ;;
      --csv) mode="csv"; shift ;;
      --table-output|--table) mode="table"; shift ;;
      *)
        if [[ -z "$table" ]]; then
          table=$1
          shift
        else
          fatal "unknown query option: $1"
        fi
        ;;
    esac
  done

  [[ -n "$table" ]] || fatal "query requires --table TABLE"
  [[ "$limit" =~ ^[0-9]+$ ]] || fatal "query --limit must be a positive integer"

  local db sql
  db="$(resolve_target_db "$module_name")"

  sql="SELECT $columns FROM $table"
  if [[ -n "$where_clause" ]]; then
    sql+=" WHERE $where_clause"
  fi
  if [[ -n "$order_by" ]]; then
    sql+=" ORDER BY $order_by"
  fi
  sql+=" LIMIT $limit;"

  case "$mode" in
    json) sqlite_json_query "$db" "$sql" ;;
    csv) sqlite_exec_mode "$db" csv "$sql" ;;
    table) sqlite_exec_mode "$db" column "$sql" ;;
    *) fatal "unknown query mode: $mode" ;;
  esac
}

cmd_insert() {
  local module_name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done

  local table=${1:-}
  [[ -n "$table" ]] || fatal "insert requires TABLE"
  shift || true

  [[ $# -gt 0 ]] || fatal "insert requires key=value pairs"

  local -a cols=() vals=()
  local kv key value
  for kv in "$@"; do
    [[ "$kv" == *=* ]] || fatal "invalid insert assignment: $kv"
    key=${kv%%=*}
    value=${kv#*=}
    cols+=("$key")
    vals+=("'$(sql_escape "$value")'")
  done

  local col_sql val_sql
  col_sql=$(IFS=','; echo "${cols[*]}")
  val_sql=$(IFS=','; echo "${vals[*]}")

  local db
  db="$(resolve_target_db "$module_name")"
  sqlite_exec "$db" "BEGIN; INSERT INTO $table($col_sql) VALUES($val_sql); COMMIT;"
}

cmd_update() {
  local module_name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done

  local table=${1:-}
  [[ -n "$table" ]] || fatal "update requires TABLE"
  shift || true

  local -a sets=()
  local id=""
  local where_clause=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --set)
        [[ "${2:-}" == *=* ]] || fatal "--set requires key=value"
        local key value
        key=${2%%=*}
        value=${2#*=}
        sets+=("$key='$(sql_escape "$value")'")
        shift 2
        ;;
      --id)
        id=${2:-}
        shift 2
        ;;
      --where)
        where_clause=${2:-}
        shift 2
        ;;
      *)
        fatal "unknown update option: $1"
        ;;
    esac
  done

  ((${#sets[@]} > 0)) || fatal "update requires at least one --set"
  [[ -n "$id" || -n "$where_clause" ]] || fatal "update requires --id or --where"

  local set_sql
  set_sql=$(IFS=','; echo "${sets[*]}")

  local db
  db="$(resolve_target_db "$module_name")"

  if [[ -n "$id" ]]; then
    sqlite_exec "$db" "BEGIN; UPDATE $table SET $set_sql WHERE id=$id; COMMIT;"
  else
    sqlite_exec "$db" "BEGIN; UPDATE $table SET $set_sql WHERE $where_clause; COMMIT;"
  fi
}

cmd_delete() {
  local module_name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done

  local table=${1:-}
  [[ -n "$table" ]] || fatal "delete requires TABLE"
  shift || true

  local id=""
  local where_clause=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id=${2:-}; shift 2 ;;
      --where) where_clause=${2:-}; shift 2 ;;
      *) fatal "unknown delete option: $1" ;;
    esac
  done

  [[ -n "$id" || -n "$where_clause" ]] || fatal "delete requires --id or --where"

  local db
  db="$(resolve_target_db "$module_name")"
  if [[ -n "$id" ]]; then
    sqlite_exec "$db" "BEGIN; DELETE FROM $table WHERE id=$id; COMMIT;"
  else
    sqlite_exec "$db" "BEGIN; DELETE FROM $table WHERE $where_clause; COMMIT;"
  fi
}

cmd_describe() {
  local module_name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done

  local table=${1:-}
  [[ -n "$table" ]] || fatal "describe requires TABLE"
  shift || true

  local show_schema=0
  local id=""
  local where_clause=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --schema) show_schema=1; shift ;;
      --id) id=${2:-}; shift 2 ;;
      --where) where_clause=${2:-}; shift 2 ;;
      *) fatal "unknown describe option: $1" ;;
    esac
  done

  local db
  db="$(resolve_target_db "$module_name")"

  if (( show_schema == 1 )); then
    sqlite_exec_mode "$db" column "PRAGMA table_info($table);"
    return
  fi

  local sql="SELECT * FROM $table"
  if [[ -n "$id" ]]; then
    sql+=" WHERE id=$id"
  elif [[ -n "$where_clause" ]]; then
    sql+=" WHERE $where_clause"
  fi
  sql+=" LIMIT 20;"

  sqlite_exec_mode "$db" column "$sql"
}

cmd_raw() {
  local module_name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --module) module_name=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done

  local db
  db="$(resolve_target_db "$module_name")"

  if [[ $# -eq 0 ]]; then
    sqlite3 -cmd ".timeout $SQLITE_TIMEOUT_MS" "$db"
    return
  fi

  local sql="$*"
  sqlite_exec_mode "$db" column "$sql"
}

main() {
  require_tools

  local cmd=${1:-}
  if [[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" ]]; then
    print_usage
    exit 0
  fi
  shift || true

  case "$cmd" in
    init) cmd_init "$@" ;;
    analyze) cmd_analyze "$@" ;;
    module|modules) cmd_module "$@" ;;
    scan) cmd_scan "$@" ;;
    search) cmd_search "$@" ;;
    intent) cmd_intent "$@" ;;
    query) cmd_query "$@" ;;
    insert) cmd_insert "$@" ;;
    update) cmd_update "$@" ;;
    delete) cmd_delete "$@" ;;
    describe) cmd_describe "$@" ;;
    raw) cmd_raw "$@" ;;
    *) fatal "unknown command: $cmd" ;;
  esac
}

main "$@"
