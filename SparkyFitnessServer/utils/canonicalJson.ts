export function canonicalJson(value: unknown, legacyOrder = false): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item, legacyOrder)).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) =>
        legacyOrder ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0
      )
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v, legacyOrder)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
