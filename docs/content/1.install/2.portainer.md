
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
5.  Select **Upload** for the build method.
6.  **Upload File**: Download the [docker-compose.prod.yml](https://github.com/CodeWithCJ/SparkyFitness/releases/latest/download/docker-compose.prod.yml) from the latest release and upload it here.
7.  (Optional) You can also use the **Web editor** method and copy-paste the content if you prefer.
8.  **Environment variables**: For a comprehensive list of all available environment variables and their detailed descriptions, please refer to the [Environment Variables documentation](/install/environment-variables). You will need to add these environment variables directly in Portainer.

## Step 2: Deploy the Stack

1.  After configuring the stack, click the **Deploy the stack** button.
2.  Portainer will now pull the necessary Docker images and create the containers for SparkyFitness. This process may take a few minutes depending on your internet connection.

## Step 3: Access SparkyFitness

Once the stack is successfully deployed and all containers are running, you can access the SparkyFitness frontend in your web browser.

*   Open your web browser and navigate to the URL you configured for `SPARKY_FITNESS_FRONTEND_URL` in your environment variables (e.g., `http://your-server-ip:3004`).

You should now see the SparkyFitness login/signup page.