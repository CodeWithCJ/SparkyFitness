-- Bring the mood scores the chatbot stored on the wrong scale onto the 10-100
-- one the column carries.
--
-- `mood_entries.mood_value` is a 10-100 intensity, read through the shared band
-- model (sad up to 15, angry up to 25, ... excited up to 100). The chatbot's
-- `log_mood`, which the MCP server shares, validates a 1-10 score and until
-- #2508 stored it unconverted: "8 out of 10" was written as 8, so every mood
-- logged through chat read back as Sad. #2508 converts on write and on read;
-- this corrects the rows written before it. It has to ship with that change:
-- once reads convert, an unconverted row reads back in chat as 1/10, and a web
-- or mobile re-save of it is clamped to 10, after which it can no longer be
-- told apart from a real Sad.
--
-- Only 1-7 and 9 are converted, multiplied by 10 as `chatScoreToMoodValue`
-- does. Nothing else has written them: the web picker and the CSV import floor
-- at 10, Garmin only writes 15, 25 ... 95, neither app has ever sent the
-- end-of-fast mood, and the web slider that had no minimum (Aug-Nov 2025) moved
-- in steps of 10, so it could write 0 but never 1-9.
--
-- 8 and 10 are left alone because each has a second source. 8 is the Sad band
-- midpoint the web check-in sent before #2495 and the mobile one sent from #2820
-- until #2508; 10 is Sad at the slider's minimum. Left as they are they read as
-- Sad, which is visibly odd when wrong and fixed by re-entering the day;
-- converted the wrong way they would be confidently wrong with nothing left to
-- tell them apart. 0 is left as written too: it is outside the scale, but it is
-- not a chatbot score.
--
-- Safe to replay: everything it writes is 10 or more, and with #2508 in place no
-- writer can store 1-9 any more. `updated_at` moves with the row through the
-- table's set_timestamp trigger.

UPDATE public.mood_entries
SET mood_value = mood_value * 10
WHERE mood_value BETWEEN 1 AND 9
  AND mood_value <> 8;
