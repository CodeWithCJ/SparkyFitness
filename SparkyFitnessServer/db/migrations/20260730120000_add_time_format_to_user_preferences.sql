-- Add time_format column to user_preferences for time display preference
-- Options: 'HH:mm' (24-hour), 'h:mm A' (12-hour with uppercase AM/PM), 'h:mm a' (12-hour with lowercase am/pm)
ALTER TABLE user_preferences
  ADD COLUMN time_format text DEFAULT 'h:mm A' NOT NULL
  CHECK (time_format IN ('HH:mm', 'h:mm A', 'h:mm a'));
