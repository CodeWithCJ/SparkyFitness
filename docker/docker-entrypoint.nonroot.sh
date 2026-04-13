#!/bin/sh
set -eu

echo "Starting SparkyFitness Frontend (non-root)"
echo "  SPARKY_FITNESS_SERVER_HOST=${SPARKY_FITNESS_SERVER_HOST}"
echo "  SPARKY_FITNESS_SERVER_PORT=${SPARKY_FITNESS_SERVER_PORT}"
echo "  NGINX_RATE_LIMIT=${NGINX_RATE_LIMIT:-5r/s}"
echo "  SPARKY_FITNESS_FRONTEND_URL=${SPARKY_FITNESS_FRONTEND_URL:-}"

mkdir -p /var/run/nginx \
         /var/cache/nginx/client-body \
         /var/cache/nginx/proxy \
         /var/cache/nginx/fastcgi \
         /var/cache/nginx/uwsgi \
         /var/cache/nginx/scgi \
         /etc/nginx/conf.d

envsubst "\$SPARKY_FITNESS_SERVER_HOST \$SPARKY_FITNESS_SERVER_PORT \$NGINX_RATE_LIMIT \$SPARKY_FITNESS_FRONTEND_URL" \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g "daemon off;"
