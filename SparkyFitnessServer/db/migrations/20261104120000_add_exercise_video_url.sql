-- A demonstration video per exercise (roadmap #7, exercise guidance): any
-- http(s) link, usually a short YouTube clip. Web and mobile show YouTube
-- links as an embed or a tappable preview. Lives on the library row only;
-- diary snapshots don't copy it, so clients read it from the exercise.
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_video_url_check'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_video_url_check
      CHECK (
        video_url IS NULL
        OR (video_url ~* '^https?://' AND char_length(video_url) <= 2048)
      );
  END IF;
END $$;
