-- =========================================================
-- Migration: Sleep Science (MCTQ Chronotype + WHOOP Sleep Debt)
--
-- Based on the MCTQ protocol (Munich Chronotype Questionnaire)
-- by Roenneberg and the WHOOP dynamic sleep need model.
--
-- References:
-- - Roenneberg et al., 2019 - Chronotype and Social Jetlag
-- - Borbély, A. A. (1982) - Two process model of sleep regulation
-- =========================================================

BEGIN;

-- 1. New columns on profiles table for calculated parameters
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS sleep_need_method VARCHAR(30) DEFAULT 'mctq_corrected',
ADD COLUMN IF NOT EXISTS sleep_need_confidence VARCHAR(10) DEFAULT 'low',
ADD COLUMN IF NOT EXISTS sleep_need_based_on_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sleep_need_last_calculated TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sd_workday_hours NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS sd_freeday_hours NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS baseline_sleep_need NUMERIC(4,2) DEFAULT 8.25,
ADD COLUMN IF NOT EXISTS social_jetlag_hours NUMERIC(4,2);

COMMENT ON COLUMN profiles.sleep_need_method IS 'Method used: mctq_corrected, rise_percentile, satiation_point, manual, default';
COMMENT ON COLUMN profiles.sleep_need_confidence IS 'Calculation confidence: low, medium, high';
COMMENT ON COLUMN profiles.sleep_need_based_on_days IS 'Number of days used in last calculation';
COMMENT ON COLUMN profiles.sleep_need_last_calculated IS 'Timestamp of last sleep need calculation';
COMMENT ON COLUMN profiles.sd_workday_hours IS 'Average sleep on workdays (SD_W)';
COMMENT ON COLUMN profiles.sd_freeday_hours IS 'Average sleep on free days (SD_F)';
COMMENT ON COLUMN profiles.baseline_sleep_need IS 'Calculated baseline need (without dynamic adjustments)';
COMMENT ON COLUMN profiles.social_jetlag_hours IS 'Calculated Social Jetlag (|MSF - MSW|)';

-- 2. Sleep need calculations history table
CREATE TABLE IF NOT EXISTS sleep_need_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    method VARCHAR(30) NOT NULL,
    calculated_need NUMERIC(4,2) NOT NULL,
    confidence VARCHAR(10) NOT NULL,
    based_on_days INTEGER NOT NULL,
    -- MCTQ parameters
    sd_workday NUMERIC(4,2),
    sd_freeday NUMERIC(4,2),
    sd_week NUMERIC(4,2),
    social_jetlag_hours NUMERIC(4,2),
    -- Mid-sleep times (stored as time of day)
    mid_sleep_workday TIME,
    mid_sleep_freeday TIME,
    mid_sleep_corrected TIME,
    -- Metadata
    workdays_count INTEGER,
    freedays_count INTEGER,
    data_start_date DATE,
    data_end_date DATE
);

COMMENT ON TABLE sleep_need_calculations IS 'History of sleep need calculations with MCTQ parameters';

CREATE INDEX IF NOT EXISTS idx_sleep_need_calc_user
ON sleep_need_calculations(user_id, calculated_at DESC);

-- 3. Daily sleep need cache (WHOOP-style decomposition)
CREATE TABLE IF NOT EXISTS daily_sleep_need (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Need decomposition (WHOOP-style)
    baseline_need NUMERIC(4,2) NOT NULL,
    strain_addition NUMERIC(4,2) DEFAULT 0,
    debt_addition NUMERIC(4,2) DEFAULT 0,
    nap_subtraction NUMERIC(4,2) DEFAULT 0,
    total_need NUMERIC(4,2) NOT NULL,
    -- Context
    training_load_score NUMERIC(5,2),
    current_debt_hours NUMERIC(4,2),
    nap_minutes INTEGER DEFAULT 0,
    recovery_score_yesterday INTEGER,
    UNIQUE(user_id, target_date)
);

COMMENT ON TABLE daily_sleep_need IS 'Daily sleep need cache with WHOOP-style decomposition';

CREATE INDEX IF NOT EXISTS idx_daily_sleep_need_lookup
ON daily_sleep_need(user_id, target_date DESC);

-- 4. Day classification cache (workday/freeday)
CREATE TABLE IF NOT EXISTS day_classification_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    classified_as VARCHAR(10) NOT NULL CHECK (classified_as IN ('workday', 'freeday')),
    mean_wake_hour NUMERIC(5,2),
    variance_minutes NUMERIC(6,2),
    sample_count INTEGER,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, day_of_week)
);

COMMENT ON TABLE day_classification_cache IS 'Automatic weekday classification cache';
COMMENT ON COLUMN day_classification_cache.day_of_week IS '0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat';

CREATE INDEX IF NOT EXISTS idx_day_classification_user
ON day_classification_cache(user_id);

-- 5. Helper function for mid-sleep calculation
CREATE OR REPLACE FUNCTION calculate_mid_sleep(
    sleep_start_ts BIGINT,
    sleep_end_ts BIGINT
) RETURNS TIME AS $$
DECLARE
    mid_ts BIGINT;
    mid_time TIMESTAMP WITH TIME ZONE;
