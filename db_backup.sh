#!/bin/bash

echo "Loading environment variables from .env..."

# Check if .env file exists
if [ -f .env ]; then
  # Load environment variables from .env file
  while IFS='=' read -r key value; do
    # Skip empty lines and comments
    if [[ ! -z "$key" && ! "$key" =~ ^# ]]; then
      # Remove leading/trailing whitespace from key and value
      key=$(echo "$key" | xargs)
      value=$(echo "$value" | xargs)
      export "$key"="$value"
    fi
  done < .env
else
  echo "Error: .env file not found!"
  exit 1
fi

echo "Backing up schema for database: $SPARKY_FITNESS_DB_NAME on $SPARKY_FITNESS_DB_HOST:$SPARKY_FITNESS_DB_PORT"

# Set PGPASSWORD for pg_dump
export PGPASSWORD=$SPARKY_FITNESS_DB_PASSWORD

# Locate pg_dump for PostgreSQL 18 (matching server version 18.3)
PG_DUMP_BIN=""

if [ -x "/opt/homebrew/opt/postgresql@18/bin/pg_dump" ]; then
  PG_DUMP_BIN="/opt/homebrew/opt/postgresql@18/bin/pg_dump"
elif [ -x "/usr/local/opt/postgresql@18/bin/pg_dump" ]; then
  PG_DUMP_BIN="/usr/local/opt/postgresql@18/bin/pg_dump"
elif command -v pg_dump >/dev/null 2>&1; then
  PG_DUMP_BIN="pg_dump"
fi

if [ -z "$PG_DUMP_BIN" ]; then
  echo "Error: pg_dump not found! Please install postgresql@18 (e.g. using 'brew install postgresql@18')"
  exit 1
fi

echo "Using pg_dump binary at: $PG_DUMP_BIN"

# Execute pg_dump
$PG_DUMP_BIN -U $SPARKY_FITNESS_DB_USER -h $SPARKY_FITNESS_DB_HOST -p $SPARKY_FITNESS_DB_PORT -d $SPARKY_FITNESS_DB_NAME --schema-only --no-owner -f db_schema_backup.sql

# Unset PGPASSWORD for security
unset PGPASSWORD

echo "Backup completed: db_schema_backup.sql"
