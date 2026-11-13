import type { SymptomCustomFieldDef } from './constants.ts';

/**
 * Checks the values of a symptom's custom fields against the definition's
 * declared fields. Only declared keys are checked; keys the definition does not
 * declare are left alone so older clients and imports keep working. Returns one
 * message per problem, empty when the values are valid.
 */
export function validateCustomFieldValues(
  defs: SymptomCustomFieldDef[] | null | undefined,
  values: Record<string, unknown> | null | undefined
): string[] {
  const problems: string[] = [];
  if (!defs || !values) return problems;

  for (const def of defs) {
    const value = values[def.key];
    if (value === undefined || value === null || value === '') continue;

    switch (def.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          problems.push(`${def.label} must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          problems.push(`${def.label} must be yes or no`);
        }
        break;
      case 'text':
        if (typeof value !== 'string') {
          problems.push(`${def.label} must be text`);
        }
        break;
      case 'select':
        if (
          typeof value !== 'string' ||
          (def.options && !def.options.includes(value))
        ) {
          problems.push(`${def.label} must be one of the listed options`);
        }
        break;
      case 'multiselect':
        if (
          !Array.isArray(value) ||
          value.some(
            (v) =>
              typeof v !== 'string' || (def.options && !def.options.includes(v))
          )
        ) {
          problems.push(`${def.label} must only contain listed options`);
        }
        break;
    }
  }
  return problems;
}
