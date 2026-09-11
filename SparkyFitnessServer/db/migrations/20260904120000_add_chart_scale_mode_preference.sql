ALTER TABLE public.user_preferences
  ADD COLUMN chart_scale_mode TEXT NOT NULL DEFAULT 'time',
  ADD CONSTRAINT user_preferences_chart_scale_mode_check
    CHECK (chart_scale_mode IN ('time', 'point'));

COMMENT ON COLUMN public.user_preferences.chart_scale_mode IS
  'Date-axis layout for report charts: time (continuous, gaps preserved) or point (categorical, entries evenly spaced).';
