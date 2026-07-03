# Manual Backup and Restore for SparkyFitness

This document provides instructions for performing manual backup and restore operations for SparkyFitness, primarily for disaster recovery scenarios where the in-app restore might not be feasible.

## 1. Manual Backup

While the application provides scheduled backups, you can manually trigger a backup if needed. The in-app backup process creates a combined archive containing the PostgreSQL database dump and the `uploads` directory.

**Important Note:** This backup functionality is new and should be used with caution. While it creates a backup, it's highly recommended to create additional backups independently of this application. Always follow the 3-2-1 backup strategy (3 copies of your data, on 2 different media, with 1 copy offsite) to ensure data safety. The functionality of restore may not work properly in all scenarios, so do not rely solely on this in-app backup.

**Location of Backups:**
All backup files are stored in a Docker volume mounted to the `SparkyFitnessServer` service. The default path within the container is `/app/SparkyFitnessServer/backup`. You will need to access this volume from your Docker host.

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