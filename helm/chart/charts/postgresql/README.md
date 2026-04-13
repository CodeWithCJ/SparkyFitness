# PostgreSQL

PostgreSQL for Kubernetes with explicit `standalone` and `replication` modes, documented bootstrap behavior, optional init scripts, and optional metrics.

## Install

### HTTPS repository

```bash
helm repo add helmforge https://repo.helmforge.dev
helm repo update
helm install postgresql helmforge/postgresql -f values.yaml
```

### OCI registry

```bash
helm install postgresql oci://ghcr.io/helmforgedev/helm/postgresql -f values.yaml
```

## Supported architectures

| Architecture | When to use | Document |
|-------------|-------------|----------|
| `standalone` | development, simple production environments, or workloads where a single writable database is acceptable | [docs/standalone.md](docs/standalone.md) |
| `replication` | one writable primary plus asynchronous read replicas for read scaling and simpler recovery workflows | [docs/replication.md](docs/replication.md) |

## What this chart covers

- explicit architecture selection through `architecture`
- PostgreSQL on the official `postgres` image
- generated or externally-managed passwords through `existingSecret`
- app user and app database bootstrap on first initialization
- optional extra init scripts
- fixed-primary asynchronous replication with `pg_basebackup`
- role-aware readiness checks for primary and replicas in replication mode
- optional metrics through `postgres_exporter`
- optional `ServiceMonitor`
- built-in S3 backup CronJob using `pg_dumpall`
- dedicated metrics Services separated from client traffic
- topology-specific Services for client traffic, primary traffic, and read replicas

## How to choose the architecture

- use `standalone` when operational simplicity matters more than read scaling
- use `replication` when you need separate write and read endpoints, but you are not asking the chart to solve automatic failover

Recommended reading before installation:

- [Standalone](docs/standalone.md)
- [Replication](docs/replication.md)
- [Replication Operations](docs/replication-operations.md)
- [HA and Scope Boundaries](docs/ha-and-scope-boundaries.md)
- [Backup and Restore](docs/backup-restore.md)
- [Secret Rotation](docs/secret-rotation.md)

## Official product references

- PostgreSQL streaming replication: https://www.postgresql.org/docs/current/warm-standby.html
- PostgreSQL `pg_isready`: https://www.postgresql.org/docs/current/app-pg-isready.html
- PostgreSQL official image: https://hub.docker.com/_/postgres

## Operational direction

- for production needing automatic failover, use a PostgreSQL operator instead of stretching this chart beyond its scope
- `replication` in this chart means one fixed primary with asynchronous replicas
- built-in logical backup to S3 is available for standalone and replication topologies

## Read traffic model

In `replication` mode, the chart exposes separate Services for different traffic patterns:

- the base client Service for general in-cluster access
- a dedicated primary Service for write traffic
- a dedicated replicas Service for read-only traffic

The replicas Service is the endpoint to use for horizontal read scaling when an application, reporting stack, or other read-heavy component can work against asynchronous read-only replicas.

Important limits:

- Kubernetes Service balancing distributes connections across available replicas, but it is not a PostgreSQL-aware query router
- replica reads may lag behind the primary because replication is asynchronous
- workloads that require immediate read-after-write consistency should stay on the primary endpoint

## Scope boundary

This chart intentionally stays on the Helm-chart side of the boundary:

- it manages PostgreSQL pods, services, storage, init scripts, metrics, TLS, and basic replication operations
- it does not attempt to behave like a cluster manager
- it does not implement automatic failover, leader election, fencing, or reconciliation loops

If you need automated failover, self-healing topology management, switchover workflows, or lifecycle orchestration across primary and replicas, use a PostgreSQL operator instead of extending this chart into that territory.

## Quick start

Minimal standalone example:

```yaml
architecture: standalone

auth:
  existingSecret: postgresql-auth

standalone:
  persistence:
    enabled: true
    size: 20Gi
```

Replication example:

```yaml
architecture: replication

auth:
  existingSecret: postgresql-auth

replication:
  primary:
    persistence:
      enabled: true
      size: 50Gi
  readReplicas:
    replicaCount: 2
    persistence:
      enabled: true
      size: 50Gi

metrics:
  enabled: true
  serviceMonitor:
    enabled: true
```

## Best practices

### Security

- prefer `auth.existingSecret` in production
- keep client access internal unless there is a strong reason to expose PostgreSQL outside the cluster network
- use `networkPolicy.enabled=true` or external platform controls when possible
- rotate passwords through secret management workflows instead of editing values inline
- use `tls.enabled=true` with certificate material from a managed secret when PostgreSQL traffic must be encrypted

### Replication and availability

- treat `replication` as read scaling and operational recovery help, not full HA
- place primary and replicas across different nodes or zones when the cluster supports it
- use `pdb.enabled=true` when running multiple replicas and planning maintenance windows
- review the default replication PDB and placement behavior before overriding them globally
- keep `startupProbe` conservative for PostgreSQL, especially on larger volumes and recovery paths

### Initialization

- use `initdb.scripts` for deterministic first-boot SQL or shell customization
- use `initdb.existingConfigMap` when scripts are already managed elsewhere
- remember that `docker-entrypoint-initdb.d` runs only during first initialization of a fresh data directory

### Observability

- enable `metrics.enabled=true` in monitored environments
- enable `metrics.serviceMonitor.enabled=true` when Prometheus Operator is available
- metrics are exposed through dedicated metrics Services, not through the client database Services
- monitor connection count, replication lag, disk growth, checkpoint behavior, and WAL retention

### Configuration UX

