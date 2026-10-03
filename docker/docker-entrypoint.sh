#!/bin/bash
set -e

NGINX_TEMPLATE_VARS='$SPARKY_FITNESS_SERVER_HOST $SPARKY_FITNESS_SERVER_PORT $NGINX_RATE_LIMIT $SPARKY_FITNESS_FRONTEND_URL $NGINX_LISTEN_PORT $NGINX_ACCESS_LOG $NGINX_ERROR_LOG $NGINX_RESOLVER $SPARKY_BASE_PATH'

normalize_base_path() {
    local value="${1:-/}"
    if [[ "$value" != /* ]]; then
        echo "WARNING: SPARKY_BASE_PATH should start with '/'; using '/${value}'" >&2
        value="/${value}"
    fi
    if [[ "$value" != */ ]]; then
        echo "WARNING: SPARKY_BASE_PATH should end with '/'; using '${value}/'" >&2
        value="${value}/"
    fi
    if [[ ! "$value" =~ ^/[A-Za-z0-9._~/-]*$ ]] || [[ "$value" == *".."* ]]; then
        echo "WARNING: SPARKY_BASE_PATH contains characters outside [A-Za-z0-9._~/-] or a '..' path segment; ignoring and using '/'" >&2
        value="/"
    fi
    echo "$value"
}

