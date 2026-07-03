CREATE TABLE user_nutrient_display_preferences (
    id SERIAL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    view_group VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    visible_nutrients JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, view_group, platform)
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_user_nutrient_display_preferences_updated_at
BEFORE UPDATE ON user_nutrient_display_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();