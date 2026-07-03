-- Migration to create backup_settings table

CREATE TABLE IF NOT EXISTS backup_settings (
    id SERIAL PRIMARY KEY,
    backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    backup_days TEXT[] NOT NULL DEFAULT '{}',
    backup_time TEXT NOT NULL DEFAULT '02:00',
    retention_days INTEGER NOT NULL DEFAULT 7,
    last_backup_status TEXT,
    last_backup_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one row exists in the backup_settings table
CREATE UNIQUE INDEX IF NOT EXISTS unique_backup_settings_row ON backup_settings ((id IS NOT NULL));