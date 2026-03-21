ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS auto_scale_online_imports BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN user_preferences.auto_scale_online_imports IS 'When enabled, nutrition values from all online database imports will auto-scale when the serving size is changed in the Edit Food Details dialog';
