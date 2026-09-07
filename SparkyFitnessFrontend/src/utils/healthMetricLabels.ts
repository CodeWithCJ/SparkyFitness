type Translate = (key: string, defaultValue: string) => string;

export const healthMetricKey = (name: string): string => {
  const normalized = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return normalized.replace(/_([a-z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );
};

export const healthMetricLabel = (
  name: string,
  displayName: string | null | undefined,
  t: Translate
): string => {
  const explicitDisplayName = displayName?.trim();
  if (explicitDisplayName) return explicitDisplayName;

  return t(`healthMetrics.${healthMetricKey(name)}`, name.replace(/_/g, ' '));
};

export const healthMetricUnitLabel = (unit: string, t: Translate): string => {
  const key = healthMetricKey(unit.replace('%', 'percent'));
  return t(`healthUnits.${key}`, unit);
};
