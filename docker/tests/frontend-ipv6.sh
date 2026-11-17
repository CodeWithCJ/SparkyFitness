#!/usr/bin/env bash
# Build first: docker build -f docker/Dockerfile.frontend -t sparkyfitness:ipv6-test .
# Run: CONTAINER_ENGINE=podman bash docker/tests/frontend-ipv6.sh sparkyfitness:ipv6-test
set -euo pipefail

engine=${CONTAINER_ENGINE:-docker}
image=${1:?Usage: frontend-ipv6.sh IMAGE}
container=""
scratch=$(mktemp -d)
trap 'if [[ -n "$container" ]]; then "$engine" rm -f "$container" >/dev/null; fi; rm -rf "$scratch"' EXIT

check_frontend() {
    local label=$1 port=$2 ipv6=$3
    shift 3
    container=$("$engine" run -d --network none \
        -e SPARKY_FITNESS_SERVER_HOST=127.0.0.1 \
        -e SPARKY_FITNESS_FRONTEND_URL=http://localhost \
        "$@" "$image")

    local ready=false
    for ((attempt = 0; attempt < 30; attempt++)); do
        if "$engine" exec "$container" curl --max-time 5 --noproxy '*' -fsS \
            "http://127.0.0.1:${port}/" >"$scratch/ipv4" 2>/dev/null; then
            ready=true
            break
        fi
        sleep 1
    done
    if [[ $ready != true ]]; then
        "$engine" logs "$container"
        echo "FAIL: $label did not serve IPv4" >&2
        exit 1
    fi
    grep -q 'id="root"' "$scratch/ipv4"
    if [[ $label == no-ipv6-kernel ]]; then
        if "$engine" exec "$container" grep -Fq 'listen [::]:' /etc/nginx/conf.d/default.conf; then
            echo "FAIL: IPv6 listener retained without kernel support" >&2
            exit 1
        fi
    fi

    if [[ $ipv6 == true ]]; then
        "$engine" exec "$container" curl --max-time 5 --noproxy '*' -gfsS \
            "http://[::1]:${port}/" >"$scratch/ipv6"
        cmp "$scratch/ipv4" "$scratch/ipv6"
        "$engine" exec "$container" curl --max-time 5 --noproxy '*' -gfsS \
            "http://[::1]:${port}/ipv6-smoke-test-route" >"$scratch/route"
        cmp "$scratch/ipv4" "$scratch/route"
        echo "PASS: $label serves identical React index and SPA fallback over IPv4/IPv6 on $port"
    else
        echo "PASS: $label still serves React over IPv4 on $port"
    fi

    "$engine" rm -f "$container" >/dev/null
    container=""
}

check_frontend root 80 true
# Some nginx base images use /run/nginx.pid rather than /var/run/nginx.pid.
# Accommodate that existing non-root PID-path issue with a writable runtime dir.
check_frontend non-root 8080 true --user 1000:0 --tmpfs /run:rw,mode=1777
check_frontend custom-port 8181 true --user 1000:0 --tmpfs /run:rw,mode=1777 -e NGINX_LISTEN_PORT=8181
check_frontend ipv6-disabled 80 false --sysctl net.ipv6.conf.all.disable_ipv6=1

# Simulate a kernel with no IPv6 interface table. The host kernel cannot be
# changed by this test, so replace only the table path in the real entrypoint.
# All template substitution, permission handling and nginx startup remain real.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
sed 's|/proc/net/if_inet6|/proc/net/sparky-test-no-ipv6|' \
    "$repo_root/docker/docker-entrypoint.sh" >"$scratch/no-ipv6-entrypoint.sh"
chmod 755 "$scratch/no-ipv6-entrypoint.sh"
check_frontend no-ipv6-kernel 80 false \
    --volume "$scratch/no-ipv6-entrypoint.sh:/docker-entrypoint.sh:ro"
