-- User-defined symptom body locations (e.g. "Left shoulder", "Jaw"), synced like custom symptoms.
-- Mirrors user_custom_symptoms. RLS is applied in db/rls_policies.sql (reapplied every startup).

CREATE TABLE user_custom_symptom_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_symptom_location_name UNIQUE (user_id, name)
);

CREATE INDEX idx_user_custom_symptom_locations_user_id
    ON user_custom_symptom_locations(user_id);

CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_custom_symptom_locations
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
