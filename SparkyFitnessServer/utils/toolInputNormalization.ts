import { z } from 'zod';

/** Drop only nulls rejected by the published schema. Nullable fields carry
 * deliberate clears, and unknown nutrition must remain null rather than zero. */
export function normalizeToolInput(value: unknown, schema: z.ZodType): unknown {
  const retainNullable = (raw: unknown, parsed: unknown): unknown => {
    if (Array.isArray(raw))
      return raw.map((row, index) =>
        retainNullable(row, Array.isArray(parsed) ? parsed[index] : undefined)
      );
    if (!raw || typeof raw !== 'object') return raw;
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(raw)) {
      const accepted =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)[key]
          : undefined;
      // Coercing number schemas accept null as 0. A model's absent amount
      // must stay omitted so the strict action handler can require it.
      if (item !== null || accepted === null)
        normalized[key] = retainNullable(item, accepted);
    }
    return normalized;
  };
  let result = value;
  for (let pass = 0; pass < 8; pass++) {
    const parsed = schema.safeParse(result);
    if (parsed.success) return retainNullable(result, parsed.data);
    let changed = false;
    const visit = (issues: readonly z.core.$ZodIssue[]) => {
      for (const issue of issues) {
        if (issue.code === 'invalid_union') visit(issue.errors.flat());
        if (issue.code !== 'invalid_type' || !issue.path.length) continue;
        const parentPath = issue.path.slice(0, -1);
        const parent = parentPath.reduce<unknown>(
          (current, key) =>
            current && typeof current === 'object'
              ? (current as Record<PropertyKey, unknown>)[key]
              : undefined,
          result
        );
        const key = issue.path.at(-1)!;
        if (
          parent &&
          typeof parent === 'object' &&
          !Array.isArray(parent) &&
          (parent as Record<PropertyKey, unknown>)[key] === null
        ) {
          // Clone once per pass so request evidence and caller objects stay intact.
          if (!changed) result = structuredClone(result);
          const target = parentPath.reduce<unknown>(
            (current, segment) =>
              (current as Record<PropertyKey, unknown>)[segment],
            result
          );
          delete (target as Record<PropertyKey, unknown>)[key];
          changed = true;
        }
      }
    };
    visit(parsed.error.issues);
    if (!changed) return result;
  }
  return result;
}
