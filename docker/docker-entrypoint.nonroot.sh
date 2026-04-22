#!/bin/sh
set -eu

echo "Starting SparkyFitness Frontend (non-root)"

mkdir -p /var/run/nginx \
         /var/cache/nginx/client-body \
         /var/cache/nginx/proxy \
         /var/cache/nginx/fastcgi \
         /var/cache/nginx/uwsgi \
         /var/cache/nginx/scgi \
         /etc/nginx/conf.d

cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g "daemon off;"
