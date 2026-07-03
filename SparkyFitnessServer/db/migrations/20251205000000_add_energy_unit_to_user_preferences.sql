ALTER TABLE user_preferences
ADD COLUMN energy_unit VARCHAR(4) DEFAULT 'kcal' NOT NULL,
ADD CONSTRAINT check_energy_unit CHECK (energy_unit IN ('kcal', 'kJ'));
