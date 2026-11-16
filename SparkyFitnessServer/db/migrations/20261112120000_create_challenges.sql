-- Migration: Challenges and group leaderboards
-- Date: 2026-11-12
-- Re-runnable: every statement is guarded.
--
-- Joining a challenge is the consent. Members never read each other's diary:
-- the server scores each member from their own data (read through that
-- member's RLS context) and writes the results into these challenge-owned
-- tables, which members of the challenge can read. Only the server writes
-- them; the app role has read policies only (see rls_policies.sql).

CREATE TABLE IF NOT EXISTS public.challenges (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    -- The host. Null only for the moment between an account deletion and the
    -- nightly job handing the challenge to the longest-standing member.
    owner_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(500),
    emoji VARCHAR(16),
    -- Preset the challenge started from, for display only.
    template VARCHAR(40),
    -- The current rules (shared challengeRulesSchema); the rules in force on a
    -- day come from challenge_rule_changes.
    rules JSONB NOT NULL,
    rules_version SMALLINT NOT NULL DEFAULT 1,
    -- Days are each member's own calendar days; the time zone decides when a
    -- period is over and can be finalised.
    start_date DATE NOT NULL,
    end_date DATE,
    time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    member_limit SMALLINT NOT NULL DEFAULT 50,
    late_join BOOLEAN NOT NULL DEFAULT TRUE,
    -- sha256 of the invite code; the code itself is shown to the host once.
    invite_code_hash VARCHAR(64),
    invite_expires_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_challenges_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_challenges_length CHECK (end_date IS NULL OR end_date - start_date < 365),
    CONSTRAINT chk_challenges_member_limit CHECK (member_limit BETWEEN 2 AND 200),
    CONSTRAINT chk_challenges_name CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_invite_code_hash
    ON public.challenges(invite_code_hash)
    WHERE invite_code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_owner
    ON public.challenges(owner_user_id);

CREATE TABLE IF NOT EXISTS public.challenge_members (
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member',
    -- What other members see; never the email.
    display_name VARCHAR(40) NOT NULL,
    goal_type VARCHAR(20) NOT NULL DEFAULT 'stay_active',
    share_routes BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id),
    CONSTRAINT chk_challenge_members_role CHECK (role IN ('host', 'member')),
    CONSTRAINT chk_challenge_members_goal_type CHECK (
        goal_type IN ('lose_weight', 'build_muscle', 'endurance', 'stay_active')
    ),
    CONSTRAINT chk_challenge_members_display_name CHECK (btrim(display_name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_challenge_members_user
    ON public.challenge_members(user_id);

-- One host per challenge.
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_members_one_host
    ON public.challenge_members(challenge_id)
    WHERE role = 'host';

CREATE TABLE IF NOT EXISTS public.challenge_daily_scores (
    challenge_id UUID NOT NULL,
    user_id UUID NOT NULL,
    day DATE NOT NULL,
    -- The day's value in the challenge's metric (points, steps, metres...).
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- Points parts (zero for other metrics).
    effort DOUBLE PRECISION NOT NULL DEFAULT 0,
    step_points DOUBLE PRECISION NOT NULL DEFAULT 0,
    pr_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
    streak_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
    beat_average_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
    minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
    steps INTEGER NOT NULL DEFAULT 0,
    workouts SMALLINT NOT NULL DEFAULT 0,
    eligible BOOLEAN NOT NULL DEFAULT TRUE,
    -- PRs and the per-workout rate breakdown, for "how did I get these points".
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id, day),
    -- Leaving a challenge removes the member's scores in it.
    FOREIGN KEY (challenge_id, user_id)
        REFERENCES public.challenge_members(challenge_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.challenge_activity_cards (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    challenge_id UUID NOT NULL,
    user_id UUID NOT NULL,
    -- Deleting the workout removes its card.
    exercise_entry_id UUID NOT NULL REFERENCES public.exercise_entries(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    activity_type VARCHAR(30) NOT NULL,
    name VARCHAR(255),
    minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
    distance_meters DOUBLE PRECISION,
    pace_seconds_per_km DOUBLE PRECISION,
    avg_heart_rate SMALLINT,
    max_heart_rate SMALLINT,
    points DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT challenge_activity_cards_entry_key UNIQUE (challenge_id, exercise_entry_id),
    FOREIGN KEY (challenge_id, user_id)
        REFERENCES public.challenge_members(challenge_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_challenge_activity_cards_challenge_day
    ON public.challenge_activity_cards(challenge_id, day);
CREATE INDEX IF NOT EXISTS idx_challenge_activity_cards_entry
    ON public.challenge_activity_cards(exercise_entry_id);

-- A finished period, frozen: one row per member. A frozen row is never
-- rewritten. Kept when a member leaves (a past week's result stands); removed
-- with the member's account.
CREATE TABLE IF NOT EXISTS public.challenge_results (
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    display_name VARCHAR(40) NOT NULL,
    rank SMALLINT NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_winner BOOLEAN NOT NULL DEFAULT FALSE,
    reached_on DATE,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (challenge_id, period_start, user_id),
    CONSTRAINT chk_challenge_results_period CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_challenge_results_user
    ON public.challenge_results(user_id);

-- Every rules change, visible to all members, so nobody can move the
-- goalposts unseen. A day is scored by the latest change effective on or
-- before it. "Latest" is seq, taken when the row is inserted, after the
-- update has locked the challenge row; created_at (transaction start) can be
-- out of order between two overlapping changes.
CREATE TABLE IF NOT EXISTS public.challenge_rule_changes (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    effective_from DATE NOT NULL,
    rules JSONB NOT NULL,
    previous_rules JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_rule_changes_challenge
    ON public.challenge_rule_changes(challenge_id, effective_from, seq);

-- Member-days waiting to be scored again. Filled by the trigger below; the
-- score job takes a day once it has been quiet for a short while, so a burst of
-- edits is scored once. The primary key collapses repeats. Taking a day pushes
-- queued_at into the future as a lease; the row is deleted only after the
-- scores are saved, so a worker that dies mid-run leaves the day queued.
CREATE TABLE IF NOT EXISTS public.challenge_score_queue (
    challenge_id UUID NOT NULL,
    user_id UUID NOT NULL,
    day DATE NOT NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id, day),
    FOREIGN KEY (challenge_id, user_id)
        REFERENCES public.challenge_members(challenge_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_challenge_score_queue_queued_at
    ON public.challenge_score_queue(queued_at);

-- Queues one member-day for every running challenge that person is in and
-- whose dates hold the day. The trigger functions below call it, so every
-- writer (the diary, provider syncs, imports, the AI tools) is covered without
-- calling anything. It runs as its caller (SECURITY INVOKER): the trigger
-- functions are SECURITY DEFINER because the queue is closed to the app role,
-- and they read only the changed row owner's own memberships, while a direct
-- call by the app role is refused by the queue's permissions.
CREATE OR REPLACE FUNCTION public.queue_challenge_member_day(p_user_id UUID, p_day DATE)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.challenge_score_queue (challenge_id, user_id, day)
  SELECT m.challenge_id, m.user_id, p_day
    FROM public.challenge_members m
    JOIN public.challenges c ON c.id = m.challenge_id
   WHERE m.user_id = p_user_id
     AND c.ended_at IS NULL
     AND p_day >= c.start_date
     AND (c.end_date IS NULL OR p_day <= c.end_date)
  ON CONFLICT (challenge_id, user_id, day)
    DO UPDATE SET queued_at = EXCLUDED.queued_at;
END;
$$;

-- A row added, changed, moved or removed: its old and new day. Used for
-- workouts (exercise_entries), a session being finished, reopened or given
-- another source (exercise_preset_entries, which turns a planned workout into
-- a logged one) and steps (check_in_measurements, daily_health_metrics).
CREATE OR REPLACE FUNCTION public.queue_challenge_scores() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.queue_challenge_member_day(OLD.user_id, OLD.entry_date);
  END IF;
  IF TG_OP <> 'DELETE' AND (
    TG_OP = 'INSERT'
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
  ) THEN
    PERFORM public.queue_challenge_member_day(NEW.user_id, NEW.entry_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS queue_challenge_scores ON public.exercise_entries;
CREATE TRIGGER queue_challenge_scores
    AFTER INSERT OR UPDATE OR DELETE ON public.exercise_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores ON public.exercise_preset_entries;
CREATE TRIGGER queue_challenge_scores
    AFTER UPDATE OF finished_at, source ON public.exercise_preset_entries
    FOR EACH ROW
    WHEN (OLD.finished_at IS DISTINCT FROM NEW.finished_at
          OR OLD.source IS DISTINCT FROM NEW.source)
    EXECUTE FUNCTION public.queue_challenge_scores();

-- A set checked off, un-checked, started, or moved to another workout: a
-- planned workout counts from its first started or checked-off set. Sets carry
-- no owner or day, so both come from the entry. Statement-level with
-- transition tables, so an import or a session save that writes many sets
-- queues each member-day once, not once per set.
CREATE OR REPLACE FUNCTION public.queue_challenge_scores_for_sets() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR changed IN
      SELECT DISTINCT e.user_id, e.entry_date
        FROM new_sets n
        JOIN public.exercise_entries e ON e.id = n.exercise_entry_id
       WHERE n.completed_at IS NOT NULL OR n.started_at IS NOT NULL
    LOOP
      PERFORM public.queue_challenge_member_day(changed.user_id, changed.entry_date);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    -- A set removed with its entry finds no entry: the entry's own trigger
    -- queued the day.
    FOR changed IN
      SELECT DISTINCT e.user_id, e.entry_date
        FROM old_sets o
        JOIN public.exercise_entries e ON e.id = o.exercise_entry_id
       WHERE o.completed_at IS NOT NULL OR o.started_at IS NOT NULL
    LOOP
      PERFORM public.queue_challenge_member_day(changed.user_id, changed.entry_date);
    END LOOP;
  ELSE
    FOR changed IN
      SELECT DISTINCT e.user_id, e.entry_date
        FROM new_sets n
        JOIN old_sets o ON o.id = n.id
        JOIN public.exercise_entries e
          ON e.id IN (n.exercise_entry_id, o.exercise_entry_id)
       WHERE n.completed_at IS DISTINCT FROM o.completed_at
          OR n.started_at IS DISTINCT FROM o.started_at
          OR n.exercise_entry_id IS DISTINCT FROM o.exercise_entry_id
    LOOP
      PERFORM public.queue_challenge_member_day(changed.user_id, changed.entry_date);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS queue_challenge_scores_insert ON public.exercise_entry_sets;
CREATE TRIGGER queue_challenge_scores_insert
    AFTER INSERT ON public.exercise_entry_sets
    REFERENCING NEW TABLE AS new_sets
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.queue_challenge_scores_for_sets();

DROP TRIGGER IF EXISTS queue_challenge_scores_update ON public.exercise_entry_sets;
CREATE TRIGGER queue_challenge_scores_update
    AFTER UPDATE ON public.exercise_entry_sets
    REFERENCING OLD TABLE AS old_sets NEW TABLE AS new_sets
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.queue_challenge_scores_for_sets();

DROP TRIGGER IF EXISTS queue_challenge_scores_delete ON public.exercise_entry_sets;
CREATE TRIGGER queue_challenge_scores_delete
    AFTER DELETE ON public.exercise_entry_sets
    REFERENCING OLD TABLE AS old_sets
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.queue_challenge_scores_for_sets();

-- Steps: a check-in (steps) or a synced daily summary (total_steps) that
-- adds, changes or removes a step count queues its day, so a steps challenge
-- moves during the day rather than at the nightly catch-up. The WHEN clauses
-- keep every other write (a weight-only check-in, a summary whose steps did
-- not change) from calling anything.
DROP TRIGGER IF EXISTS queue_challenge_scores_insert ON public.check_in_measurements;
CREATE TRIGGER queue_challenge_scores_insert
    AFTER INSERT ON public.check_in_measurements
    FOR EACH ROW WHEN (NEW.steps IS NOT NULL)
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores_update ON public.check_in_measurements;
CREATE TRIGGER queue_challenge_scores_update
    AFTER UPDATE ON public.check_in_measurements
    FOR EACH ROW WHEN (OLD.steps IS DISTINCT FROM NEW.steps
                       OR ((OLD.steps IS NOT NULL OR NEW.steps IS NOT NULL)
                           AND (OLD.entry_date IS DISTINCT FROM NEW.entry_date
                                OR OLD.user_id IS DISTINCT FROM NEW.user_id)))
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores_delete ON public.check_in_measurements;
CREATE TRIGGER queue_challenge_scores_delete
    AFTER DELETE ON public.check_in_measurements
    FOR EACH ROW WHEN (OLD.steps IS NOT NULL)
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores_insert ON public.daily_health_metrics;
CREATE TRIGGER queue_challenge_scores_insert
    AFTER INSERT ON public.daily_health_metrics
    FOR EACH ROW WHEN (NEW.total_steps IS NOT NULL)
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores_update ON public.daily_health_metrics;
CREATE TRIGGER queue_challenge_scores_update
    AFTER UPDATE ON public.daily_health_metrics
    FOR EACH ROW WHEN (OLD.total_steps IS DISTINCT FROM NEW.total_steps
                       OR ((OLD.total_steps IS NOT NULL OR NEW.total_steps IS NOT NULL)
                           AND (OLD.entry_date IS DISTINCT FROM NEW.entry_date
                                OR OLD.user_id IS DISTINCT FROM NEW.user_id)))
    EXECUTE FUNCTION public.queue_challenge_scores();

DROP TRIGGER IF EXISTS queue_challenge_scores_delete ON public.daily_health_metrics;
CREATE TRIGGER queue_challenge_scores_delete
    AFTER DELETE ON public.daily_health_metrics
    FOR EACH ROW WHEN (OLD.total_steps IS NOT NULL)
    EXECUTE FUNCTION public.queue_challenge_scores();

-- Admin switch: Challenges is on by default; an admin can turn it off, which
-- refuses the challenge routes and pauses the challenge jobs.
ALTER TABLE public.global_settings
    ADD COLUMN IF NOT EXISTS enable_challenges BOOLEAN NOT NULL DEFAULT TRUE;
