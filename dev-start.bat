@echo off
echo Starting SparkyFitness Development Environment...
docker compose --env-file .env -f docker/docker-compose.dev.yml up --build -d
echo.
echo Frontend: http://localhost:3004
echo Backend:  http://localhost:3010
pause
