# Docker Compose [Recommended]

This page provides instructions for installing and running SparkyFitness using Docker Compose. This method is recommended for most users as it simplifies the setup process.

## Prerequisites

Before you begin, ensure you have the following installed:

*   **Docker Desktop**: Includes Docker Engine, Docker Compose, and Docker CLI.
    *   [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

## Installation Steps

1.  **Clone the Repository**:
    If you haven't already, clone the SparkyFitness repository to your local machine:
    ```bash
    git clone https://github.com/codewithcj/SparkyFitness.git
    cd SparkyFitness
    ```

2.  **Configure Environment Variables**:
    The `docker-compose.prod.yml` file relies on environment variables defined in a `.env` file.
    Copy the example environment file and then edit it to configure your settings:
    ```bash
    cp docker/.env.example .env
    ```
    Open the newly created `.env` file in a text editor and update the following variables:
    *   `SPARKY_FITNESS_DB_NAME`: Your desired PostgreSQL database name (e.g., `sparkyfitness_db`).
    *   `SPARKY_FITNESS_DB_USER`: Your desired PostgreSQL database user (e.g., `sparky`).
    *   `SPARKY_FITNESS_DB_PASSWORD`: A strong password for your PostgreSQL database.
    *   `SPARKY_FITNESS_FRONTEND_URL`: The public URL where your frontend will be accessible (e.g., `http://localhost:3004` for local testing, or your domain like `https://fitness.example.com` for production).
    *   `SPARKY_FITNESS_API_ENCRYPTION_KEY`: A 64-character hex string for API encryption. You can generate one using `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
    *   `JWT_SECRET`: A strong, random string for JSON Web Token (JWT) signing. You can generate one using `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
    *   `SPARKY_FITNESS_ADMIN_EMAIL`: (Optional) Set an email address to automatically grant admin privileges to a user on server startup.

3.  **Start Docker Compose**:
    Navigate to the root directory of the `SparkyFitness` project (where `docker-compose.prod.yml` is located) and run:
    ```bash
    docker-compose -f docker/docker-compose.prod.yml up -d
    ```
    *   `-f docker/docker-compose.prod.yml`: Specifies the production Docker Compose file.
    *   `up`: Starts the services defined in the Compose file.
    *   `-d`: Runs the containers in detached mode (in the background).

## Services Overview

The `docker-compose.prod.yml` file defines three main services:

*   **`sparkyfitness-db`**:
    *   **Image**: `postgres:15-alpine`
    *   **Purpose**: The PostgreSQL database server for storing application data.
    *   **Data Persistence**: Data is persisted in a Docker volume mapped to `../postgresql` on your host, ensuring your data is not lost if containers are removed.

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

## Accessing the Application

Once all services are up and running, you can access the SparkyFitness frontend in your web browser at the URL you configured for `SPARKY_FITNESS_FRONTEND_URL` (e.g., `http://localhost:3004`).

## Stopping and Removing Services

To stop the running services without removing their data volumes:
```bash
docker-compose -f docker/docker-compose.prod.yml stop
```

To stop and remove all services, networks, and volumes (this will delete your database data!):
```bash
docker-compose -f docker/docker-compose.prod.yml down -v