ALTER TABLE exercise_entries
ADD COLUMN distance NUMERIC,
ADD COLUMN avg_heart_rate INTEGER;


ALTER TABLE user_preferences
ADD COLUMN default_distance_unit VARCHAR(20) NOT NULL DEFAULT 'km';

CREATE TABLE exercise_entry_activity_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    detail_type TEXT NOT NULL,
    detail_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_exercise_entry_activity_details_entry_id ON exercise_entry_activity_details(exercise_entry_id);
CREATE INDEX idx_exercise_entry_activity_details_provider_type ON exercise_entry_activity_details(provider_name, detail_type);