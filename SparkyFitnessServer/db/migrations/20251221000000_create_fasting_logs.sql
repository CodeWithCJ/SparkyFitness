-- Create fasting_logs table
CREATE TABLE IF NOT EXISTS public.fasting_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    target_end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    fasting_type VARCHAR(50),
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    mood_entry_id UUID REFERENCES public.mood_entries(id) ON DELETE SET NULL,
    weight_at_end NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies are enabled and defined in rls_policies.sql
-- Permissions are granted in grantPermissions.js

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_fasting_logs_updated_at ON public.fasting_logs;
CREATE TRIGGER update_fasting_logs_updated_at
    BEFORE UPDATE ON public.fasting_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
