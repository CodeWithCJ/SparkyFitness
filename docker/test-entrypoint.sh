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
assert_eq "missing leading slash is prepended" "/sparky/" "$(normalize_base_path "sparky" 2>/dev/null)"
assert_eq "missing both slashes are added" "/sparky/" "$(normalize_base_path "sparky/" 2>/dev/null)"
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

if grep -qF 'sub_filter '"'"'<base href="/" />'"'"' '"'"'<base href="/sparky/" />'"'"';' "$TMP_CONF"; then
  echo "PASS: sub_filter substitutes SPARKY_BASE_PATH into base href"
  pass=$((pass + 1))
else
  echo "FAIL: sub_filter substitutes SPARKY_BASE_PATH into base href"
  fail=$((fail + 1))
fi

FRONTEND_DIR="$(cd "${SCRIPT_DIR}/../SparkyFitnessFrontend" && pwd)"
if [[ -f "${FRONTEND_DIR}/dist/index.html" ]]; then
  if grep -qF '<base href="/" />' "${FRONTEND_DIR}/dist/index.html"; then
    echo "PASS: built dist/index.html still emits the exact base href nginx's sub_filter expects"
    pass=$((pass + 1))
  else
    echo "FAIL: built dist/index.html does NOT contain '<base href=\"/\" />' -- nginx's sub_filter in docker/nginx.conf will silently stop matching. Update both together."
    fail=$((fail + 1))
  fi
else
  echo "SKIP: ${FRONTEND_DIR}/dist/index.html not found -- run 'pnpm run build' in SparkyFitnessFrontend/ first to include this check"
fi

if [[ -f "${FRONTEND_DIR}/dist/index.html" ]]; then
  if [[ "$(grep -c 'rel="manifest"' "${FRONTEND_DIR}/dist/index.html")" == "1" ]]; then
    echo "PASS: dist/index.html has exactly one manifest link (VitePWA's generated one, not a stale static duplicate)"
    pass=$((pass + 1))
  else
    echo "FAIL: dist/index.html does not have exactly one <link rel=\"manifest\"> tag -- check for a reintroduced public/manifest.json"
    fail=$((fail + 1))
  fi
fi

if [[ -f "${FRONTEND_DIR}/dist/sw.js" ]]; then
  if grep -qF 'createHandlerBoundToURL("./index.html")' "${FRONTEND_DIR}/dist/sw.js"; then
    echo "PASS: built dist/sw.js resolves its offline navigation fallback relative to the service worker's own scope"
    pass=$((pass + 1))
  else
    echo "FAIL: dist/sw.js does not contain createHandlerBoundToURL(\"./index.html\") -- navigateFallback in vite.config.ts may have regressed to an absolute path"
    fail=$((fail + 1))
  fi
else
  echo "SKIP: ${FRONTEND_DIR}/dist/sw.js not found -- run 'pnpm run build' in SparkyFitnessFrontend/ first to include this check"
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