- use `config.preset` for a small set of opinionated PostgreSQL defaults
- use `config.pgHbaEntries` when you need structured host-based access rules
- use `*.resourcesPreset` for small and predictable environment sizing before reaching for fully custom resources
- keep `config.postgresql` and `config.pgHba` for raw overrides when structured values are not enough
- keep `auth.database`, `auth.username`, and `auth.replicationUsername` as plain values; `existingSecret` is intentionally limited to sensitive runtime data

## Production notes

- use `auth.existingSecret` instead of inline passwords
- keep persistence enabled for every stateful topology
- define node placement rules for `replication`, especially when the cluster spans multiple nodes or zones
- use the `client` or `primary` Service only for writes
- use the `replicas` Service only for read traffic
- use the `replicas` Service when you need horizontal scale for read-only workloads
- built-in backup dumps all PostgreSQL databases and global objects from the writable primary endpoint and uploads the compressed archive to S3-compatible storage
- treat restore validation, retention policy, WAL strategy, and failover as operational workflows that still require explicit runbooks
- review the operational guides before promoting `replication` to production

Operational documents:

- [Replication Operations](docs/replication-operations.md)
- [HA and Scope Boundaries](docs/ha-and-scope-boundaries.md)
- [Backup and Restore](docs/backup-restore.md)
- [Secret Rotation](docs/secret-rotation.md)

## Main values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `architecture` | `standalone` or `replication` | `standalone` |
| `image.repository` | PostgreSQL image repository | `postgres` |
| `image.tag` | PostgreSQL image tag | `18.3-trixie` |
| `auth.database` | App database created at bootstrap | `app` |
| `auth.username` | App user created at bootstrap | `app` |
| `auth.existingSecret` | Existing secret for passwords | `""` |
| `auth.replicationUsername` | Replication username | `replicator` |
| `config.preset` | Optional PostgreSQL config preset | `none` |
| `config.pgHbaEntries` | Structured pg_hba entries | `[]` |
| `standalone.resourcesPreset` | Resource preset for standalone mode | `none` |
| `replication.primary.resourcesPreset` | Resource preset for the primary pod | `none` |
| `replication.readReplicas.resourcesPreset` | Resource preset for replica pods | `none` |
| `initdb.existingConfigMap` | External ConfigMap for extra init scripts | `""` |
| `tls.enabled` | Enable PostgreSQL TLS | `false` |
| `tls.existingSecret` | Existing secret with TLS material | `""` |
| `tls.sslMode` | Internal libpq sslmode | `require` |
| `backup.enabled` | Enable built-in S3 backup CronJob | `false` |
| `backup.schedule` | Backup schedule | `"0 3 * * *"` |
| `backup.s3.endpoint` | S3-compatible endpoint URL | `""` |
| `backup.s3.bucket` | Target bucket name | `""` |
| `backup.database.pgDumpAllArgs` | Extra `pg_dumpall` flags | `"--clean --if-exists"` |
| `networkPolicy.enabled` | Enable ingress-only NetworkPolicy | `false` |
| `livenessProbe.enabled` | Enable livenessProbe | `true` |
| `readinessProbe.enabled` | Enable readinessProbe | `true` |
| `startupProbe.enabled` | Enable startupProbe | `true` |
| `replication.primary.probes.requireWritable` | Require primary readiness to confirm writable state | `true` |
| `replication.readReplicas.probes.requireRecoveryMode` | Require replica readiness to confirm recovery mode | `true` |
| `replication.wal.keepSize` | Local WAL retention target | `512MB` |
| `replication.pdb.enabled` | Enable replication PDB by default | `true` |
| `replication.scheduling.enableDefaultPodAntiAffinity` | Enable default anti-affinity in replication mode | `true` |
| `replication.scheduling.enableDefaultTopologySpread` | Enable default topology spread in replication mode | `true` |
| `standalone.persistence.enabled` | Enable PVC for standalone | `true` |
| `replication.readReplicas.replicaCount` | Number of async read replicas | `2` |
| `metrics.enabled` | Enable `postgres_exporter` sidecar | `false` |
| `metrics.resourcesPreset` | Resource preset for `postgres_exporter` | `none` |
| `metrics.serviceMonitor.enabled` | Enable ServiceMonitor | `false` |
| `pdb.enabled` | Enable PodDisruptionBudget | `false` |

## CI scenarios

The `ci/` scenarios validate the main chart behaviors:

- `standalone.yaml`
- `replication.yaml`
- `initdb.yaml`
- `existing-secret.yaml`
- `metrics.yaml`
- `existing-configmap.yaml`
- `replication-metrics.yaml`
- `scheduling.yaml`
- `tls.yaml`
- `tls-networkpolicy.yaml`
- `config-preset.yaml`
- `structured-pghba.yaml`
- `resources-preset.yaml`
- `replication-recovery-check.yaml`
- `replication-wal-tuning.yaml`

## Examples

See `examples/`:

- `standalone.yaml`
- `replication.yaml`
- `initdb-metrics.yaml`
- `tls.yaml`
- `structured-config.yaml`
- `resources-preset.yaml`
- `replication-production.yaml`

## Important notes

- `replication` here is asynchronous replication with one fixed writable primary
- this chart does not implement automatic primary election
- init scripts run only on first initialization of a fresh data directory
- for failover-oriented production operations, use an operator instead of trying to turn this chart into one

<!-- @AI-METADATA
type: chart-readme
title: PostgreSQL Helm Chart
description: PostgreSQL chart with standalone/replication, TLS, metrics, resource presets

keywords: postgresql, postgres, database, replication, sql

purpose: Usage guide for the PostgreSQL Helm chart with standalone and replication modes
scope: Chart

relations:
  - charts/postgresql/DESIGN.md
  - charts/postgresql/docs/standalone.md
  - charts/postgresql/docs/replication.md
  - charts/postgresql/docs/backup-restore.md
path: charts/postgresql/README.md
version: 1.0
date: 2026-03-31
-->
