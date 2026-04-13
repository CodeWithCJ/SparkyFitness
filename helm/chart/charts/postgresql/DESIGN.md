# PostgreSQL Chart Design

## Scope

- `architecture: standalone | replication`
- standalone for simple single-instance PostgreSQL deployments
- replication for one writable primary plus asynchronous read replicas
- `existingSecret` support for passwords
- generated or user-provided init scripts
- optional metrics through `postgres_exporter`
- optional `ServiceMonitor`

## Explicit Non-Goals

- automatic failover
- Patroni or operator-like orchestration
- bundled pooler
- major version migration automation
- backup controller logic inside the chart

## Operational Direction

- production users needing automatic failover should move to an operator instead of overloading this chart
- replication is documented as fixed-primary asynchronous replication, not full HA
- the chart keeps services explicit: client, primary, and replicas

## Main Design Choices

- official `postgres` image as the database runtime
- replication bootstrapped with `pg_basebackup`
- config rendered through `postgresql.conf` and `pg_hba.conf`
- initdb handled through `docker-entrypoint-initdb.d`
- services remain explicit instead of hiding write/read paths behind generic abstractions

<!-- @AI-METADATA
type: design
title: PostgreSQL Chart Design
description: Design document for PostgreSQL Helm chart with standalone and replication architectures

keywords: postgresql, design, architecture, standalone, replication

purpose: Document design decisions and non-goals for the PostgreSQL chart
scope: Chart Design

relations:
  - charts/postgresql/README.md
path: charts/postgresql/DESIGN.md
version: 1.0
date: 2026-03-20
-->
