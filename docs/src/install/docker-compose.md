# Docker Compose [Recommended]

This page provides instructions for installing and running SparkyFitness using Docker Compose. This method is recommended for most users as it simplifies the setup process.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker Desktop**: Includes Docker Engine, Docker Compose, and Docker CLI.
  - [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

## Installation Steps

1.  **Create a new folder and download `docker-compose.yml`**:
    Create a new directory for SparkyFitness and navigate into it.

    ```bash
    mkdir sparkyfitness && cd sparkyfitness
    curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml
    ```

2.  **Configure Environment Variables (`.env`)**:
    Choose the configuration method that best fits your needs:
    - ⚡ **[Interactive .env Generator (Recommended)](/install/env-generator)**: Generate a tailored `.env` file with 1-click cryptographically secure passwords and secrets directly in your browser.
    - 📄 **[Minimal .env Starter Template](https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example)**: Download the 5-variable minimal template for rapid 60-second setup:
      ```bash
      curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example
      ```
    - 📚 **[Full .env Reference](https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example)** / **[Documentation Guide](/install/environment-variables)**: Complete reference containing all optional knobs (OIDC, SMTP, Rate Limiting, Proxy headers).

3.  **Replace the placeholder values**:
    Skip this if you used the generator — it fills them in for you. If you downloaded either template, open `.env` and replace every placeholder before starting. The server fails its preflight checks while they are left as-is, and PostgreSQL would otherwise initialize with the published `changeme_db_password`.
    - `SPARKY_FITNESS_DB_PASSWORD` — any strong password.
    - `SPARKY_FITNESS_API_ENCRYPTION_KEY` — `openssl rand -hex 32` (64 hex characters; the server rejects anything else).
    - `BETTER_AUTH_SECRET` — `openssl rand -base64 32` (44 characters).
    - `SPARKY_FITNESS_FRONTEND_URL` — the URL you will actually open the app at.

4.  **Start the Application**:
    From within the `sparkyfitness` directory (where `docker-compose.yml` is located), pull the latest images and start the application services:
    ```bash
    docker compose pull && docker compose up -d
    ```
    - `docker compose pull`: Downloads the latest Docker images for the services.
    - `docker compose up -d`: Starts the services defined in the `docker-compose.yml` file in detached mode (in the background).

## Services Overview

The `docker-compose.prod.yml` file defines three main services:

- **`sparkyfitness-db`**:
  - **Image**: `postgres:18.3-alpine`
  - **Purpose**: The PostgreSQL database server for storing application data.
  - **Data Persistence**: Data is persisted to `./postgresql` on your host (override with `DB_PATH`), ensuring your data is not lost if containers are removed.

- **`sparkyfitness-server`**:
  - **Image**: `codewithcj/sparkyfitness_server:latest`
  - **Purpose**: The backend Node.js application server.
  - **Environment Variables**: Configured with necessary database connection details, logging level, API encryption key, JWT secret, and frontend URL.
  - **Dependencies**: Depends on `sparkyfitness-db` to ensure the database is running before the server starts.

- **`sparkyfitness-frontend`**:
  - **Image**: `codewithcj/sparkyfitness:latest`
  - **Purpose**: The frontend React application served by Nginx.
  - **Ports**: Maps host port `3004` to container port `80` (Nginx), making the frontend accessible via `http://localhost:3004` (or your configured domain).
  - **Dependencies**: Depends on `sparkyfitness-server` to ensure the backend is running.

### Optional Services (Commented out by default)

To enable these services, open your `docker-compose.yml` file and uncomment the relevant blocks.

- **`sparkyfitness-garmin`**:
  - **Image**: `codewithcj/sparkyfitness_garmin:latest`
  - **Purpose**: A dedicated microservice for syncing data directly from Garmin Connect.

## Accessing the Application

Once all services are up and running, you can access the SparkyFitness frontend in your web browser at the URL you configured for `SPARKY_FITNESS_FRONTEND_URL` (e.g., `http://localhost:3004`).

### IPv6 Access

The production frontend listens on both IPv4 and IPv6 on the same container port
(80 as root, 8080 as non-root, or `NGINX_LISTEN_PORT` when configured). IPv4 access
continues to work. On kernels without IPv6 support, it keeps the IPv4 listener only.

Your container network, published ports, and firewall must also allow IPv6. For
the default published host port, test from the Docker host with:

```bash
curl --noproxy '*' -g 'http://[::1]:3004/'
```

From another machine, replace `::1` with the Docker host's reachable IPv6 address,
for example `http://[2001:db8::10]:3004/` (substitute your actual address). IPv6
addresses in URLs must be enclosed in brackets. Set `SPARKY_FITNESS_FRONTEND_URL`
to the exact URL used by clients, preferably an HTTPS hostname with an AAAA record
when using a reverse proxy. Adding a listener does not configure Docker IPv6
networking or change the backend's bind address.

## Stopping and Removing Services

To stop the running services without removing their data volumes:

```bash
docker compose stop
```

To stop and remove all services, networks, and volumes (this will delete your database data!):

```bash
docker compose down -v
```
