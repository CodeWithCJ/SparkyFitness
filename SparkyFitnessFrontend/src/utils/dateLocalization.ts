import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { getHtmlLanguage } from '@/utils/localePolicy';

export const formatLocalizedDate = (
  date: Date,
  formatString: string,
  language?: string | null
): string => {
  if (getHtmlLanguage(language).startsWith('ar')) {
    return format(date, formatString, { locale: arSA });
  }

  return format(date, formatString);
};
