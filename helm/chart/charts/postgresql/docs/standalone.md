# Standalone

## When to use it

Use `standalone` when you want a single PostgreSQL instance with simple persistence and predictable operations.

Typical use cases:

- development and integration environments
- internal applications with a single writer and modest load
- production cases where restore-based recovery is acceptable

## What it delivers

- one PostgreSQL pod
- one persistent volume when persistence is enabled
- one client Service
- bootstrap of the app database and app user on first initialization
- optional custom init scripts
- optional `postgres_exporter`

## What it does not deliver

- automatic failover
- read scaling through replicas
- connection pooling
- backup orchestration

## Operational requirements

- a working storage class when persistence is enabled
- a secret management strategy for production passwords
- backup and restore procedures outside this chart

## Best practices

- use `auth.existingSecret` in production
- keep persistence enabled except for ephemeral test environments
- use resource requests and limits appropriate to your workload
- monitor disk growth and autovacuum behavior early

## Example

```yaml
architecture: standalone

auth:
  existingSecret: postgresql-auth

standalone:
  persistence:
    enabled: true
    size: 20Gi
```

<!-- @AI-METADATA
type: chart-docs
title: PostgreSQL - Standalone
description: Standalone deployment

keywords: postgresql, standalone

purpose: Standalone PostgreSQL deployment guide
scope: Chart Architecture

relations:
  - charts/postgresql/README.md
path: charts/postgresql/docs/standalone.md
version: 1.0
date: 2026-03-20
-->
