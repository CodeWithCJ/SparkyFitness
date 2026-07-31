#!/bin/bash

# if permission is missing, run chmod +x start_garmin_microservice.sh

# Navigate to the repo root directory
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

# Load environment variables from .env if present.
# Sourcing rather than parsing line-by-line: an IFS='=' read truncates any value
# containing '=' (base64 secrets, connection strings) and passing values through
# xargs word-splits them and strips quotes.
if [ -f .env ]; then
  echo "Loading environment variables from .env..."
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Set default values if not defined
GARMIN_SERVICE_PORT="${GARMIN_SERVICE_PORT:-8000}"
export SPARKY_FITNESS_GARMIN_DATA_SOURCE="${SPARKY_FITNESS_GARMIN_DATA_SOURCE:-garmin_connect}"

# Find Python 3.10+ binary
PYTHON_BIN=""
for cmd in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    VER=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ]; then
      PYTHON_BIN="$cmd"
      echo "Found Python $VER at $cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "Error: Python 3.10 or higher is required for the Garmin microservice."
  echo "System default python is below 3.10."
  echo "Please install Python 3.10+ (e.g. using 'brew install python@3.12')"
  exit 1
fi

echo "Starting SparkyFitness Garmin Microservice..."
echo "Port: $GARMIN_SERVICE_PORT"
echo "Data Source: $SPARKY_FITNESS_GARMIN_DATA_SOURCE"

cd SparkyFitnessGarmin || exit 1

# Check if existing venv is using Python >= 3.10
RECREATE_VENV=false
if [ -d "venv" ]; then
  VENV_VER=$(./venv/bin/python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)
  VENV_MINOR=$(echo "$VENV_VER" | cut -d. -f2)
  if [ -z "$VENV_MINOR" ] || [ "$VENV_MINOR" -lt 10 ]; then
    echo "Existing venv is Python $VENV_VER (requires >= 3.10). Recreating venv..."
    rm -rf venv
    RECREATE_VENV=true
  fi
else
  RECREATE_VENV=true
fi

if [ "$RECREATE_VENV" = true ]; then
  echo "Creating virtual environment with $PYTHON_BIN..."
  "$PYTHON_BIN" -m venv venv
  source venv/bin/activate
  echo "Installing dependencies from requirements.txt..."
  pip install --upgrade pip
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

# Start uvicorn server. Auto-reload is opt-in so this stays usable as a plain
# start script; set GARMIN_DEV_RELOAD=true for hot reload during development.
UVICORN_ARGS=(main:app --host 0.0.0.0 --port "$GARMIN_SERVICE_PORT")
if [ "$GARMIN_DEV_RELOAD" = "true" ]; then
  echo "Dev reload enabled."
  UVICORN_ARGS+=(--reload)
fi

python3 -m uvicorn "${UVICORN_ARGS[@]}"
