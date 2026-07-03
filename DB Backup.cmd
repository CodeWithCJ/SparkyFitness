@echo off
echo Loading environment variables from .env...

for /f "tokens=1,2 delims== " %%a in (.env) do set "%%a=%%b"

echo Backing up schema for database: %SPARKY_FITNESS_DB_NAME% on %SPARKY_FITNESS_DB_HOST%:%SPARKY_FITNESS_DB_PORT%
set PGPASSWORD=%SPARKY_FITNESS_DB_PASSWORD%

pg_dump -U %SPARKY_FITNESS_DB_USER% -h %SPARKY_FITNESS_DB_HOST% -p %SPARKY_FITNESS_DB_PORT% -d %SPARKY_FITNESS_DB_NAME% --schema-only --no-owner -f db_schema_backup.sql

set PGPASSWORD=
echo Backup completed: db_schema_backup.sql
pause
