# Manual Backup and Restore for SparkyFitness

This document provides instructions for performing manual backup and restore operations for SparkyFitness, primarily for disaster recovery scenarios where the in-app restore might not be feasible.

## 1. Manual Backup

While the application provides scheduled backups, you can manually trigger a backup if needed. The in-app backup process creates a combined archive containing the PostgreSQL database dump and the `uploads` directory.

**Important Note:** This backup functionality is new and should be used with caution. While it creates a backup, it's highly recommended to create additional backups independently of this application. Always follow the 3-2-1 backup strategy (3 copies of your data, on 2 different media, with 1 copy offsite) to ensure data safety. The functionality of restore may not work properly in all scenarios, so do not rely solely on this in-app backup.

**Location of Backups:**
All backup files are stored in a Docker volume mounted to the `SparkyFitnessServer` service. The default path within the container is `/app/SparkyFitnessServer/backup`. You will need to access this volume from your Docker host.

A backup is built in the `.tmp` folder inside the backup directory and only moved into the backup directory once it is complete, so a backup that fails or is cut off never shows up as a backup. If the server is killed while a backup runs, its unfinished files stay in `.tmp`; the next backup clears anything there that is more than a day old, and you can delete the rest while no backup is running.

**How a restore from the admin page works:**

The server loads the archive beside your data: the database into a new database named after yours with `_restore_` and a random suffix added, and the uploads into a folder under `uploads/_staging`. It then brings that copy up to the running version's database schema, as a server start would. The app keeps showing your current data meanwhile, but every server instance refuses new changes (`503`, with `Retry-After`) and stops scheduled jobs from using the database until the restore is done. A request already running when the restore started can still save a change until the swap; that change stays only in the kept previous database. A refused change is not saved; make it again once the restore has finished. If the server stops during a restore, the next restore first drops the copy it left behind.

Once everything has loaded, the server closes the current database to new connections, ends the sessions still open on it, including other server instances', and renames both databases in one step: the restored copy takes your database's name, and the previous database is kept as `<name>_pre_restore_<date>_<time>` (UTC). The previous uploads are kept in `uploads/_staging/pre-restore-<date>_<time>`. Requests in that moment fail once and work again on the next try.

If the archive is damaged, the load fails, or the swap cannot happen, your current data is left as it was. The uploads move only after the database swap: if moving them fails, the restore says so and names both folders, the restored uploads (`uploads/_staging/restored-…`) and the previous ones (`uploads/_staging/pre-restore-…`), so you can finish the move by hand. Only one restore runs at a time; a second one is refused until the first has finished. With more than one server instance, every instance can keep running.

**Keeping or removing the previous data:** the kept database does not accept connections. Run the commands below connected to the `postgres` maintenance database (for example `psql -d postgres`), since PostgreSQL cannot rename or drop the database you are connected to. Once you are happy with the restore, delete it with `DROP DATABASE <name>_pre_restore_<date>_<time>;` and delete the `pre-restore-*` folder. To go back to it instead, stop the server, then run `ALTER DATABASE <name> RENAME TO <name>_unwanted;`, `ALTER DATABASE <name>_pre_restore_<date>_<time> RENAME TO <name>;` and `ALTER DATABASE <name> WITH ALLOW_CONNECTIONS true;`, then move everything in `uploads` except `_staging` into a new folder of your own (outside `uploads`) and move the `pre-restore-*` folder's contents back into `uploads` (each entry carries a short random suffix to drop). If the restore reported that the uploads were not moved, your previous uploads are still in `uploads` and there is no `pre-restore-*` folder: leave `uploads` as it is and delete the `restored-*` folder instead.

**Requirements:** room for a second copy of the database and the uploads, and a database user (`SPARKY_FITNESS_DB_USER`) that can create databases, connect to the `postgres` maintenance database, and end the sessions of every role connected to your database, including `SPARKY_FITNESS_APP_DB_USER`. A superuser can do all of this. Otherwise grant it `pg_signal_backend` (`GRANT pg_signal_backend TO <user>;`, run by a superuser). Without it the restore stops before changing anything and says so. That grant does not cover a superuser's sessions, so unless your database user is a superuser, close any superuser session on the database (psql, pgAdmin) before restoring.

## 2. Manual Restore (Disaster Recovery)

This process is for situations where the SparkyFitness application or its Docker containers are not functioning correctly, or if you need to restore to a completely new environment.

**WARNING:** This process will **permanently delete all existing data** in your PostgreSQL database and `uploads` directory before restoring from the backup. Ensure you have chosen the correct backup file.

### Prerequisites:

*   Access to your Docker host machine.
*   The `docker-compose.yml` file used to deploy SparkyFitness.
*   The full backup archive (`sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz`) you wish to restore.
*   `docker` and `docker-compose` (or `docker compose`) installed on your host.
*   `psql` and `tar` utilities available on your host or within a temporary container.

### Steps:

1.  **Stop SparkyFitness Services:**
    Navigate to the directory containing your `docker-compose.yml` file and stop the SparkyFitness services.

    ```bash
    docker compose down
    ```

