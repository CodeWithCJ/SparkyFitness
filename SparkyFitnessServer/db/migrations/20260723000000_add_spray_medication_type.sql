-- Add "Nasal Spray" as a distinct medication form (GitHub issue #1763)
INSERT INTO medication_types (id, display_name, is_injectable, counting_unit_default, sort_order)
VALUES ('nasal_spray', 'Nasal Spray', FALSE, 'sprays', 85)
ON CONFLICT (id) DO NOTHING;
