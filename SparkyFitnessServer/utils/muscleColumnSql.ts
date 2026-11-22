/**
 * SQL test for an exercise muscle column (JSON text) that holds no muscles:
 * NULL, empty, `[]` or `null`, ignoring whitespace. Shared by the provider
 * imports that fill muscles only while a column is still empty (Hevy,
 * Liftosaur), so the check happens in the same statement as the write.
 */
export function emptyMuscleColumnSql(
  column: 'primary_muscles' | 'secondary_muscles'
): string {
  return `regexp_replace(COALESCE(${column}, ''), '\\s', '', 'g') IN ('', '[]', 'null')`;
}
