DELETE FROM custom_measurements
WHERE category_id IN (
    SELECT id
    FROM custom_categories
    WHERE name = 'Raw Stress Data'
);
