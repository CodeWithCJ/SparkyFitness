# Changelog

## Unreleased

### Security

- **NetworkPolicy egress for external database is now restrictable** — added `externalDatabase.networkPolicy.cidrs` / `namespaceSelector` / `podSelector` to lock down the server's egress to an external PostgreSQL when `networkPolicy.enabled=true`. Default is unchanged (permissive egress to the DB port) for backward compatibility; a NOTES.txt warning is emitted when the permissive path is active.
- **NetworkPolicy ingress for the frontend is now restrictable** — added `frontend.networkPolicy.from` (list of `NetworkPolicyPeer`). Default is unchanged (permissive ingress on the frontend port from any source) for backward compatibility; a NOTES.txt warning is emitted when the permissive path is active. Set this to e.g. an `ingress-nginx` namespace selector when the frontend is only meant to be reached through an ingress controller.
- **NetworkPolicy egress for OIDC, SMTP, and the Garmin Connect API is now restrictable** — added `config.oidc.networkPolicy.to`, `config.email.networkPolicy.to`, and `config.garmin.networkPolicy.to` (each a list of `NetworkPolicyPeer`). Default is unchanged (permissive egress on the listed ports) for backward compatibility; a NOTES.txt warning is emitted for each unrestricted target when `networkPolicy.enabled=true`. Plain Kubernetes NetworkPolicy cannot restrict by FQDN — pin to known IP ranges, or use a CNI with FQDN policies.

### Documentation

- **GitOps caveat for chart-managed secrets documented** — `server.secrets.generate=true` relies on a Kubernetes API `lookup` to persist `api_encryption_key` / `better_auth_secret` across upgrades. In pure `helm template` mode (no cluster access — some ArgoCD/Flux setups, offline rendering), each render produces new random values, which would rotate the keys on apply and render existing `api_encryption_key`-encrypted data unrecoverable. Documented in `values.yaml` and `NOTES.txt`; recommended path for GitOps remains `externalSecrets.*` or pre-created secrets.

### Features

- **Chart metadata expanded** — `Chart.yaml` now declares `kubeVersion: ">= 1.28.0-0"`, `home`, `sources`, `keywords`, `maintainers`, and ArtifactHub `annotations`.
- **Image digest support** — each component image (`server`, `frontend`, `garmin`) now accepts an `image.digest` value. When set, it takes precedence over `image.tag` and renders `<repo>@<digest>`. Tag-mutability risk avoided.
- **Pod scheduling controls** — every workload (`server`, `frontend`, `garmin`) now exposes `affinity`, `nodeSelector`, `tolerations`, and `topologySpreadConstraints` (all default empty / no-op).
- **PodDisruptionBudget (opt-in)** — `<component>.podDisruptionBudget.enabled=true` (server / frontend / garmin) renders a per-component PDB. Set exactly one of `minAvailable` or `maxUnavailable`. Default disabled (no behavior change for `replicas: 1`).
- **Configurable ExternalSecret `refreshInterval`** — `externalSecrets.refreshInterval` (default `1h`) replaces the hardcoded value across all five chart-managed ExternalSecrets (app, appdb, oidc, postgres, smtp). Set to `0` to disable polling.
- **SecretStore auth methods extended** — `externalSecrets.secretStore.auth.method` now accepts `kubernetes` (default — backward-compatible), `appRole`, or `token`. AppRole uses `auth.appRole.{path,roleId,secretRef}`; token uses `auth.tokenSecretRef.{name,key}`. Required fields are enforced via `required` with clear error messages.
- **Configurable server `strategy`** — `server.strategy` (default `{type: Recreate}`) now overridable. Useful for clusters where the server PVCs use ReadWriteMany and zero-downtime upgrades are wanted (`type: RollingUpdate` with `maxUnavailable: 0`).

### Bug Fixes

