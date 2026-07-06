#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-entrypoint.sh"

pass=0
fail=0

assert_eq() {
  local description="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "PASS: $description"
    pass=$((pass + 1))
  else
    echo "FAIL: $description (expected '$expected', got '$actual')"
    fail=$((fail + 1))
  fi
}

assert_eq "root path is unchanged" "/" "$(normalize_base_path "/" 2>/dev/null)"
assert_eq "already-normalized sub-path is unchanged" "/sparky/" "$(normalize_base_path "/sparky/" 2>/dev/null)"
assert_eq "missing trailing slash is appended" "/sparky/" "$(normalize_base_path "/sparky" 2>/dev/null)"
assert_eq "empty value defaults to /" "/" "$(normalize_base_path "" 2>/dev/null)"

TMP_CONF="$(mktemp)"
trap 'rm -f "$TMP_CONF"' EXIT

export SPARKY_FITNESS_SERVER_HOST="test-host"
export SPARKY_FITNESS_SERVER_PORT="1234"
export NGINX_RATE_LIMIT="5r/s"
export SPARKY_FITNESS_FRONTEND_URL="http://localhost"
export NGINX_LISTEN_PORT="80"
export NGINX_ACCESS_LOG="/dev/stdout"
export NGINX_ERROR_LOG="/dev/stderr"
export SPARKY_BASE_PATH="/sparky/"

envsubst "${NGINX_TEMPLATE_VARS}" < "${SCRIPT_DIR}/nginx.conf" > "$TMP_CONF"

if grep -qF 'sub_filter '"'"'<base href="/">'"'"' '"'"'<base href="/sparky/">'"'"';' "$TMP_CONF"; then
  echo "PASS: sub_filter substitutes SPARKY_BASE_PATH into base href"
  pass=$((pass + 1))
else
  echo "FAIL: sub_filter substitutes SPARKY_BASE_PATH into base href"
  fail=$((fail + 1))
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