main() {
    if [ "$(id -u)" -eq 0 ]; then
        NGINX_PERMISSION_MODE="root"
        export NGINX_LISTEN_PORT=${NGINX_LISTEN_PORT:-80}
        export NGINX_ACCESS_LOG=${NGINX_ACCESS_LOG:-/var/log/nginx/access.log}
        export NGINX_ERROR_LOG=${NGINX_ERROR_LOG:-/var/log/nginx/error.log}
    else
        NGINX_PERMISSION_MODE="non-root"
        export NGINX_LISTEN_PORT=${NGINX_LISTEN_PORT:-8080}
        export NGINX_ACCESS_LOG=${NGINX_ACCESS_LOG:-/dev/stdout}
        export NGINX_ERROR_LOG=${NGINX_ERROR_LOG:-/dev/stderr}
    fi

    export SPARKY_BASE_PATH="$(normalize_base_path "${SPARKY_BASE_PATH:-/}")"

    # Ensure folders exist (required if directories are mounted as emptyDir volumes, e.g. in Kubernetes)
    # We ignore errors in case the filesystem is read-only but directories already exist in the image.
    mkdir -p /var/run/nginx \
         /var/cache/nginx/client-body \
         /var/cache/nginx/proxy \
         /var/cache/nginx/fastcgi \
         /var/cache/nginx/uwsgi \
         /var/cache/nginx/scgi \
         /etc/nginx/conf.d 2>/dev/null || true

    # nginx.conf references ${NGINX_RATE_LIMIT} directly, and envsubst replaces an
    # unset or empty variable with an empty string -- which would render
    # "rate=;" and make nginx fail to start. Every supported deployment path
    # (Dockerfile ENV, compose, Helm) already supplies a default, so this only
    # guards someone passing the variable through explicitly empty.
    export NGINX_RATE_LIMIT="${NGINX_RATE_LIMIT:-5r/s}"

    # Auto-detect DNS resolver from /etc/resolv.conf if NGINX_RESOLVER is not explicitly provided.
    # Defaults to 127.0.0.11 (Docker's default embedded DNS).
    if [ -z "${NGINX_RESOLVER}" ]; then
        RESOLVER_FROM_CONF=$(awk '/^nameserver/{print $2}' /etc/resolv.conf 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//')
        NGINX_RESOLVER="${RESOLVER_FROM_CONF:-127.0.0.11}"
    fi

    # Normalize resolver addresses (strip interface/zone scopes and wrap bare IPv6 in brackets for nginx)
    export NGINX_RESOLVER=$(echo "${NGINX_RESOLVER}" | awk '{
        for (i = 1; i <= NF; i++) {
            val = $i;
            sub(/%[^]: ]*/, "", val);
            if (val ~ /:.*:/ && val !~ /^\[/) {
                val = "[" val "]";
            }
            printf "%s%s", (i == 1 ? "" : " "), val;
        }
        print "";
    }')

    # If SPARKY_FITNESS_SERVER_HOST is defined in /etc/hosts (extra_hosts, localhost, --link),
    # resolve it to its IP address directly so Nginx dynamic resolver doesn't fail querying DNS.
    case "${SPARKY_FITNESS_SERVER_HOST}" in
      *[!0-9.]*)
        HOSTS_IP=$(awk -v h="${SPARKY_FITNESS_SERVER_HOST}" '$0 !~ /^[[:space:]]*#/ { for (i = 2; i <= NF; i++) if ($i == h) { print $1; exit } }' /etc/hosts 2>/dev/null)
        case "${HOSTS_IP}" in
          *:*) export SPARKY_FITNESS_SERVER_HOST="[${HOSTS_IP}]" ;;
          ?*) export SPARKY_FITNESS_SERVER_HOST="${HOSTS_IP}" ;;
        esac
        ;;
    esac

    # nginx's own resolver -- which is what a variable proxy_pass upstream uses -- does
    # not implement the "search" domain expansion from /etc/resolv.conf. It queries the
    # name exactly as written, so a bare hostname that libc resolves fine returns
    # NXDOMAIN for nginx: the static assets keep serving while every proxied request
    # fails with 502.
    #
    # Docker's embedded DNS answers bare container/service names directly, so Compose
    # takes the early exit below and is unaffected. Platforms that depend on a search
    # path need the name qualified here -- on Kubernetes "sparkyfitness-server" is only
    # reachable as "<service>.<namespace>.svc.cluster.local".
    #
    # Every probe appends a trailing dot, which does two things and must not be dropped.
    # It forces an absolute lookup: without it musl applies the search list first, and a
    # genuine FQDN can fail when ndots is high (Kubernetes sets ndots:5). It also stops an
    # /etc/hosts entry from satisfying the probe, because those are matched only without
    # the trailing dot -- nginx resolves upstreams through DNS alone, so a name that exists
    # only in /etc/hosts would be exported here and then fail to resolve at request time.
    #
    # The result stays a NAME rather than an IP, so nginx keeps re-resolving it on the
    # "valid=" interval instead of caching a stale address.
    case "${SPARKY_FITNESS_SERVER_HOST}" in
      # Empty, already qualified, or an IP / bracketed IPv6 literal: nothing to do.
      ""|*.*|*:*) ;;
      *)
        if ! getent hosts "${SPARKY_FITNESS_SERVER_HOST}." >/dev/null 2>&1; then
            SF_QUALIFIED_HOST=""
            for SF_SEARCH_DOMAIN in $(awk '/^[[:space:]]*search[[:space:]]/ { for (i = 2; i <= NF; i++) print $i; exit }' /etc/resolv.conf 2>/dev/null); do
                SF_CANDIDATE_HOST="${SPARKY_FITNESS_SERVER_HOST}.${SF_SEARCH_DOMAIN%.}"
                if getent hosts "${SF_CANDIDATE_HOST}." >/dev/null 2>&1; then
                    SF_QUALIFIED_HOST="${SF_CANDIDATE_HOST}"
                    break
                fi
            done

            if [ -n "${SF_QUALIFIED_HOST}" ]; then
                echo "Qualified SPARKY_FITNESS_SERVER_HOST '${SPARKY_FITNESS_SERVER_HOST}' as '${SF_QUALIFIED_HOST}' (nginx does not expand search domains)"
                export SPARKY_FITNESS_SERVER_HOST="${SF_QUALIFIED_HOST}"
            else
                echo "WARNING: SPARKY_FITNESS_SERVER_HOST='${SPARKY_FITNESS_SERVER_HOST}' does not resolve as an absolute name," >&2
                echo "WARNING: and no search domain in /etc/resolv.conf completes it. nginx resolves proxy upstreams" >&2
                echo "WARNING: without search-domain expansion, so /api/* requests will fail with 502." >&2
                echo "WARNING: Set SPARKY_FITNESS_SERVER_HOST to a fully qualified hostname." >&2
            fi

            unset SF_QUALIFIED_HOST SF_SEARCH_DOMAIN SF_CANDIDATE_HOST
        fi
        ;;
    esac

    echo "Starting SparkyFitness Frontend as ${NGINX_PERMISSION_MODE} with environment variables:"
    echo "  SPARKY_FITNESS_SERVER_HOST=${SPARKY_FITNESS_SERVER_HOST}"
    echo "  SPARKY_FITNESS_SERVER_PORT=${SPARKY_FITNESS_SERVER_PORT}"
    echo "  NGINX_RATE_LIMIT=${NGINX_RATE_LIMIT}"
    echo "  NGINX_RESOLVER=${NGINX_RESOLVER}"
    echo "  NGINX_LISTEN_PORT=${NGINX_LISTEN_PORT}"
    echo "  NGINX_ACCESS_LOG=${NGINX_ACCESS_LOG}"
    echo "  NGINX_ERROR_LOG=${NGINX_ERROR_LOG}"
    echo "  NGINX_DUMP_CONFIG=${NGINX_DUMP_CONFIG:-false}"
    echo "  SPARKY_FITNESS_FRONTEND_URL=${SPARKY_FITNESS_FRONTEND_URL}"
    echo "  SPARKY_BASE_PATH=${SPARKY_BASE_PATH}"

    # Substitute environment variables in the nginx template
    echo "Generating nginx configuration from template..."
    envsubst "${NGINX_TEMPLATE_VARS}" < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

    # Test that substitution worked properly
    echo "Testing nginx configuration substitution..."
    if ! grep -q "${SPARKY_FITNESS_SERVER_HOST}:${SPARKY_FITNESS_SERVER_PORT}" /etc/nginx/conf.d/default.conf; then
        echo "ERROR: Environment variable substitution failed!"
        echo "Expected to find: ${SPARKY_FITNESS_SERVER_HOST}:${SPARKY_FITNESS_SERVER_PORT}"
        echo "Generated config preview:"
        head -n 20 /etc/nginx/conf.d/default.conf
        exit 1
    fi

    # Validate nginx configuration syntax
    echo "Validating nginx configuration syntax..."

    if [[ "${NGINX_DUMP_CONFIG}" == "true" ]]; then
        NGINX_TEST_CONFIG_ARG="-T"
    else
        NGINX_TEST_CONFIG_ARG="-t"
    fi

    if ! nginx "${NGINX_TEST_CONFIG_ARG}"; then
        echo "ERROR: Invalid nginx configuration generated!"
        echo "Generated config:"
        cat /etc/nginx/conf.d/default.conf
        exit 1
    fi

    echo "Configuration validated successfully. Starting nginx..."
    echo "Backend will be proxied to: ${SPARKY_FITNESS_SERVER_HOST}:${SPARKY_FITNESS_SERVER_PORT}"

    # Start nginx
    exec nginx -g "daemon off;"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
