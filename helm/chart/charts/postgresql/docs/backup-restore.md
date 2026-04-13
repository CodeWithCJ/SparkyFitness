# Backup and Restore

## Built-in backup strategy

This chart now includes an optional backup CronJob that runs `pg_dumpall`, compresses the output, and uploads the archive to S3-compatible storage.

The built-in backup always targets the writable endpoint:

- `standalone`: the single PostgreSQL pod through the chart client Service
- `replication`: the fixed primary through the primary/client Service

Because `pg_dumpall` is used, the generated archive includes all logical databases plus global objects such as roles.

## Minimum production expectation

- a tested logical or physical backup workflow
- retention policy aligned with business and compliance needs
- restore verification in a non-production environment
- a documented recovery time expectation

## Recommended direction

- use dedicated PostgreSQL backup tooling or a platform backup solution when you need more than full logical dumps
- use the built-in S3 backup for regular full logical dumps when that matches your recovery model
- keep WAL, data retention, and storage sizing aligned with the backup design
- if replication is enabled, do not assume replicas replace backups

## Restore workflow

Prefer restoring into a fresh release, validating it, and only then switching application traffic.

### 1. Download and extract the archive

```bash
mc cp backup/my-postgresql-backups/postgresql/postgresql-postgresql-20260331T162911Z.sql.gz /tmp/
gzip -dc /tmp/postgresql-postgresql-20260331T162911Z.sql.gz > /tmp/postgresql-restore.sql
```

### 2. Restore into the writable endpoint

```bash
psql \
  --host <postgres-host> \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --file /tmp/postgresql-restore.sql
```

Because the built-in backup uses `pg_dumpall`, the restore stream includes roles and all logical databases. Run it with a superuser or equivalent administrative role.

### 3. Rebuild replicas if replication is enabled

Treat replicas as disposable read copies. Recreate them from the restored primary instead of assuming they can continue from stale state safely.

### 4. Validate before reopening traffic

- restore into a fresh release or a controlled maintenance workflow
- verify database integrity and application connectivity before switching traffic
- verify expected roles, databases, extensions, and schema objects after restore
- document whether restore will overwrite an existing PVC or create a new one
- re-enable scheduled backups only after the restored environment is validated

## What to document for operations

- where backups are stored
- who owns restore approval
- how often restore tests are executed
- how secrets and credentials are supplied during recovery

<!-- @AI-METADATA
type: chart-docs
title: PostgreSQL - Backup
description: Backup and restore

keywords: postgresql, backup, restore, pg_dump

purpose: PostgreSQL backup and restore procedures using pg_dump
scope: Chart Architecture

relations:
  - charts/postgresql/README.md
path: charts/postgresql/docs/backup-restore.md
version: 1.0
date: 2026-03-31
-->
