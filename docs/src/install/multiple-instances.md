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

With Helm, the chart's default volumes are `ReadWriteOnce`, which usually cannot be attached to pods on different nodes, so the chart refuses to render `server.replicas` above 1 until both volumes are `ReadWriteMany`. Set `server.persistence.uploads.accessMode` and `server.persistence.backup.accessMode` to `ReadWriteMany` with a StorageClass that supports it. The access mode is fixed when a volume is created, so an existing install needs new volumes with its data copied over: create them yourself, copy the data, and set `server.persistence.uploads.existingClaim` and `server.persistence.backup.existingClaim` to their names, keeping `accessMode: ReadWriteMany` so the chart knows they can be shared. On a single-node cluster every pod can attach a `ReadWriteOnce` volume, so `server.persistence.allowSingleNodeVolumes: true` keeps the existing volumes; pods scheduled on another node later would never start.

## What the Helm chart sets up for you

With `server.replicas` above 1, the chart also:

- replaces pods one at a time (`RollingUpdate` with `maxUnavailable: 0`) instead of stopping them all first;
- adds a PodDisruptionBudget so a node drain takes down one server pod at a time (not with `server.persistence.allowSingleNodeVolumes: true`, since on a single node the drained pod cannot start again until the drain ends);
- asks the scheduler to spread the server pods across nodes (a preference, so a single-node cluster still runs them all);
- waits 5 seconds in a `preStop` hook so the pod leaves the Service before it stops accepting requests, and waits `minReadySeconds: 5` before counting a new pod as available.

Each of these has a value to change or turn off (`server.strategy`, `server.podDisruptionBudget`, `server.topologySpreadConstraints` or `server.defaultTopologySpread`, `server.preStopDelaySeconds` or `server.lifecycle`, `server.minReadySeconds`). Setting `frontend.replicas: 2` gives the web frontend the same budget, spread, `preStop` delay and `minReadySeconds`, so the UI also survives losing a node. On a single-node cluster, also set `frontend.podDisruptionBudget.enabled: false`, or a node drain waits forever for a frontend pod that cannot start anywhere else.

## Point the load balancer at the readiness check

Have your load balancer check `/api/health/ready` on each instance and send traffic only to instances that answer 200. It answers 503 once that instance has been unable to reach the database for more than about 10 seconds, and while it shuts down, so traffic moves to the others. While it swaps a restored backup in, the instance running the restore answers 200 with status `RESTORING`, so a container health check does not restart it partway through. `/api/health` only says the process is running.

## Scheduled jobs

Scheduled jobs (nightly cleanup, hourly integration syncs, automatic backups, Open Food Facts syncing and the demo reset) need no setup: every instance schedules them, and at each scheduled time the first instance to claim the run in the database runs it while the others skip it. If that instance stops, the next run goes to whichever instance is up.

You can still keep scheduled jobs on one instance by setting `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true` on every other instance. With `SPARKY_FITNESS_LOG_LEVEL` set to `INFO` or `DEBUG`, each instance with jobs disabled says so in its startup log.

Without the Helm chart, set it on that instance's own environment, not in a shared `.env` file, or no instance will run the jobs. The Helm chart runs every replica the same way and does not set it. Upgrading from a chart that ran a separate `-jobs` Deployment deletes that Deployment and adds its replica to the others.

A backup schedule saved in the admin settings reaches every instance within 5 minutes.

## Restoring a backup

A restore from the admin page runs with every instance up. While it loads the backup beside the live data, every instance keeps serving reads, refuses changes with `503` and stops scheduled jobs from using the database. It then ends every instance's connections to the old database and swaps the restored one in, so requests fail for a moment and work again on the next try. Only one restore runs at a time across all instances. See [Manual Backup and Restore](/administration/manual_backup_restore) for what it needs and how to roll back.

## What to expect during a rolling update

When you change an environment variable and redeploy one instance at a time, old and new instances run side by side for a short while. During that window:

- **Login options** (such as `SPARKY_FITNESS_DISABLE_EMAIL_LOGIN`) can differ between instances, so the login page may briefly show the old or new options depending on which instance answers.
- **The OIDC provider** from `SPARKY_FITNESS_OIDC_*` is written to the database by each instance when it starts, so whichever instance writes it last wins. In a normal rolling update that is a new instance. If an old instance restarts partway through, restart one new instance after the update finishes to put the new configuration back.

Once every instance runs the new configuration, they all agree again.
