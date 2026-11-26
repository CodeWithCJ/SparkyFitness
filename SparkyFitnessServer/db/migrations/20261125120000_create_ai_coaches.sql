-- Migration: AI coaches (#2013): the shared "About me" profile and check-in
-- schedule, the coaches a person switched on or created, and the messages
-- they sent. Owner-only. Re-runnable: constraints are dropped and re-added.

CREATE TABLE IF NOT EXISTS public.coach_profile (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  diet_type text,
  foods_avoid text,
  foods_prefer text,
  tone text,
  notes text,
  checkin_times time[] NOT NULL DEFAULT ARRAY['08:00','13:00','19:00']::time[],
  max_messages_per_day smallint NOT NULL DEFAULT 3,
  paused_until date,
  pause_reason text,
  last_checkin_at timestamptz,
  last_event_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Added after the table first shipped inside this migration: re-runnable.
ALTER TABLE public.coach_profile ADD COLUMN IF NOT EXISTS last_event_scan_at timestamptz;

ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_diet_type;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_diet_type
  CHECK (diet_type IS NULL OR diet_type IN ('omnivore','vegetarian','vegan','pescatarian','keto','halal','kosher','other'));
ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_tone;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_tone
  CHECK (tone IS NULL OR tone IN ('friendly','direct','encouraging','neutral'));
ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_pause_reason;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_pause_reason
  CHECK (pause_reason IS NULL OR pause_reason IN ('sick','travel','injury','other'));
ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_lengths;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_lengths
  CHECK (length(foods_avoid) <= 500 AND length(foods_prefer) <= 500 AND length(notes) <= 1000);
ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_times;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_times
  CHECK (cardinality(checkin_times) BETWEEN 1 AND 4);
ALTER TABLE public.coach_profile DROP CONSTRAINT IF EXISTS chk_coach_profile_max_messages;
ALTER TABLE public.coach_profile ADD CONSTRAINT chk_coach_profile_max_messages
  CHECK (max_messages_per_day BETWEEN 1 AND 5);

CREATE TABLE IF NOT EXISTS public.user_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  builtin_key text,
  name text,
  instructions text,
  tool_categories text[] NOT NULL DEFAULT '{}',
  mode text NOT NULL DEFAULT 'rules',
  rules jsonb NOT NULL DEFAULT '{"version":1,"rules":[]}'::jsonb,
  ai_rule text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Not dropped and re-added: coach_nudges' foreign key depends on it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_user_coaches_owner_id'
      AND conrelid = 'public.user_coaches'::regclass
  ) THEN
    ALTER TABLE public.user_coaches
      ADD CONSTRAINT uq_user_coaches_owner_id UNIQUE (user_id, id);
  END IF;
END $$;
ALTER TABLE public.user_coaches DROP CONSTRAINT IF EXISTS chk_user_coaches_builtin_key;
ALTER TABLE public.user_coaches ADD CONSTRAINT chk_user_coaches_builtin_key
  CHECK (builtin_key IS NULL OR builtin_key ~ '^[a-z][a-z0-9_]{0,39}$');
ALTER TABLE public.user_coaches DROP CONSTRAINT IF EXISTS chk_user_coaches_mode;
ALTER TABLE public.user_coaches ADD CONSTRAINT chk_user_coaches_mode
  CHECK (mode IN ('rules','ai_judge'));
ALTER TABLE public.user_coaches DROP CONSTRAINT IF EXISTS chk_user_coaches_kind;
ALTER TABLE public.user_coaches ADD CONSTRAINT chk_user_coaches_kind
  CHECK ((builtin_key IS NOT NULL AND name IS NULL AND mode = 'rules')
      OR (builtin_key IS NULL AND name IS NOT NULL));
ALTER TABLE public.user_coaches DROP CONSTRAINT IF EXISTS chk_user_coaches_ai_rule;
ALTER TABLE public.user_coaches ADD CONSTRAINT chk_user_coaches_ai_rule
  CHECK (mode <> 'ai_judge' OR ai_rule IS NOT NULL);
ALTER TABLE public.user_coaches DROP CONSTRAINT IF EXISTS chk_user_coaches_lengths;
ALTER TABLE public.user_coaches ADD CONSTRAINT chk_user_coaches_lengths
  CHECK ((name IS NULL OR length(name) BETWEEN 1 AND 40)
     AND (instructions IS NULL OR length(instructions) <= 1000)
     AND (ai_rule IS NULL OR length(ai_rule) <= 500));

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_coaches_builtin
  ON public.user_coaches (user_id, builtin_key) WHERE builtin_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_coaches_enabled
  ON public.user_coaches (user_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.coach_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  local_day date NOT NULL,
  checkin_slot time NOT NULL,
  rule_key text NOT NULL,
  because jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  template_key text,
  template_params jsonb,
  -- No foreign key: sparky_chat_history.id has no unique constraint.
  chat_message_id uuid NOT NULL,
  read_at timestamptz,
  -- What the message is: a gap, a win, or the morning outlook.
  kind text NOT NULL DEFAULT 'gap',
  -- 1 or -1: the person's thumb on the message.
  reaction smallint,
  reaction_at timestamptz,
  -- A change the coach proposes; nothing changes until the person applies it.
  suggestion jsonb,
  suggestion_status text,
  suggestion_resolved_at timestamptz,
  -- A quick question the coach asks, and the person's answer.
  question text,
  question_ref text,
  answer jsonb,
  answered_at timestamptz,
  -- One message per workout for the after-workout trigger.
  exercise_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'gap';
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS reaction smallint;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS reaction_at timestamptz;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS suggestion jsonb;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS suggestion_status text;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS suggestion_resolved_at timestamptz;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS question text;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS question_ref text;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS answer jsonb;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS answered_at timestamptz;
ALTER TABLE public.coach_nudges ADD COLUMN IF NOT EXISTS exercise_entry_id uuid;

ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS fk_coach_nudges_coach;
ALTER TABLE public.coach_nudges ADD CONSTRAINT fk_coach_nudges_coach
  FOREIGN KEY (user_id, coach_id) REFERENCES public.user_coaches (user_id, id) ON DELETE CASCADE;
ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS chk_coach_nudges_source;
ALTER TABLE public.coach_nudges ADD CONSTRAINT chk_coach_nudges_source
  CHECK (source IN ('ai','template','template_fallback'));
ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS uq_coach_nudges_daily;
ALTER TABLE public.coach_nudges ADD CONSTRAINT uq_coach_nudges_daily
  UNIQUE (user_id, coach_id, rule_key, local_day);

ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS chk_coach_nudges_kind;
ALTER TABLE public.coach_nudges ADD CONSTRAINT chk_coach_nudges_kind
  CHECK (kind IN ('gap','win','outlook'));
ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS chk_coach_nudges_reaction;
ALTER TABLE public.coach_nudges ADD CONSTRAINT chk_coach_nudges_reaction
  CHECK (reaction IS NULL OR reaction IN (-1, 1));
ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS chk_coach_nudges_suggestion;
ALTER TABLE public.coach_nudges ADD CONSTRAINT chk_coach_nudges_suggestion
  CHECK ((suggestion IS NULL) = (suggestion_status IS NULL)
     AND (suggestion_status IS NULL OR suggestion_status IN ('pending','applied','dismissed','expired')));
ALTER TABLE public.coach_nudges DROP CONSTRAINT IF EXISTS chk_coach_nudges_question;
ALTER TABLE public.coach_nudges ADD CONSTRAINT chk_coach_nudges_question
  CHECK (question IS NULL OR question IN ('energy','mood','focus','habit_done'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_nudges_entry
  ON public.coach_nudges (user_id, exercise_entry_id) WHERE exercise_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_nudges_reaction
  ON public.coach_nudges (user_id, coach_id, rule_key) WHERE reaction = -1;
CREATE INDEX IF NOT EXISTS idx_coach_nudges_unread
  ON public.coach_nudges (user_id, coach_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coach_nudges_user_day
  ON public.coach_nudges (user_id, local_day);