BEGIN
    IF sleep_start_ts IS NULL OR sleep_end_ts IS NULL THEN
        RETURN NULL;
    END IF;

    mid_ts := sleep_start_ts + (sleep_end_ts - sleep_start_ts) / 2;
    mid_time := TO_TIMESTAMP(mid_ts / 1000.0);

    RETURN mid_time::TIME;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_mid_sleep IS 'Calculates mid-sleep point from timestamps (milliseconds)';

-- 6. View for MCTQ analysis
CREATE OR REPLACE VIEW v_mctq_analysis AS
SELECT
    se.user_id,
    se.entry_date AS date,
    EXTRACT(DOW FROM se.entry_date) AS day_of_week,
    CASE
        WHEN dcc.classified_as IS NOT NULL THEN dcc.classified_as
        WHEN EXTRACT(DOW FROM se.entry_date) IN (0, 6) THEN 'freeday'
        ELSE 'workday'
    END AS day_type,
    -- Total Sleep Time (hours)
    se.duration_in_seconds / 3600.0 AS tst_hours,
    -- Mid-sleep from bedtime/wake_time
    CASE
        WHEN se.bedtime IS NOT NULL AND se.wake_time IS NOT NULL THEN
            (se.bedtime + (se.wake_time - se.bedtime) / 2)::TIME
        ELSE NULL
    END AS mid_sleep,
    -- Bedtime and wake time
    se.bedtime,
    se.wake_time,
    -- Wake hour (decimal)
    CASE
        WHEN se.wake_time IS NOT NULL THEN
            EXTRACT(HOUR FROM se.wake_time) + EXTRACT(MINUTE FROM se.wake_time) / 60.0
        ELSE NULL
    END AS wake_hour
FROM sleep_entries se
LEFT JOIN day_classification_cache dcc
    ON se.user_id = dcc.user_id
    AND EXTRACT(DOW FROM se.entry_date) = dcc.day_of_week
WHERE se.bedtime IS NOT NULL
  AND se.wake_time IS NOT NULL
  AND se.duration_in_seconds > 0;

COMMENT ON VIEW v_mctq_analysis IS 'View for MCTQ analysis with day classification and TST';

-- 7. View for MCTQ stats per user
CREATE OR REPLACE VIEW v_mctq_stats AS
WITH recent_data AS (
    SELECT
        user_id,
        day_type,
        tst_hours,
        mid_sleep,
        wake_hour
    FROM v_mctq_analysis
    WHERE date >= CURRENT_DATE - INTERVAL '90 days'
      AND tst_hours IS NOT NULL
      AND tst_hours BETWEEN 3 AND 14
),
workday_stats AS (
    SELECT
        user_id,
        AVG(tst_hours) AS sd_workday,
        AVG(EXTRACT(HOUR FROM mid_sleep) + EXTRACT(MINUTE FROM mid_sleep) / 60.0) AS msw_hour,
        COUNT(*) AS workday_count
    FROM recent_data
    WHERE day_type = 'workday'
    GROUP BY user_id
),
freeday_stats AS (
    SELECT
        user_id,
        AVG(tst_hours) AS sd_freeday,
        AVG(EXTRACT(HOUR FROM mid_sleep) + EXTRACT(MINUTE FROM mid_sleep) / 60.0) AS msf_hour,
        COUNT(*) AS freeday_count
    FROM recent_data
    WHERE day_type = 'freeday'
    GROUP BY user_id
)
SELECT
    COALESCE(w.user_id, f.user_id) AS user_id,
    ROUND(w.sd_workday::NUMERIC, 2) AS sd_workday,
    ROUND(f.sd_freeday::NUMERIC, 2) AS sd_freeday,
    -- SD_week = (5 × SD_W + 2 × SD_F) / 7
    ROUND(((5 * COALESCE(w.sd_workday, 7) + 2 * COALESCE(f.sd_freeday, 8)) / 7)::NUMERIC, 2) AS sd_week,
    -- SN_ideal = SD_F - (SD_F - SD_week) / 2 (when SD_F > SD_W)
    CASE
        WHEN f.sd_freeday > w.sd_workday THEN
            ROUND((f.sd_freeday - (f.sd_freeday - ((5 * w.sd_workday + 2 * f.sd_freeday) / 7)) / 2)::NUMERIC, 2)
        ELSE
            ROUND(((5 * COALESCE(w.sd_workday, 7) + 2 * COALESCE(f.sd_freeday, 8)) / 7)::NUMERIC, 2)
    END AS sleep_need_ideal,
    -- Social Jetlag = |MSF - MSW|
    ROUND(ABS(COALESCE(f.msf_hour, 4) - COALESCE(w.msw_hour, 3))::NUMERIC, 2) AS social_jetlag_hours,
    w.workday_count,
    f.freeday_count,
    -- Confidence
    CASE
        WHEN COALESCE(w.workday_count, 0) >= 40 AND COALESCE(f.freeday_count, 0) >= 16 THEN 'high'
        WHEN COALESCE(w.workday_count, 0) >= 20 AND COALESCE(f.freeday_count, 0) >= 8 THEN 'medium'
        ELSE 'low'
    END AS confidence
FROM workday_stats w
FULL OUTER JOIN freeday_stats f ON w.user_id = f.user_id;

COMMENT ON VIEW v_mctq_stats IS 'Aggregated MCTQ stats per user with ideal Sleep Need calculation';

COMMIT;
