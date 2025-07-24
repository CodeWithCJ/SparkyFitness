
# Portainer Installation Guide

This guide provides step-by-step instructions on how to install and deploy SparkyFitness using Portainer. Portainer simplifies Docker management through a user-friendly web interface.

## Prerequisites

Before you begin, ensure you have:

1.  **A running Docker environment**: Portainer requires Docker to be installed on your server.
2.  **Portainer installed and configured**: Access to your Portainer instance. If you haven't installed Portainer yet, follow the official Portainer documentation.

## Step 1: Create a New Stack in Portainer

1.  **Log in to Portainer**.
2.  Navigate to **Stacks** in the left sidebar.
3.  Click **Add stack**.
4.  **Name your stack** (e.g., `sparkyfitness`).
5.  Select **Git Repository** for the build method.
6.  **Repository URL**: Enter `https://github.com/CodeWithCJ/SparkyFitness.git`
7.  **Compose path**: Enter `docker/docker-compose.prod.yml`
8.  **Environment variables**: Add the following environment variables directly in Portainer:

    *   `SPARKY_FITNESS_DB_NAME`: Your desired PostgreSQL database name (e.g., `sparkyfitness_db`).
    *   `SPARKY_FITNESS_DB_USER`: Your desired PostgreSQL database user (e.g., `sparky`).
    *   `SPARKY_FITNESS_DB_PASSWORD`: A strong password for your PostgreSQL database.
    *   `SPARKY_FITNESS_FRONTEND_URL`: The public URL where your frontend will be accessible (e.g., `http://your-server-ip:3004`).
    *   `SPARKY_FITNESS_API_ENCRYPTION_KEY`: A 64-character hex string for API encryption. You can generate one using `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
    *   `JWT_SECRET`: A strong, random string for JSON Web Token (JWT) signing. You can generate one using `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
    *   `SPARKY_FITNESS_ADMIN_EMAIL`: (Optional) Set an email address to automatically grant admin privileges to a user on server startup.

## Step 2: Deploy the Stack

1.  After configuring the stack, click the **Deploy the stack** button.
2.  Portainer will now pull the necessary Docker images and create the containers for SparkyFitness. This process may take a few minutes depending on your internet connection.

## Step 3: Access SparkyFitness

Once the stack is successfully deployed and all containers are running, you can access the SparkyFitness frontend in your web browser.

*   Open your web browser and navigate to the URL you configured for `SPARKY_FITNESS_FRONTEND_URL` in your environment variables (e.g., `http://your-server-ip:3004`).

You should now see the SparkyFitness login/signup page.