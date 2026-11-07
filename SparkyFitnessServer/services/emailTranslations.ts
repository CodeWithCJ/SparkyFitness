import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../config/logging.js';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { findUserIdByEmail } from '../models/userRepository.js';
// English is the source catalog and the fallback for every other language.
// Importing it keeps the English texts in the module, so a missing file on
// disk can never leave a mail without a subject or body.
import enCatalog from '../locales/en/translation.json' with { type: 'json' };

export type EmailTemplateKey = 'passwordReset' | 'mfaCode' | 'magicLink';

interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

type EmailCatalog = Partial<Record<EmailTemplateKey, Partial<EmailTemplate>>>;

export const DEFAULT_EMAIL_LANGUAGE = 'en';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'locales');

// Language tags as the web and mobile catalogs name them (de, pt-BR, zh-Hans).
// The stored preference is free text, so anything else is never turned into a
// file path.
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const englishEmails: EmailCatalog = enCatalog.email;
const catalogCache = new Map<string, EmailCatalog | null>();

function loadEmailCatalog(language: string): EmailCatalog | null {
  if (language === DEFAULT_EMAIL_LANGUAGE) {
    return englishEmails;
  }
  if (catalogCache.has(language)) {
    return catalogCache.get(language) ?? null;
  }

  let catalog: EmailCatalog | null = null;
  const file = path.join(LOCALES_DIR, language, 'translation.json');
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        email?: EmailCatalog;
      };
      catalog = parsed.email ?? null;
    }
  } catch (error: unknown) {
    log(
      'warn',
      `Could not read the server translation file for "${language}", using English.`,
      error
    );
  }
  catalogCache.set(language, catalog);
  return catalog;
}

/** Clears cached catalogs. Tests use it after changing files on disk. */
export function clearEmailCatalogCache(): void {
  catalogCache.clear();
}

export function normalizeEmailLanguage(
  language: string | null | undefined
): string {
  const trimmed = language?.trim();
  if (!trimmed || !LANGUAGE_TAG.test(trimmed)) {
    return DEFAULT_EMAIL_LANGUAGE;
  }
  return trimmed;
}

function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match
  );
}

/**
 * Returns subject and bodies of an email in the requested language. Each
 * string falls back to English on its own when the language has no file or
 * the file lacks that string.
 */
export function getEmailTemplate(
  key: EmailTemplateKey,
  language: string | null | undefined,
  values: Record<string, string>
): EmailTemplate {
  const normalized = normalizeEmailLanguage(language);
  const localized = loadEmailCatalog(normalized)?.[key];
  const english = englishEmails[key] as EmailTemplate;

  const pick = (field: keyof EmailTemplate): string => {
    const text = localized?.[field];
    return interpolate(
      typeof text === 'string' && text.trim() !== '' ? text : english[field],
      values
    );
  };

  return {
    subject: pick('subject'),
    bodyHtml: pick('bodyHtml'),
    bodyText: pick('bodyText'),
  };
}

/**
 * Looks up the language a user chose in the app. Falls back to English when
 * there is no user, no preference, or the lookup fails: a missing preference
 * must never stop an email from being sent.
 */
export async function resolveEmailLanguage(recipient: {
  userId?: string | null;
  email?: string | null;
}): Promise<string> {
  try {
    let userId = recipient.userId ?? null;
    if (!userId && recipient.email) {
      const user = await findUserIdByEmail(recipient.email);
      userId = user?.id ?? null;
    }
    if (!userId) {
      return DEFAULT_EMAIL_LANGUAGE;
    }
    const preferences = await getUserPreferences(userId);
    return normalizeEmailLanguage(preferences?.language);
  } catch (error: unknown) {
    log('warn', 'Could not look up the email language, using English.', error);
    return DEFAULT_EMAIL_LANGUAGE;
  }
}
