-- Migration to fix sleep entry_date to align with wake_up_date
-- Simple version: shift all entry dates by +1 day because they were previously
-- based on the Start Date, and we want them on the End Date (Wake-up Date).

UPDATE sleep_entries
SET entry_date = entry_date + 1;
