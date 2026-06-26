-- Preserve logged dose/injection history when a medication is deleted, mirroring how food_entries
-- survive deletion of their food. medication_entries and injection_entries already snapshot the
-- relevant fields (med name/dose/unit, site/dose_mg), so we null the medication link on delete
-- instead of cascading the history away. (symptom_entries already uses ON DELETE SET NULL.)
-- Config tables (schedules, pens, titration steps) intentionally keep ON DELETE CASCADE.

ALTER TABLE medication_entries ALTER COLUMN medication_id DROP NOT NULL;
ALTER TABLE medication_entries
  DROP CONSTRAINT IF EXISTS medication_entries_medication_id_fkey;
ALTER TABLE medication_entries
  ADD CONSTRAINT medication_entries_medication_id_fkey
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL;

ALTER TABLE injection_entries ALTER COLUMN medication_id DROP NOT NULL;
ALTER TABLE injection_entries
  DROP CONSTRAINT IF EXISTS injection_entries_medication_id_fkey;
ALTER TABLE injection_entries
  ADD CONSTRAINT injection_entries_medication_id_fkey
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL;
