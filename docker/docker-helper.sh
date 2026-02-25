#!/bin/bash

# SparkyFitness Docker Management Script
# Usage: ./docker-helper.sh [dev|prod] [up|down|build|logs|ps|clean]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to show help
show_help() {
    echo "🚀 SparkyFitness Docker Management Script"
    echo ""
    echo "USAGE:"
    echo "  $0 [ENVIRONMENT] [ACTION]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  dev      Local development with source code builds and volume mounts"
    echo "  prod     Production deployment using pre-built DockerHub images"
    echo ""
    echo "ACTIONS:"
    echo "  up       Start services (builds images for dev, pulls images for prod)"
    echo "  down     Stop and remove containers"
    echo "  build    Build/rebuild Docker images"
    echo "  logs     Show and follow container logs"
    echo "  ps       Show running container status"
    echo "  clean    Stop containers and clean up images/volumes"
    echo ""
    echo "EXAMPLES:"
    echo "  $0 dev up          # Start development environment"
    echo "  $0 prod up         # Start production environment"
    echo "  $0 dev logs        # View development logs"
    echo "  $0 dev build       # Rebuild development images"
    echo "  $0 prod clean      # Clean up production environment"
    echo ""
    echo "DEVELOPMENT FEATURES:"
    echo "  • Live code reloading via volume mounts"
    echo "  • Exposed ports: Frontend(8080), Backend(3010), Database(5432)"
    echo "  • Source code editing without rebuilding"
    echo ""
    echo "PRODUCTION FEATURES:"
    echo "  • Pre-built optimized images from DockerHub"
    echo "  • Internal networking only"
    echo "  • Frontend accessible on port 3004"
}

# Default values
ENVIRONMENT=""
ACTION=""

# Parse arguments
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

if [ $# -ge 1 ]; then
    ENVIRONMENT="$1"
fi

if [ $# -ge 2 ]; then
    ACTION="$2"
else
    echo "Error: ACTION is required"
    echo ""
    show_help
    exit 1
fi

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "Error: Environment must be 'dev' or 'prod'"
    echo ""
    show_help
    exit 1
fi

# Validate action
if [[ "$ACTION" != "up" && "$ACTION" != "down" && "$ACTION" != "build" && "$ACTION" != "logs" && "$ACTION" != "ps" && "$ACTION" != "clean" ]]; then
    echo "Error: Unknown action '$ACTION'"
    echo ""
    show_help
    exit 1
fi

# Set compose file
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.$ENVIRONMENT.yml"

# Change to project root for correct build context
cd "$PROJECT_ROOT"

echo "🚀 SparkyFitness Docker Manager"
echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"
echo "Compose file: $COMPOSE_FILE"
echo "Working directory: $(pwd)"
echo ""

case $ACTION in
    "up")
        echo "Starting services..."
        if [ "$ENVIRONMENT" = "dev" ]; then
            docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" up --build -d
        else
            docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" up -d
        fi
        echo "✅ Services started successfully!"
        echo ""
        echo "🌐 Application URLs:"
        if [ "$ENVIRONMENT" = "dev" ]; then
            echo "Frontend: http://localhost:8080"
            echo "Backend: http://localhost:3010"
            echo "Database: localhost:5432"
        else
            echo "Frontend: http://localhost:3004"
            echo "Backend: Internal network only"
            echo "Database: Internal network only"
        fi
        ;;
    "down")
        echo "Stopping services..."
        docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" down
        echo "✅ Services stopped successfully!"
        ;;
    "build")
        echo "Building services..."
        docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" build
        echo "✅ Services built successfully!"
        ;;
    "logs")
        echo "Showing logs..."
        docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" logs -f
        ;;
    "ps")
        echo "Service status:"
        docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" ps
        ;;
    "clean")
        echo "Cleaning up containers, networks, and images..."
        docker compose --env-file "$(pwd)/.env" -f "$COMPOSE_FILE" down --volumes --remove-orphans
        docker system prune -f
        echo "✅ Cleanup completed!"
        ;;
esac
