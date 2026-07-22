-- Supplement dose-forms offered by the supplement dialog's "Form" select. Because
-- medications.type_id is a foreign key to medication_types, softgel/gummy/powder must
-- exist as lookup rows or saving a supplement in one of those forms fails the FK.
-- tablet/capsule/liquid are already seeded by 20260624000000. Idempotent.
INSERT INTO medication_types (id, display_name, is_injectable, counting_unit_default, sort_order) VALUES
    ('softgel', 'Softgel', FALSE, 'softgels', 35),
    ('gummy',   'Gummy',   FALSE, 'gummies',  36),
    ('powder',  'Powder',  FALSE, 'servings', 37)
ON CONFLICT (id) DO NOTHING;