- **Server pod restarts on chart-managed secret rotation** — added `checksum/secret-app`, `checksum/secret-appdb`, `checksum/secret-oidc`, and `checksum/secret-smtp` annotations on the server pod template. Previously only `checksum/config` was tracked, so chart-managed secret rotations did not roll the deployment.
- **`ingress` and `httpRoute` cannot both be enabled** — both rendered identical path routing to identical backends, causing duplicate routes. The chart now `fail`s with a clear message; `httpRoute.parentRef.name` is `required` when `httpRoute.enabled=true`; `httpRoute.parentRef.namespace` is now omitted from the rendered output when empty (was rendered as `namespace: ""` and silently treated as the default namespace).
- **`helm test` connection pod fixed** — previously targeted `:80`, but the frontend service exposes `frontend.port` (default `8080`), so `helm test` always failed. Now uses the actual service port. The test pod is also hardened (PSS `restricted`-conform: `runAsNonRoot`, dropped capabilities, read-only root filesystem, `seccompProfile`), runs as UID 65534, pins `busybox:1.37` instead of `latest`, sets `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`, and uses `wget --spider --timeout=5`.
- **NOTES.txt port-forward command for frontend fixed** — was `3004:80`, now `3004:{frontend service port}`.

### Features

- **GHCR Images** - Changed to use ghcr images instead of Docker Hub.
- **Dedicated non-root frontend image** — Upgraded frontend image to support runnig as non-root on port `8080` with logs going to stdout and stderr.
- **Bundled PostgreSQL dependency restored** — the chart now depends on `helmforge/postgresql`, a namespace-scoped PostgreSQL chart that uses the official `postgres` image and exposes scheduled backup support without requiring an operator.
- **PostgreSQL 18.3 defaults and backup modes** — bundled PostgreSQL now defaults to `postgres:18.3-trixie`, keeps the built-in S3 backup settings under `postgresql.backup`, and adds a PVC-backed retained backup job under `databaseBackup`.
- **Ingress-owned app routing** — the chart's Ingress and HTTPRoute now route `/api` and `/uploads` to the server service directly, so the frontend nginx only serves static assets and SPA routes.

### Chores

- **Frontend image publishing expanded** — Docker publish workflows now build and push the base frontend image first and the non-root frontend variant second to both Docker Hub and GHCR.

## 0.2.0

### Breaking Changes

- **`readOnlyRootFilesystem` now enabled** for server, frontend, and garmin containers. Writable paths (`/tmp`, nginx cache/run dirs) are mounted as `emptyDir`. If you mount custom writable paths, add corresponding `emptyDir` volumes.
- **Image tags default to `appVersion`** instead of `latest`. Set `server.image.tag` / `frontend.image.tag` / `garmin.image.tag` explicitly to override. @davmacario
- **Server uses `Recreate` strategy** instead of `RollingUpdate` — required because the server PVCs are `ReadWriteOnce`.

### Features

- **Configurable health probes** — `livenessProbe` and `readinessProbe` for all four components (server, frontend, garmin, postgresql) are now defined in `values.yaml` and fully overridable.
- **`extraEnv` / `extraEnvFrom`** added to all deployments (server, frontend, garmin) for injecting custom environment variables or referencing external ConfigMaps/Secrets.
- **Configurable mount paths** — `server.persistence.backup.mountPath`, `uploads.mountPath`, and `tempUploads.mountPath` are now exposed in values.
- **Per-PVC `storageClass`** — `server.persistence.backup.storageClass` and `uploads.storageClass` can override `global.storageClass`.
- **`nameOverride` / `fullnameOverride`** support added.
- **PostgreSQL `podSecurityContext` / `containerSecurityContext`** moved from hardcoded template to `values.yaml` (consistent with all other components).
- **Configurable ESO API version** — `externalSecrets.apiVersion` (default `v1`) allows using `v1beta1` for ESO < 0.10.0.

### Bug Fixes

- **OIDC/SMTP secrets validated** — `required` function ensures `clientId`/`clientSecret` (OIDC) and `username`/`password` (SMTP) are set when the chart creates these secrets, preventing empty secret data.
- **OIDC configmap validated** — `providerSlug`, `providerName`, and `issuerUrl` are now `required` when `config.oidc.enabled=true`.
- **Frontend `readOnlyRootFilesystem`** — nginx writable directories (`/var/cache/nginx`, `/var/run`, `/etc/nginx/conf.d`, `/tmp`) mounted as `emptyDir`.
- **Garmin `readOnlyRootFilesystem`** — `/tmp` mounted as `emptyDir`.
- **Server `/tmp`** mounted as `emptyDir` for `readOnlyRootFilesystem` support.
- **Database secret helper deduplicated** — `sparkyfitness.databaseSecretName` and `sparkyfitness.createDatabaseSecret` refactored to remove redundant branching between bundled/external PostgreSQL.

### Chores

- Chart `appVersion` pinned to `v0.16.4.7` (was `latest`).

## 0.1.0

- Initial release.
