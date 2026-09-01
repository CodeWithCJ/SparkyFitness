import type { TFunction } from 'i18next';

const keyFor = (name: string) =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

export const exerciseDisplayLabel = (
  name: string,
  t: TFunction,
  translateBuiltIn = true
): string =>
  translateBuiltIn ? t(`exerciseDisplayNames.${keyFor(name)}`, name) : name;

export const personalRecordLabel = (label: string, t: TFunction): string => {
  const match = label.match(/^(.*?)\s+Best$/i);
  if (!match?.[1]) return exerciseDisplayLabel(label, t);
  const distance = t(`exerciseDistances.${keyFor(match[1])}`, match[1]);
  return t('exerciseAnalytics.records.distanceBest', {
    defaultValue: '{{distance}} Best',
    distance,
  });
};
