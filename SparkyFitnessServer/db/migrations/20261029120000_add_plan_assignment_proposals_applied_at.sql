-- Migration: Add proposals_applied_at to workout_plan_template_assignments
-- Description: When the AI assistant applies planned-weight proposals to an
-- assignment, the time is stored here so later proposals for that assignment
-- only count sessions and feedback logged after it, without touching the
-- evidence of the plan's other assignments.
-- Date: 2026-10-29


ALTER TABLE public.workout_plan_template_assignments
ADD COLUMN IF NOT EXISTS proposals_applied_at timestamp with time zone;
