export function getImageSourceSignature(
  source: { uri: string; headers: Record<string, string> } | null,
): string {
  if (!source) return '';

  const headerSignature = Object.entries(source.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${source.uri}|${headerSignature}`;
}
