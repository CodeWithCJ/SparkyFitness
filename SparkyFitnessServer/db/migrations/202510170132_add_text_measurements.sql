-- Add data_type column to custom_categories to distinguish between numeric and text entries.
-- Default to 'numeric' to ensure backward compatibility for all existing categories.
ALTER TABLE custom_categories
ADD COLUMN data_type TEXT DEFAULT 'numeric';

-- Alter the value column in custom_measurements to TEXT to support storing non-numeric data.
-- Existing numeric values will be cast to text automatically.
ALTER TABLE custom_measurements
ALTER COLUMN value TYPE TEXT;

-- Add a nullable notes column to custom_measurements for adding optional context to any entry.
ALTER TABLE custom_measurements
ADD COLUMN notes TEXT;