# Docker Compose [Recommended]

This page provides instructions for installing and running SparkyFitness using Docker Compose. This method is recommended for most users as it simplifies the setup process.

## Prerequisites

Before you begin, ensure you have the following installed:

*   **Docker Desktop**: Includes Docker Engine, Docker Compose, and Docker CLI.
    *   [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

## Installation Steps

1.  **Create a new folder and download `docker-compose.yml`**:
    Create a new directory for SparkyFitness and navigate into it.
    ```bash
    mkdir sparkyfitness && cd sparkyfitness
    curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml
    ```

2.  **Configure Environment Variables (`.env`)**:
    Choose the configuration method that best fits your needs:
    *   ⚡ **[Interactive .env Generator (Recommended)](/install/env-generator)**: Generate a tailored `.env` file with 1-click cryptographically secure passwords and secrets directly in your browser.
    *   📄 **[Minimal .env Starter Template](https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example)**: Download the 5-variable minimal template for rapid 60-second setup:
        ```bash
        curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example
        ```
    *   📚 **[Full .env Reference](https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example)** / **[Documentation Guide](/install/environment-variables)**: Complete reference containing all optional knobs (OIDC, SMTP, Rate Limiting, Proxy headers).

3.  **Start the Application**:
    From within the `sparkyfitness` directory (where `docker-compose.yml` is located), pull the latest images and start the application services:
    ```bash
    docker compose pull && docker compose up -d
    ```
    *   `docker compose pull`: Downloads the latest Docker images for the services.
    *   `docker compose up -d`: Starts the services defined in the `docker-compose.yml` file in detached mode (in the background).

## Services Overview

The `docker-compose.prod.yml` file defines three main services:

*   **`sparkyfitness-db`**:
    *   **Image**: `postgres:18.3-alpine`
    *   **Purpose**: The PostgreSQL database server for storing application data.
    *   **Data Persistence**: Data is persisted to `./postgresql` on your host (override with `DB_PATH`), ensuring your data is not lost if containers are removed.

*   **`sparkyfitness-server`**:
    *   **Image**: `codewithcj/sparkyfitness_server:latest`
    *   **Purpose**: The backend Node.js application server.
    *   **Environment Variables**: Configured with necessary database connection details, logging level, API encryption key, JWT secret, and frontend URL.
    *   **Dependencies**: Depends on `sparkyfitness-db` to ensure the database is running before the server starts.

*   **`sparkyfitness-frontend`**:
    *   **Image**: `codewithcj/sparkyfitness:latest`
    *   **Purpose**: The frontend React application served by Nginx.
    *   **Ports**: Maps host port `3004` to container port `80` (Nginx), making the frontend accessible via `http://localhost:3004` (or your configured domain).
    *   **Dependencies**: Depends on `sparkyfitness-server` to ensure the backend is running.

### Optional Services (Commented out by default)

To enable these services, open your `docker-compose.yml` file and uncomment the relevant blocks.

*   **`sparkyfitness-garmin`**:
    *   **Image**: `codewithcj/sparkyfitness_garmin:latest`
    *   **Purpose**: A dedicated microservice for syncing data directly from Garmin Connect.

## Accessing the Application

Once all services are up and running, you can access the SparkyFitness frontend in your web browser at the URL you configured for `SPARKY_FITNESS_FRONTEND_URL` (e.g., `http://localhost:3004`).

## Stopping and Removing Services

To stop the running services without removing their data volumes:
```bash
docker compose stop
```

To stop and remove all services, networks, and volumes (this will delete your database data!):
```bash
docker compose down -v
