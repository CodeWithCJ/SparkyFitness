export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
