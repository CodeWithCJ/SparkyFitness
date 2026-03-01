# Changelog

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
