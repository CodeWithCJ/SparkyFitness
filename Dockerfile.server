# syntax=docker/dockerfile:1.4

# Stage 1: Build backend dependencies
FROM node:20-slim AS backend_builder

WORKDIR /app/SparkyFitnessServer

# Copy package.json and package-lock.json for dependency installation
COPY package.json package-lock.json ./

# Install backend dependencies
RUN npm install

# Stage 2: Runtime container for backend
FROM node:20-slim

WORKDIR /app/SparkyFitnessServer

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules from the builder stage
COPY --from=backend_builder /app/SparkyFitnessServer/node_modules ./node_modules

# Copy the rest of the backend application code
COPY . .
COPY package.json /app/package.json

# Expose the port your backend server listens on
EXPOSE 3010

# Healthcheck
HEALTHCHECK --interval=5s --timeout=10s --retries=5 CMD ["/usr/bin/curl", "http://127.0.0.1:3010/health"]

# Command to run the backend server
CMD ["node", "SparkyFitnessServer.js"]