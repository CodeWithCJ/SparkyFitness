# Replication Operations

## Operational contract

This chart provides:

- one fixed writable primary
- asynchronous read replicas
- replica bootstrap with `pg_basebackup`

This chart does not provide:

- automatic failover
- automatic primary promotion
- cluster manager behavior
- reconciliation of broken topologies after failure

## Traffic model

- send write traffic to the primary Service
- send read traffic to the replicas Service
- do not assume the generic client Service is a read/write router

## Maintenance guidance

- use `pdb.enabled=true` before planned maintenance in replication mode
- prefer anti-affinity or topology spread in multi-node environments
- monitor replica lag before and after maintenance windows

## Incident guidance

- if the primary fails, the chart will not promote a replica automatically
- operator teams need a runbook for manual promotion, restore, or rebuild
- after manual intervention, document whether the old primary will be rebuilt or discarded
- if the platform requires automatic promotion or topology healing, move that requirement to an operator-based solution

## Manual promotion notes

- confirm which replica is healthiest before any promotion attempt
- stop application write traffic before promoting a replica manually
- promote only one replica and make it the new write target
- rebuild old replicas against the new primary instead of assuming they will self-heal correctly
- update any external connection, failover, or service routing procedure used by the platform team

## Readiness expectations

- replica readiness means PostgreSQL is accepting connections
- replica readiness can also verify `pg_is_in_recovery()` when the default replication probe behavior is kept
- replica readiness does not mean lag is zero
- use monitoring to track lag and WAL retention explicitly

## WAL retention guidance

- tune `replication.wal.keepSize` according to write volume and expected replica catch-up windows
- review `replication.wal.maxSenders` and `replication.wal.maxReplicationSlots` when scaling read replicas or external consumers
- do not treat local WAL retention as a backup strategy

<!-- @AI-METADATA
type: chart-docs
title: PostgreSQL - Replication Ops
description: Replication maintenance

keywords: postgresql, replication, operations

purpose: PostgreSQL replication maintenance and operational procedures
scope: Chart Architecture

relations:
  - charts/postgresql/docs/replication.md
path: charts/postgresql/docs/replication-operations.md
version: 1.0
date: 2026-03-20
-->
