#!/bin/bash
set -e

echo "Starting SparkyFitness Frontend with environment variables:"
echo "  SPARKY_FITNESS_SERVER_HOST=${SPARKY_FITNESS_SERVER_HOST}"
echo "  SPARKY_FITNESS_SERVER_PORT=${SPARKY_FITNESS_SERVER_PORT}"
echo "  NGINX_RATE_LIMIT=${NGINX_RATE_LIMIT:-5r/s}"
echo "  SPARKY_FITNESS_FRONTEND_URL=${SPARKY_FITNESS_FRONTEND_URL}"

# Substitute environment variables in the nginx template
echo "Generating nginx configuration from template..."
envsubst "\$SPARKY_FITNESS_SERVER_HOST \$SPARKY_FITNESS_SERVER_PORT \$NGINX_RATE_LIMIT \$SPARKY_FITNESS_FRONTEND_URL" < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Print the generated nginx configuration for debugging
echo "--- Generated Nginx Configuration ---"
cat /etc/nginx/conf.d/default.conf
echo "-------------------------------------"

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
if ! nginx -t; then
    echo "ERROR: Invalid nginx configuration generated!"
    echo "Generated config:"
    cat /etc/nginx/conf.d/default.conf
    exit 1
fi

echo "Configuration validated successfully. Starting nginx..."
echo "Backend will be proxied to: ${SPARKY_FITNESS_SERVER_HOST}:${SPARKY_FITNESS_SERVER_PORT}"

# Start nginx
exec nginx -g "daemon off;"
