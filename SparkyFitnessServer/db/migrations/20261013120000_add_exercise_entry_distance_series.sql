-- Distance against active time for a session recorded without a route (a
-- treadmill walk or run from the watch), so its pace can be charted.
-- One row per entry; `points` is a JSONB array of [active_seconds, metres].
CREATE TABLE IF NOT EXISTS exercise_entry_distance_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_exercise_entry_distance_series UNIQUE (exercise_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_entry_distance_series_user_date
    ON exercise_entry_distance_series(user_id, entry_date DESC);
