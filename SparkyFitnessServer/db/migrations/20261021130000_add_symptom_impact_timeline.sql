-- Impact updates during an episode: [{"at": "<iso>", "impact": "none|mild|moderate|severe"}].
-- `impact` stays the current value (the latest point) for existing clients.
ALTER TABLE public.symptom_entries
    ADD COLUMN IF NOT EXISTS impact_timeline JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Start the timeline of every existing episode at its recorded impact, the
-- same way an episode's severity timeline starts at its first reading.
UPDATE public.symptom_entries
   SET impact_timeline = jsonb_build_array(
         jsonb_build_object('at', started_at, 'impact', impact))
 WHERE impact IS NOT NULL
   AND started_at IS NOT NULL
   AND impact_timeline = '[]'::jsonb;
