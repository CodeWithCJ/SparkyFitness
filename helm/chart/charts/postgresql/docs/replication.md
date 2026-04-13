# Replication

## When to use it

Use `replication` when you need one writable PostgreSQL primary and separate asynchronous replicas for read traffic.

Typical use cases:

- applications with distinct write and read paths
- teams that want read scaling without introducing a full PostgreSQL operator
- environments where failover remains an operational procedure outside the chart

## What it delivers

- one primary StatefulSet
- one replica StatefulSet with `pg_basebackup` bootstrap
- dedicated Services for client traffic, primary traffic, and replicas
- bootstrap of app and replication users on first initialization
- optional `postgres_exporter`
- optional `ServiceMonitor`
- a stable read-only replicas endpoint for horizontal read scaling

## What it does not deliver

- automatic failover
- primary re-election
- synchronous replication guarantees
- connection pooling
- operator-style topology management

## Operational requirements

- a storage class suitable for stateful workloads
- anti-affinity or topology spread when possible
- monitoring for replica health and lag
- a documented failover or restore runbook

## Best practices

- keep `readReplicas.replicaCount >= 2` if read scale matters
- use `pdb.enabled=true` before routine maintenance in multi-node environments
- route write traffic only to the primary Service
- route read traffic only to the replicas Service
- use the replicas Service for read-only workloads that benefit from horizontal scale
- do not expect the replicas Service to make lag-aware or query-aware routing decisions
- treat this mode as read scaling plus recovery help, not full HA
- if automated failover is a hard requirement, use an operator instead of extending this chart

## Read scaling notes

The replicas Service gives a single endpoint for read-only consumers across multiple replicas.

This is useful for:

- reporting stacks
- background readers
- analytics jobs
- applications with clear separation between write and read paths

Keep in mind:

- balancing happens at the Kubernetes Service level
- PostgreSQL lag is still an application concern
- replica reads are not a substitute for strong consistency requirements

## Example

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
```

<!-- @AI-METADATA
type: chart-docs
title: PostgreSQL - Replication
description: Streaming replication

keywords: postgresql, replication, streaming

purpose: PostgreSQL streaming replication setup guide
scope: Chart Architecture

relations:
  - charts/postgresql/README.md
  - charts/postgresql/docs/replication-operations.md
path: charts/postgresql/docs/replication.md
version: 1.0
date: 2026-03-20
-->
