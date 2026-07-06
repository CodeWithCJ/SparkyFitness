# Feature Request: Support configurable sub-path deployment via `SPARKY_BASE_PATH`

---

## What problem does this solve?

Self-hosted users commonly run multiple services on a single hostname behind a reverse proxy (Caddy, Nginx, Traefik, etc.). The typical pattern is to route each service to a sub-path rather than allocating a dedicated subdomain or port:

```
https://homeserver.example.com/sparky/     → SparkyFitness
https://homeserver.example.com/grafana/    → Grafana
https://homeserver.example.com/jellyfin/  → Jellyfin
```

SparkyFitness currently assumes it is always served at the root path (`/`). Vite bakes all asset references as absolute paths at build time (`/assets/index.js`), and React Router has no `basename` configured. Deploying behind a sub-path results in all assets returning 404s and navigation breaking entirely.

The only workarounds today are:
- A dedicated subdomain (requires DNS management and a separate TLS certificate per service)
- A dedicated port (ugly URLs, requires open firewall rules)
- A custom Docker image rebuild (non-trivial for most self-hosters)

None of these are acceptable for a typical homelab setup where users want a single clean domain.

---

## Describe the feature you'd like

A new **`SPARKY_BASE_PATH` environment variable** (default: `/`) that configures the sub-path at runtime — no Docker image rebuild required.

**Example usage:**

```dotenv
# .env
SPARKY_BASE_PATH=/sparky/
SPARKY_FITNESS_FRONTEND_URL=https://homeserver.example.com/sparky
SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS=https://homeserver.example.com
BETTER_AUTH_URL=https://homeserver.example.com/api/auth
```

**Reverse proxy (Caddy example):**

```caddy
redir /sparky /sparky/ 308
handle_path /sparky/* {
    reverse_proxy 127.0.0.1:3004
}
```

The proxy strips the sub-path prefix before forwarding to the SparkyFitness container, which is the standard approach for all major reverse proxies.

**Mobile app:** no changes required. Users configure the server URL as `https://homeserver.example.com/sparky` in the app Settings; API calls route through the sub-path transparently.

**Backward compatibility:** `SPARKY_BASE_PATH` defaults to `/` everywhere, so all existing root deployments continue to work without any configuration changes.

---

## Alternatives you've considered

| Alternative | Why it falls short |
|---|---|
| Dedicated subdomain (e.g. `sparky.homeserver.example.com`) | Requires separate DNS record and TLS certificate management for each service |
| Dedicated port (e.g. `:3004`) | Non-standard URLs, requires open firewall port, no HTTPS without additional setup |
| Build-time `VITE_BASE_PATH` | Forces users to rebuild the Docker image after every deployment path change; not viable for standard self-hosted workflows |
| Nginx `alias` without prefix stripping | Brittle, breaks internal redirects and auth callbacks |

---

## Additional context

### Why `BETTER_AUTH_URL` is required for sub-path deployments

Better Auth (the authentication library) derives its internal routing basePath from the server URL. When the reverse proxy strips the sub-path prefix (e.g. `/sparky`) before forwarding to the container, the server only ever sees `/api/auth/...` — not `/sparky/api/auth/...`. Without an explicit `BETTER_AUTH_URL` override pointing to the unstripped path, Better Auth misconfigures its basePath and all auth endpoints return 404.

Setting `BETTER_AUTH_URL=https://homeserver.example.com/api/auth` (without the sub-path prefix) corrects this. This is the non-obvious part of the configuration that needs clear documentation.

### Implementation approach (no rebuild required)

The feature can be implemented entirely through existing Nginx and Docker mechanisms:

1. **`base: './'` in Vite config** — emits relative asset references (`./assets/index.js`) instead of absolute (`/assets/index.js`), so they resolve correctly through the HTML `<base href>` regardless of deployment path.
2. **`<base href="/">` in `index.html`** — standard HTML mechanism. Nginx replaces the value at request time using `sub_filter` based on `SPARKY_BASE_PATH`.
3. **React Router `basename`** — `App.tsx` reads the `<base href>` from the DOM at runtime and passes it to `createBrowserRouter`. No build-time baking.
4. **`envsubst` in the existing entrypoint** — `SPARKY_BASE_PATH` is already passed through the `docker-entrypoint.sh` env substitution pipeline that configures Nginx at startup.

### Scope

- Frontend container only — no changes to the backend, database, migrations, or auth configuration.
- `SPARKY_BASE_PATH` should always end with `/` (e.g. `/sparky/`, not `/sparky`). The entrypoint defaults to `/`.
- PWA / Service Worker: the `navigateFallback` in the Workbox config uses an absolute path and may need a follow-up for full PWA support at sub-paths. Core app functionality is unaffected.
