ALTER TABLE public.user_preferences
  ADD COLUMN measurement_decimal_places integer NOT NULL DEFAULT 0;
