# Sparkyfitness Helm Chart

A Helm chart for deploying [Sparkyfitness](https://github.com/CodeWithCJ/SparkyFitness) on Kubernetes.

## Components

| Component | Image | Default Port | Optional |
|-----------|-------|-------------|----------|
| Server | `codewithcj/sparkyfitness_server` | 3010 | No |
| Frontend | `codewithcj/sparkyfitness` | 80 | No |
| Garmin | `codewithcj/sparkyfitness_garmin` | 8000 | Yes |
| PostgreSQL | `postgres:15-alpine` | 5432 | Yes (bundled) |

## Quick Start

```bash
helm install sparkyfitness ./chart
```

This deploys Sparkyfitness with a bundled PostgreSQL instance, auto-generated secrets, and sane defaults. Access via `kubectl port-forward svc/sparkyfitness-frontend 8080:80`.

## Database

### Bundled PostgreSQL (default)

Enabled by default. Credentials are auto-generated on first install and preserved across upgrades.

```yaml
postgresql:
  enabled: true
  auth:
    database: sparkyfitness
    username: sparky
    # password: ""  # auto-generated if empty
  persistence:
    size: 8Gi
```

### External Database

Disable the bundled instance and point to your own:

```yaml
postgresql:
  enabled: false

externalDatabase:
  host: "db.example.com"
  port: 5432
  database: "sparkyfitness"
```

Credentials can be supplied via `externalDatabase.auth.password`, `externalDatabase.auth.existingSecret`, or [External Secrets](#external-secrets-operator).

The application uses a two-user model: a **database owner** (for migrations) and a **limited-privilege app user** (for runtime queries). The owner needs `CREATEROLE` so the app can create the app user on first startup:

```sql
ALTER USER <owner> CREATEROLE;
```

The following extensions must be created by a superuser:

```sql
\c <database>
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "<owner>" WITH GRANT OPTION;
```

> `pg_stat_statements` requires `shared_preload_libraries = 'pg_stat_statements'` in the PostgreSQL config.

## Secrets

The chart manages five separate Kubernetes Secrets:

| Secret | Keys | Used by |
|--------|------|---------|
| `<release>-app` | `api_encryption_key`, `better_auth_secret` | Server |
| `<release>-appdb` | `username`, `password` | Server (app DB user) |
| `<release>-postgres` | `username`, `password` | Server (DB owner) |
| `<release>-oidc` | `client_id`, `client_secret` | Server (if OIDC enabled) |
| `<release>-smtp` | `username`, `password` | Server (if email enabled) |

Each secret supports three provisioning modes:

1. **Auto-generated** (default) — random values on first install, preserved on upgrade
2. **Existing secret** — reference a pre-created K8s Secret via `existingSecret`
3. **External Secrets Operator** — fetched from Vault or other providers

### Existing Secrets

```yaml
server:
  secrets:
    existingSecret: "my-app-secret"       # keys: api_encryption_key, better_auth_secret
  appDatabase:
    existingSecret: "my-appdb-secret"     # keys: username, password

externalDatabase:
  auth:
    existingSecret: "my-db-owner-secret"  # keys: username, password

config:
  oidc:
    secrets:
      existingSecret: "my-oidc-secret"    # keys: client_id, client_secret
  email:
    secrets:
      existingSecret: "my-smtp-secret"    # keys: username, password
```

### External Secrets Operator

The chart can create a Vault-backed `SecretStore` and per-type `ExternalSecret` resources:

```yaml
externalSecrets:
  enabled: true
  secretStore:
    name: sparkyfitness
    vaultPath: sparkyfitness
    vaultServer: "https://vault.example.com:8200"
    auth:
      mountPath: kubernetes
      role: external-secrets
  app:
    enabled: true
    remoteKey: app_secret
  smtp:
    enabled: true
    remoteKey: smtp
```

For database credentials, you can use a `ClusterSecretStore` instead of the chart-managed `SecretStore`:

```yaml
externalSecrets:
  postgres:
    enabled: true
    clusterSecretStore: my-cluster-store
    remoteKey: db-owner
  appdb:
    enabled: true
    clusterSecretStore: my-cluster-store
    remoteKey: db-appuser
```

Key mappings are configurable per secret via the `keys` list:

```yaml
externalSecrets:
  postgres:
    enabled: true
    remoteKey: my-db
    keys:
      - secretKey: username
        property: db_user       # maps "db_user" in the remote store to "username" in the K8s Secret
      - secretKey: password
        property: db_pass
```

## Networking

### Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: sparkyfitness.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: sparkyfitness-tls
      hosts:
        - sparkyfitness.example.com
```

### Gateway API (HTTPRoute)

```yaml
httpRoute:
  enabled: true
  hostname: sparkyfitness.example.com
  parentRef:
    name: my-gateway
    namespace: gateway-system
    sectionName: https
```

### Network Policies

When `networkPolicy.enabled: true`, the chart creates least-privilege policies:

- Frontend accepts traffic from anywhere, can only reach the server
- Server accepts traffic from frontend, can reach the database, DNS, and optionally Garmin/SMTP/OIDC
- PostgreSQL only accepts traffic from the server
- Garmin only accepts traffic from the server, can reach external Garmin APIs

## Features

### OIDC / SSO

```yaml
config:
  oidc:
    enabled: true
    providerSlug: authentik
    providerName: "Authentik"
    issuerUrl: "https://auth.example.com/application/o/sparkyfitness/"
    secrets:
      clientId: "..."
      clientSecret: "..."
```

### Email Notifications

```yaml
config:
  email:
    enabled: true
    host: smtp.example.com
    port: 587
    from: fitness@example.com
    secrets:
      username: "..."
      password: "..."
```

### Garmin Connect

```yaml
config:
  garmin:
    enabled: true
```

Deploys a separate Python microservice that connects to the Garmin API.

## Security Contexts

Each component runs with a security context matching its upstream image:

| Component | UID:GID | Non-Root | Capabilities |
|-----------|---------|----------|-------------|
| Server | 1000:1000 | Yes | None (all dropped) |
| Frontend | root | No | `CHOWN`, `NET_BIND_SERVICE`, `SETGID`, `SETUID` |
| Garmin | 1:1 | Yes | None (all dropped) |
| PostgreSQL | 999:999 | Yes | None (all dropped) |

All pods use `seccompProfile: RuntimeDefault` and `allowPrivilegeEscalation: false`.

Security contexts are fully configurable via `<component>.podSecurityContext` and `<component>.containerSecurityContext`.

## ArgoCD

Auto-generated secrets use Helm `lookup` to preserve values across upgrades. Since ArgoCD uses `helm template` (where `lookup` returns nil), secrets will show as changed on every diff. Add this to your Application:

```yaml
spec:
  ignoreDifferences:
    - group: ""
      kind: Secret
      jsonPointers:
        - /data
```

With `RespectIgnoreDifferences=true` in ArgoCD's resource tracking, this prevents unnecessary sync loops.

## All Values

See [`values.yaml`](values.yaml) for the full reference with comments. The file is organized into sections:

1. **Global** — image registry, pull secrets, storage class, service accounts
2. **App Configuration** — runtime settings, OIDC, email, Garmin, rate limiting
3. **Networking** — ingress, HTTPRoute, network policies
4. **Deployments** — per-component images, resources, security contexts, secrets, persistence
5. **External Secrets** — ESO integration with per-type secret stores
