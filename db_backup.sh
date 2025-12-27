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

# Execute pg_dump
/opt/homebrew/opt/postgresql@15/bin/pg_dump -U $SPARKY_FITNESS_DB_USER -h $SPARKY_FITNESS_DB_HOST -p $SPARKY_FITNESS_DB_PORT -d $SPARKY_FITNESS_DB_NAME --schema-only --no-owner -f db_schema_backup.sql

# Unset PGPASSWORD for security
unset PGPASSWORD

echo "Backup completed: db_schema_backup.sql"
