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

export interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface PasswordResetStrings {
  subject: string;
  intro: string;
  actionPrompt: string;
  expiry: string;
  ignoreNotice: string;
}

export interface MfaCodeStrings {
  subject: string;
  intro: string;
  expiry: string;
  ignoreNotice: string;
}

export interface MagicLinkStrings {
  subject: string;
  intro: string;
  actionPrompt: string;
  expiry: string;
  ignoreNotice: string;
}

interface RawEmailCatalog {
  passwordReset: PasswordResetStrings;
  mfaCode: MfaCodeStrings;
  magicLink: MagicLinkStrings;
}

type EmailCatalog = Partial<{
  passwordReset: Partial<PasswordResetStrings>;
  mfaCode: Partial<MfaCodeStrings>;
  magicLink: Partial<MagicLinkStrings>;
}>;

export const DEFAULT_EMAIL_LANGUAGE = 'en';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'locales');

// Language tags as the web and mobile catalogs name them (de, pt-BR, zh-Hans).
// The stored preference is free text, so anything else is never turned into a
// file path.
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Looked up for an address without an account, so a known and an unknown
// address cost the same number of queries (no timing hint on which exists).
const NO_ACCOUNT_USER_ID = '00000000-0000-0000-0000-000000000000';

const englishEmails = enCatalog.email as unknown as RawEmailCatalog;
// Only catalogs that loaded are kept, so a file that appears later is used.
const catalogCache = new Map<string, EmailCatalog>();

function loadEmailCatalog(language: string): EmailCatalog | null {
  if (language === DEFAULT_EMAIL_LANGUAGE) {
    return englishEmails as EmailCatalog;
  }
  const cached = catalogCache.get(language);
  if (cached) {
    return cached;
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
  if (catalog) {
    catalogCache.set(language, catalog);
  }
  return catalog;
}

/** Clears cached catalogs. Tests use it after changing files on disk. */
export function clearEmailCatalogCache(): void {
  catalogCache.clear();
}

/**
 * Normalizes an email language code, falling back to 'en' if invalid or unset.
 */
export function normalizeEmailLanguage(
  language: string | null | undefined
): string {
  const trimmed = language?.trim();
  if (!trimmed || !LANGUAGE_TAG.test(trimmed)) {
    return DEFAULT_EMAIL_LANGUAGE;
  }
  return trimmed;
}

/**
 * Escapes HTML special characters (&, <, >, ", ') to prevent injection.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replaces {{placeholder}} tokens in text with provided values.
 */
function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match
  );
}

/**
 * Builds HTML and text versions of the password reset email.
 */
function buildPasswordReset(
  pick: (field: keyof PasswordResetStrings) => string,
  values: Record<string, string>
): EmailTemplate {
  const intro = pick('intro');
  const actionPrompt = pick('actionPrompt');
  const expiry = pick('expiry');
  const ignoreNotice = pick('ignoreNotice');
  const resetUrl = values.resetUrl || '';
  const escapedUrl = escapeHtml(resetUrl);

  const bodyHtml = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(actionPrompt)}</p>`,
    `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`,
    `<p>${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(ignoreNotice)}</p>`,
  ].join('');

  const bodyText = [
    intro,
    actionPrompt,
    '',
    resetUrl,
    '',
    expiry,
    ignoreNotice,
  ].join('\n');

  return {
    subject: pick('subject'),
    bodyHtml,
    bodyText,
  };
}

/**
 * Builds HTML and text versions of the MFA verification code email.
 */
function buildMfaCode(
  pick: (field: keyof MfaCodeStrings) => string,
  values: Record<string, string>
): EmailTemplate {
  const intro = pick('intro');
  const expiry = pick('expiry');
  const ignoreNotice = pick('ignoreNotice');
  const code = values.code || '';

  const bodyHtml = [
    `<p>${escapeHtml(intro)}</p>`,
    `<h3>${escapeHtml(code)}</h3>`,
    `<p>${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(ignoreNotice)}</p>`,
  ].join('');

  const bodyText = [`${intro}\n\n${code}`, expiry, ignoreNotice].join('\n\n');

  return {
    subject: pick('subject'),
    bodyHtml,
    bodyText,
  };
}

/**
 * Builds HTML and text versions of the passwordless magic link email.
 */
function buildMagicLink(
  pick: (field: keyof MagicLinkStrings) => string,
  values: Record<string, string>
): EmailTemplate {
  const intro = pick('intro');
  const actionPrompt = pick('actionPrompt');
  const expiry = pick('expiry');
  const ignoreNotice = pick('ignoreNotice');
  const magicLinkUrl = values.magicLinkUrl || '';
  const escapedUrl = escapeHtml(magicLinkUrl);

  const bodyHtml = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(actionPrompt)}</p>`,
    `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`,
    `<p>${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(ignoreNotice)}</p>`,
  ].join('');

  const bodyText = [
    intro,
    actionPrompt,
    '',
    magicLinkUrl,
    '',
    expiry,
    ignoreNotice,
  ].join('\n');

  return {
    subject: pick('subject'),
    bodyHtml,
    bodyText,
  };
}

/**
 * Returns subject and bodies of an email in the requested language. Each
 * sentence falls back to English on its own when the language has no file or
 * the file lacks that string. HTML markup and link tags are constructed in
 * code, with all translated sentences and values HTML-escaped.
 */
export function getEmailTemplate(
  key: EmailTemplateKey,
  language: string | null | undefined,
  values: Record<string, string>
): EmailTemplate {
  const normalized = normalizeEmailLanguage(language);
  const localized = loadEmailCatalog(normalized)?.[key];
  const english = englishEmails[key];

  const pick = (field: string): string => {
    const text = (localized as unknown as Record<string, string> | undefined)?.[
      field
    ];
    const source =
      typeof text === 'string' && text.trim() !== ''
        ? text
        : (english as unknown as Record<string, string>)[field];
    return interpolate(source, values);
  };

  switch (key) {
    case 'passwordReset':
      return buildPasswordReset(pick, values);
    case 'mfaCode':
      return buildMfaCode(pick, values);
    case 'magicLink':
      return buildMagicLink(pick, values);
  }
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
    let hasAccount = Boolean(userId);
    if (!userId && recipient.email) {
      const user = await findUserIdByEmail(recipient.email);
      hasAccount = Boolean(user?.id);
      userId = user?.id ?? NO_ACCOUNT_USER_ID;
    }
    if (!userId) {
      return DEFAULT_EMAIL_LANGUAGE;
    }
    const preferences = await getUserPreferences(userId);
    return hasAccount
      ? normalizeEmailLanguage(preferences?.language)
      : DEFAULT_EMAIL_LANGUAGE;
  } catch (error: unknown) {
    log('warn', 'Could not look up the email language, using English.', error);
    return DEFAULT_EMAIL_LANGUAGE;
  }
}
