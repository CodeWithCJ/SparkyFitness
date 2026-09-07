type TranslationOptions = Record<string, unknown>;

export const translateForTest = (
  key: string,
  defaultValueOrOptions?: string | TranslationOptions,
  values?: TranslationOptions
): string => {
  const options =
    typeof defaultValueOrOptions === 'string' ? values : defaultValueOrOptions;
  const defaultValue =
    typeof defaultValueOrOptions === 'string'
      ? defaultValueOrOptions
      : options?.['defaultValue'];
  const count = options?.['count'];
  const singularDefault = options?.['defaultValue_one'];
  const pluralDefault = options?.['defaultValue_other'];
  const template =
    count === 1 && typeof singularDefault === 'string'
      ? singularDefault
      : count !== undefined && count !== 1 && typeof pluralDefault === 'string'
        ? pluralDefault
        : defaultValue;

  if (typeof template !== 'string') return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(options?.[name] ?? `{{${name}}}`)
  );
};

export const useTranslation = () => ({ t: translateForTest });
