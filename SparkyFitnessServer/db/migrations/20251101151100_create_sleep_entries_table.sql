CREATE TABLE sleep_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    bedtime TIMESTAMP WITH TIME ZONE NOT NULL,
    wake_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_in_seconds INTEGER NOT NULL,
    time_asleep_in_seconds INTEGER,
    sleep_score NUMERIC,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sleep_entries_user_id ON sleep_entries(user_id);
CREATE INDEX idx_sleep_entries_entry_date ON sleep_entries(entry_date);



CREATE TABLE sleep_entry_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES sleep_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Added user_id
    stage_type VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_in_seconds INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sleep_entry_stages_entry_id ON sleep_entry_stages(entry_id);
CREATE INDEX idx_sleep_entry_stages_user_id ON sleep_entry_stages(user_id); -- Added index for user_id
CREATE INDEX idx_sleep_entry_stages_start_time ON sleep_entry_stages(start_time);