2.  **Identify and Access the Backup Volume:**
    Find the Docker volume associated with the `SparkyFitnessServer`'s backup directory. You can inspect your `docker-compose.yml` for volume definitions or use `docker volume ls` and `docker volume inspect <volume_name>`.
    The volume will likely be mounted to a path like `/var/lib/docker/volumes/<volume_name>/_data` on Linux hosts.

    Let's assume your backup volume is named `sparkyfitness_server_backup_data` and it's mounted to `/var/lib/docker/volumes/sparkyfitness_server_backup_data/_data`.

3.  **Prepare the Backup File:**
    Copy your chosen `sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz` file into the backup volume's data directory on your host.

    ```bash
    cp /path/to/your/backup/sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz /var/lib/docker/volumes/sparkyfitness_server_backup_data/_data/
    ```
    Replace `/path/to/your/backup/` with the actual path to your backup file.

4.  **Extract the Backup Archive:**
    You'll need to extract the combined archive to get the database dump and uploads archive. You can do this directly on the host if `tar` is available, or use a temporary Docker container.

    **Option A: Using host `tar` (if available):**

    ```bash
    cd /var/lib/docker/volumes/sparkyfitness_server_backup_data/_data/
    tar -xzf sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz
    ```

    **Option B: Using a temporary Docker container:**

    ```bash
    docker run --rm -v sparkyfitness_server_backup_data:/backup_volume ubuntu:latest tar -xzf /backup_volume/sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz -C /backup_volume
    ```
    This will extract `sparkyfitness_db_backup_YYYYMMDD_HHMMSS.sql.gz` and `sparkyfitness_uploads_backup_YYYYMMDD_HHMMSS.tar.gz` into the backup volume.

5.  **Clear Existing Database and Uploads Data:**
    **This step is destructive.** Ensure you have stopped the services and are confident in your backup.

    *   **Clear `uploads` directory:**
        Identify the Docker volume for your `SparkyFitnessServer`'s `uploads` directory (e.g., `sparkyfitness_server_uploads_data`).
        ```bash
        # Example: Assuming uploads volume is sparkyfitness_server_uploads_data
        docker run --rm -v sparkyfitness_server_uploads_data:/uploads_volume ubuntu:latest rm -rf /uploads_volume/*
        ```

    *   **Clear PostgreSQL Database:**
        You need to drop and recreate the database. You can use a temporary PostgreSQL client container.
        First, get the database connection details from your `docker-compose.yml` or `.env` file (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).

        ```bash
        # Example: Replace with your actual DB details
        DB_HOST="sparkyfitness-db" # Or localhost if connecting directly to host DB
        DB_PORT="5432"
        DB_USER="sparkyfitness"
        DB_PASSWORD="your_db_password"
        DB_NAME="sparkyfitness"

        # Drop database
        docker run --rm -e PGPASSWORD=${DB_PASSWORD} postgres:latest dropdb -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} ${DB_NAME}

        # Create database
        docker run --rm -e PGPASSWORD=${DB_PASSWORD} postgres:latest createdb -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} ${DB_NAME}
        ```
        *Note: If your `sparkyfitness-db` container is not running, you might need to start it temporarily or adjust `DB_HOST` to `localhost` if PostgreSQL is directly accessible on the host.*

6.  **Restore Database from Dump:**
    Use the `psql` command to restore the database from the extracted `.sql.gz` file.

    ```bash
    # Example: Replace with your actual DB details and backup file name
    DB_HOST="sparkyfitness-db"
    DB_PORT="5432"
    DB_USER="sparkyfitness"
    DB_PASSWORD="your_db_password"
    DB_NAME="sparkyfitness"
    DB_DUMP_FILE="/var/lib/docker/volumes/sparkyfitness_server_backup_data/_data/sparkyfitness_db_backup_YYYYMMDD_HHMMSS.sql.gz"

    gunzip -c ${DB_DUMP_FILE} | docker run --rm -i -e PGPASSWORD=${DB_PASSWORD} postgres:latest psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME}
    ```

7.  **Restore Uploads Directory:**
    Extract the `uploads` tar archive into the `SparkyFitnessServer`'s `uploads` volume.

    ```bash
    # Example: Assuming uploads volume is sparkyfitness_server_uploads_data
    UPLOADS_TAR_FILE="/var/lib/docker/volumes/sparkyfitness_server_backup_data/_data/sparkyfitness_uploads_backup_YYYYMMDD_HHMMSS.tar.gz"

    docker run --rm -v sparkyfitness_server_uploads_data:/uploads_volume ubuntu:latest tar -xzf ${UPLOADS_TAR_FILE} -C /uploads_volume
    ```

8.  **Clean Up Temporary Files:**
    Remove the extracted database dump and uploads tar files from your backup volume.

    ```bash
    cd /var/lib/docker/volumes/sparkyfitness_server_backup_data/_data/
    rm sparkyfitness_db_backup_YYYYMMDD_HHMMSS.sql.gz
    rm sparkyfitness_uploads_backup_YYYYMMDD_HHMMSS.tar.gz
    rm sparkyfitness_full_backup_YYYYMMDD_HHMMSS.tar.gz
    ```

9.  **Start SparkyFitness Services:**

    ```bash
    docker compose up -d
    ```

Your SparkyFitness instance should now be restored to the state of your chosen backup.