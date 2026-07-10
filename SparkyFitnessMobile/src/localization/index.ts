import { ar, type MobileTranslationKey } from './ar';

export const MOBILE_LANGUAGE = 'ar' as const;
export const MOBILE_LOCALE = 'ar-SA' as const;
export const isMobileRtl = true;

type TranslationParams = Readonly<Record<string, string | number>>;

export function mobileT(
  key: MobileTranslationKey | (string & {}),
  params?: TranslationParams,
  fallback?: string,
): string {
  const template = ar[key as MobileTranslationKey] ?? fallback ?? key;

  if (!params) return template;

  return template.replace(/{{(\w+)}}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}
