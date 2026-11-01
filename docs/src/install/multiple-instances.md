# Running Multiple Instances

SparkyFitness runs as a single server by default, and most installs never need more. If you run more than one server against the same database (for example `server.replicas` above 1 in the Helm chart, or several server containers behind a load balancer), follow these rules.

::: warning
**Community Contribution:** Multi-instance support is community-provided. The SparkyFitness maintainers do not run more than one instance and cannot provide full review or official support for this setup.
:::

## Use identical environment variables

Every instance must run with the same environment variables. Each server reads its settings from its own environment at startup, and nothing keeps them in sync, so two instances with different values will behave differently depending on which one answers a request. The one exception is `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS`, described below.

A single Kubernetes Deployment or Helm release already guarantees this. With Docker Compose or a manual setup, point every instance at the same `.env` file.

## Set the app database password explicitly

If `SPARKY_FITNESS_APP_DB_PASSWORD` is unset, each server generates its own password at startup and resets the app database role to match, which locks the other instances out of new connections. Set it explicitly (see [Database Names & Connection](./environment-variables.md#module-8-database-names-connection)).

The Helm chart handles this when Helm can read the cluster: it generates the password once, stores it in a Secret and reuses it on later upgrades. If your manifests are rendered without cluster access (for example `helm template` or Argo CD), set `server.appDatabase.password` or `server.appDatabase.existingSecret`, or enable both `externalSecrets.enabled` and `externalSecrets.appdb.enabled`, or each render generates a new password.

## Share the uploads and backup folders

Uploaded images and backups are stored on the server's disk. Every instance must mount the same uploads and backup folders, or a file uploaded through one instance will be missing on the others.

With Helm, the chart's default volumes are `ReadWriteOnce`, which usually cannot be attached to pods on different nodes. Set `server.persistence.uploads.accessMode` and `server.persistence.backup.accessMode` to `ReadWriteMany` with a StorageClass that supports it, and switch `server.strategy.type` to `RollingUpdate`. The access mode is fixed when a volume is created, so an existing install needs new volumes with its data copied over.

## Point the load balancer at the readiness check

Have your load balancer check `/api/health/ready` on each instance and send traffic only to instances that answer 200. It answers 503 once that instance has been unable to reach the database for more than about 10 seconds, and while it shuts down, so traffic moves to the others. While a backup is being restored it answers 200 with status `RESTORING`, so a container health check does not restart the server partway through the restore. `/api/health` only says the process is running.

## Run scheduled jobs on one instance

Scheduled jobs (nightly cleanup, hourly integration syncs, automatic backups, Open Food Facts syncing and the demo reset) run on every instance by default. Set `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true` on every instance except one, so exactly one instance runs them. With `SPARKY_FITNESS_LOG_LEVEL` set to `INFO` or `DEBUG`, each instance with jobs disabled says so in its startup log.

With Kubernetes, the Helm chart does this for you when `server.replicas` is above 1; change it in your values, not with `kubectl scale`. Without the chart, run the jobs instance as its own Deployment with `replicas: 1` and the `Recreate` strategy, sharing the same ConfigMap and Secrets, and set the variable on the Deployment you scale. With Docker Compose, keep scaling `sparkyfitness-server`, the service the frontend sends requests to, and add `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS: "true"` under its `environment:`. Then add a copy of that service under a new name, such as `sparkyfitness-jobs`, without the variable, to run the jobs. Do not put it in the shared `.env` file, or no instance will run the jobs.

A backup schedule saved in the admin settings reaches the jobs instance within 5 minutes.

## Restoring a backup: scale to one instance first

Restoring a backup from the admin page deletes the database and the uploads folder that every instance shares, so it must run with only one instance up. Scale to one instance (with Helm, `server.replicas: 1`; with Compose, one `sparkyfitness-server` without `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS` and no separate jobs service), wait until the others have stopped, restore, then scale back up. See [Manual Backup and Restore](/administration/manual_backup_restore) for the steps.

The server refuses a restore when it can tell other instances are running: when it has `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true`, or when another SparkyFitness server has database connections open. This is a safety net, not a guarantee: an instance with no traffic closes its database connections after about 30 seconds and then cannot be seen.

## What to expect during a rolling update

When you change an environment variable and redeploy one instance at a time, old and new instances run side by side for a short while. During that window:

- **Login options** (such as `SPARKY_FITNESS_DISABLE_EMAIL_LOGIN`) can differ between instances, so the login page may briefly show the old or new options depending on which instance answers.
- **The OIDC provider** from `SPARKY_FITNESS_OIDC_*` is written to the database by each instance when it starts, so whichever instance writes it last wins. In a normal rolling update that is a new instance. If an old instance restarts partway through, restart one new instance after the update finishes to put the new configuration back.

Once every instance runs the new configuration, they all agree again.
