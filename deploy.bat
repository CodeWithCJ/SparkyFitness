@echo off
echo ===== SparkyFitness Deployment =====
echo Environment: STAGING
echo Started: 2026-04-18 23:38:37.48

echo [1/3] Pulling latest Docker images...
docker compose -f docker-compose.staging.yml pull

echo [2/3] Starting staging environment...
docker compose -f docker-compose.staging.yml up -d

echo [3/3] Verifying deployment...
docker compose -f docker-compose.staging.yml ps

echo Deployment complete!
echo Frontend: http://localhost:8081
echo Backend:  http://localhost:3010
echo Database: localhost:5433
echo ===== Deployment Finished =====
