#!/bin/bash
set -e

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

    mkdir -p /var/run/nginx \
         /var/cache/nginx/client-body \
         /var/cache/nginx/proxy \
         /var/cache/nginx/fastcgi \
         /var/cache/nginx/uwsgi \
         /var/cache/nginx/scgi \
         /etc/nginx/conf.d
fi

echo "Starting SparkyFitness Frontend as ${NGINX_PERMISSION_MODE} with environment variables:"
echo "  SPARKY_FITNESS_SERVER_HOST=${SPARKY_FITNESS_SERVER_HOST}"
echo "  SPARKY_FITNESS_SERVER_PORT=${SPARKY_FITNESS_SERVER_PORT}"
echo "  NGINX_RATE_LIMIT=${NGINX_RATE_LIMIT:-5r/s}"
echo "  NGINX_LISTEN_PORT=${NGINX_LISTEN_PORT}"
echo "  NGINX_ACCESS_LOG=${NGINX_ACCESS_LOG}"
echo "  NGINX_ERROR_LOG=${NGINX_ERROR_LOG}"
echo "  NGINX_DUMP_CONFIG=${NGINX_DUMP_CONFIG:-false}"
echo "  SPARKY_FITNESS_FRONTEND_URL=${SPARKY_FITNESS_FRONTEND_URL}"

# Substitute environment variables in the nginx template
echo "Generating nginx configuration from template..."
envsubst "\$SPARKY_FITNESS_SERVER_HOST \$SPARKY_FITNESS_SERVER_PORT \$NGINX_RATE_LIMIT \$SPARKY_FITNESS_FRONTEND_URL \$NGINX_LISTEN_PORT \$NGINX_ACCESS_LOG \$NGINX_ERROR_LOG" < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

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
