ALTER TABLE public.workout_presets
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.workout_preset_exercises
  ADD COLUMN IF NOT EXISTS video_start_seconds integer,
  ADD COLUMN IF NOT EXISTS video_end_seconds integer;

ALTER TABLE public.workout_preset_exercises
  DROP CONSTRAINT IF EXISTS workout_preset_exercises_video_timing_check;

ALTER TABLE public.workout_preset_exercises
  ADD CONSTRAINT workout_preset_exercises_video_timing_check CHECK (
    (video_start_seconds IS NULL AND video_end_seconds IS NULL) OR
    (video_start_seconds IS NOT NULL AND video_end_seconds IS NOT NULL
      AND video_start_seconds >= 0 AND video_end_seconds > video_start_seconds)
  );
