-- Migration: Add display_name column to custom_categories table
-- This allows users to set a custom display name (alias) for categories
-- while keeping the 'name' field as a stable identifier for syncing

-- Add display_name column
ALTER TABLE custom_categories
ADD COLUMN display_name VARCHAR(100);

-- Add comment explaining the column purpose
COMMENT ON COLUMN custom_categories.display_name IS 'User-editable display name for the category. If NULL, the name field is used for display. The name field serves as the stable identifier for syncing and lookups.';
