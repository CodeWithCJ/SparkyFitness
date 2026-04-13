# HA and Scope Boundaries

## What this chart is for

This chart is designed for:

- standalone PostgreSQL with clear Kubernetes packaging
- primary plus asynchronous replicas for read scaling
- operationally simple environments that want explicit behavior
- teams that already own backup, restore, and incident procedures

## What this chart is not trying to be

This chart is not a PostgreSQL cluster manager.

It does not provide:

- automatic failover
- automated primary election
- split-brain protection or fencing
- reconciliation logic for unhealthy topologies
- operator-style lifecycle management

## Why the chart stops here

The goal of this repository is to keep charts product-specific, smaller, and honest about their guarantees.

For PostgreSQL, that means:

- replication is documented as asynchronous read scaling and operational recovery support
- failover remains a platform or operator concern
- lifecycle automation beyond normal StatefulSet behavior stays out of scope

Trying to force those responsibilities into this chart would make the values surface larger, the operational contract less clear, and the failure modes harder to explain.

## When this chart is a good fit

Use this chart when:

- one writable primary is acceptable
- replicas are mainly for read traffic
- manual failover is acceptable
- your platform team already has restore and incident runbooks
- you want Helm-native packaging without adopting a full database operator

## When to prefer an operator

Prefer a PostgreSQL operator when you need:

- automated failover
- managed switchover workflows
- topology reconciliation after failures
- stronger lifecycle automation around replication roles
- database-specific controllers instead of pure Helm plus StatefulSets

## Practical recommendation

Treat this chart as:

- a solid standalone PostgreSQL chart
- a clear primary plus replicas chart
- not a substitute for operator-based HA

If the environment requires HA guarantees beyond manual operational procedures, keep that as a separate solution path instead of expanding this chart into a partial operator.

<!-- @AI-METADATA
type: chart-docs
title: PostgreSQL - HA Scope
description: HA scope and boundaries

keywords: postgresql, ha, scope, boundaries

purpose: PostgreSQL HA scope and automation boundaries
scope: Chart Architecture

relations:
  - charts/postgresql/README.md
  - charts/postgresql/DESIGN.md
path: charts/postgresql/docs/ha-and-scope-boundaries.md
version: 1.0
date: 2026-03-20
-->
