import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Transporter } from 'nodemailer';
import {
  getEmailTransportConfig,
  sendPasswordResetEmail,
  sendEmailMfaCode,
  sendMagicLinkEmail,
  setTransporter,
  resetTransporter,
} from '../services/emailService.js';
import {
  clearEmailCatalogCache,
  getEmailTemplate,
  normalizeEmailLanguage,
  resolveEmailLanguage,
} from '../services/emailTranslations.js';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { findUserIdByEmail } from '../models/userRepository.js';

vi.mock('../models/preferenceRepository.js', () => ({
  getUserPreferences: vi.fn(),
}));
vi.mock('../models/userRepository.js', () => ({
  findUserIdByEmail: vi.fn(),
}));

// Synthetic German catalog used in the tests below. Server translations
// come from Weblate.
const germanCatalog = {
  email: {
    passwordReset: {
      subject: 'SparkyFitness: Passwort zurücksetzen',
      intro: 'Sie haben das Zurücksetzen Ihres Passworts angefordert.',
      actionPrompt:
        'Bitte klicken Sie auf den Link, um Ihr Passwort zurückzusetzen:',
    },
    mfaCode: {
      subject: 'Dein SparkyFitness-Code',
      // intro left out on purpose: falls back to English on its own
    },
  },
};

function mockLocaleFiles(files: Record<string, unknown>) {
  const realExists = fs.existsSync;
  const realRead = fs.readFileSync;
  const isLocaleCatalog = (file: fs.PathLike | number) =>
    /[/\\]locales[/\\][^/\\]+[/\\]translation\.json$/.test(String(file));
  const find = (file: fs.PathLike | number) =>
    Object.entries(files).find(([language]) =>
      String(file).endsWith(path.join('locales', language, 'translation.json'))
    );
  vi.spyOn(fs, 'existsSync').mockImplementation((file) => {
    if (isLocaleCatalog(file)) {
      return Boolean(find(file as fs.PathLike));
    }
    return realExists(file);
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation(((
    file: fs.PathOrFileDescriptor,
    options?: unknown
  ) => {
    const hit = find(file as fs.PathLike);
    if (hit) return JSON.stringify(hit[1]);
    return realRead(file, options as BufferEncoding);
  }) as typeof fs.readFileSync);
}

function configuredTransporter() {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: '123' });
  setTransporter({
    options: {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'test@example.com', pass: 'secret' },
    },
    sendMail: sendMailMock,
  } as unknown as Transporter);
  return sendMailMock;
}

describe('emailService', () => {
  describe('getEmailTransportConfig', () => {
    it('defaults to port 587 and secure: false when no env vars provided', () => {
      const config = getEmailTransportConfig({});
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.requireTLS).toBeUndefined();
    });

    it('defaults to secure: true when port is 465 and SPARKY_FITNESS_EMAIL_SECURE is unset', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_PORT: '465',
      });
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
    });

    it('sets secure: false and requireTLS: true when port is 587 and SPARKY_FITNESS_EMAIL_SECURE is true to prevent SSL handshake error', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_PORT: '587',
        SPARKY_FITNESS_EMAIL_SECURE: 'true',
      });
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.requireTLS).toBe(true);
    });

    it('sets secure: false and requireTLS: true when port is 25 and SPARKY_FITNESS_EMAIL_SECURE is true', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_PORT: '25',
        SPARKY_FITNESS_EMAIL_SECURE: 'true',
      });
      expect(config.port).toBe(25);
      expect(config.secure).toBe(false);
      expect(config.requireTLS).toBe(true);
    });

    it('sets secure: true when port is 465 and SPARKY_FITNESS_EMAIL_SECURE is true', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_PORT: '465',
        SPARKY_FITNESS_EMAIL_SECURE: 'true',
      });
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
      expect(config.requireTLS).toBeUndefined();
    });

    it('sets secure: false when port is 587 and SPARKY_FITNESS_EMAIL_SECURE is false', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_PORT: '587',
        SPARKY_FITNESS_EMAIL_SECURE: 'false',
      });
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.requireTLS).toBeUndefined();
    });

    it('correctly maps host, user, and pass', () => {
      const config = getEmailTransportConfig({
        SPARKY_FITNESS_EMAIL_HOST: 'smtp.gmail.com',
        SPARKY_FITNESS_EMAIL_PORT: '587',
        SPARKY_FITNESS_EMAIL_USER: 'test@example.com',
        SPARKY_FITNESS_EMAIL_PASS: 'secretpassword',
      });
      expect(config.host).toBe('smtp.gmail.com');
      expect(config.port).toBe(587);
      expect(config.auth?.user).toBe('test@example.com');
      expect(config.auth?.pass).toBe('secretpassword');
    });
  });

  describe('sending emails with mock transporter', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      resetTransporter({});
    });

    it('returns false and skips sending when transporter is unconfigured', async () => {
      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://example.com/reset'
      );
      expect(result).toBe(false);

      const mfaResult = await sendEmailMfaCode('user@example.com', '123456');
      expect(mfaResult).toBe(false);

      const magicResult = await sendMagicLinkEmail(
        'user@example.com',
        'https://example.com/magic'
      );
      expect(magicResult).toBe(false);
    });

    it('sends password reset email when transporter is configured', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '123' });
      const mockTransporter = {
        options: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'test@example.com', pass: 'secret' },
        },
        sendMail: sendMailMock,
      } as unknown as Transporter;

      setTransporter(mockTransporter);

      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://example.com/reset?token=xyz'
      );

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'SparkyFitness Password Reset',
          html: expect.stringContaining('https://example.com/reset?token=xyz'),
        })
      );
    });

    it('sends MFA code email when transporter is configured', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '123' });
      const mockTransporter = {
        options: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'test@example.com', pass: 'secret' },
        },
        sendMail: sendMailMock,
      } as unknown as Transporter;

      setTransporter(mockTransporter);

      const result = await sendEmailMfaCode('user@example.com', '654321');

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your SparkyFitness MFA Code',
          html: expect.stringContaining('654321'),
        })
      );
    });

    it('sends magic link email when transporter is configured', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '123' });
      const mockTransporter = {
        options: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'test@example.com', pass: 'secret' },
        },
        sendMail: sendMailMock,
      } as unknown as Transporter;

      setTransporter(mockTransporter);

      const result = await sendMagicLinkEmail(
        'user@example.com',
        'https://example.com/magic?token=abc'
      );

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your SparkyFitness Login Link',
          html: expect.stringContaining('https://example.com/magic?token=abc'),
        })
      );
    });

    it('handles and throws errors when transporter sendMail fails', async () => {
      const sendMailMock = vi
        .fn()
        .mockRejectedValue(new Error('Connection timeout'));
      const mockTransporter = {
        options: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'test@example.com', pass: 'secret' },
        },
        sendMail: sendMailMock,
      } as unknown as Transporter;

      setTransporter(mockTransporter);

      await expect(
        sendPasswordResetEmail('user@example.com', 'https://example.com/reset')
      ).rejects.toThrow(
        'Failed to send password reset email: Connection timeout'
      );

      await expect(
        sendEmailMfaCode('user@example.com', '123456')
      ).rejects.toThrow('Failed to send email MFA code: Connection timeout');

      await expect(
        sendMagicLinkEmail('user@example.com', 'https://example.com/magic')
      ).rejects.toThrow('Failed to send magic link email: Connection timeout');
    });
  });

  describe('localized emails', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.mocked(getUserPreferences).mockReset();
      vi.mocked(findUserIdByEmail).mockReset();
      clearEmailCatalogCache();
      mockLocaleFiles({ de: germanCatalog });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      clearEmailCatalogCache();
    });

    it('sends the password reset email in the requested language', async () => {
      const sendMailMock = configuredTransporter();

      await sendPasswordResetEmail(
        'user@example.com',
        'https://example.com/reset?token=xyz',
        'de'
      );

      const mail = sendMailMock.mock.calls[0][0];
      expect(mail.subject).toBe('SparkyFitness: Passwort zurücksetzen');
      expect(mail.html).toContain(
        '<a href="https://example.com/reset?token=xyz">'
      );
      expect(mail.html).toContain(
        'Sie haben das Zurücksetzen Ihres Passworts angefordert.'
      );
      expect(mail.html).toContain(
        'Bitte klicken Sie auf den Link, um Ihr Passwort zurückzusetzen:'
      );
      expect(mail.html).toContain('This link will expire in 1 hour.');
      expect(mail.html).toContain(
        'If you did not request a password reset, please ignore this email.'
      );
      expect(mail.text).toContain('https://example.com/reset?token=xyz');
      expect(mail.text).toContain(
        'Sie haben das Zurücksetzen Ihres Passworts angefordert.'
      );
      expect(mail.text).toContain(
        'Bitte klicken Sie auf den Link, um Ihr Passwort zurückzusetzen:'
      );
      expect(mail.text).toContain('This link will expire in 1 hour.');
      expect(mail.text).toContain(
        'If you did not request a password reset, please ignore this email.'
      );
    });

    it('keeps the English texts when no language is given', async () => {
      const sendMailMock = configuredTransporter();

      await sendMagicLinkEmail('user@example.com', 'https://example.com/magic');

      const mail = sendMailMock.mock.calls[0][0];
      expect(mail.subject).toBe('Your SparkyFitness Login Link');
      expect(mail.html).toContain(
        'This link will expire in 15 minutes and can only be used once.'
      );
      expect(mail.text).toContain('https://example.com/magic');
    });

    it('falls back to English per string when a translation is missing', async () => {
      const sendMailMock = configuredTransporter();

      await sendEmailMfaCode('user@example.com', '654321', 'de');

      const mail = sendMailMock.mock.calls[0][0];
      expect(mail.subject).toBe('Dein SparkyFitness-Code');
      expect(mail.html).toContain('<h3>654321</h3>');
      expect(mail.text).toContain('Your Multi-Factor Authentication code is:');
      expect(mail.text).toContain('654321');
    });

    it('falls back to English when the language has no catalog', () => {
      const template = getEmailTemplate('magicLink', 'fr', {
        magicLinkUrl: 'https://example.com/m',
      });
      expect(template.subject).toBe('Your SparkyFitness Login Link');
      expect(template.bodyHtml).toContain('https://example.com/m');
    });

    it('writes the localized text to the console when SMTP is not configured', async () => {
      resetTransporter({});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sent = await sendPasswordResetEmail(
        'user@example.com',
        'https://example.com/reset',
        'de'
      );

      expect(sent).toBe(false);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Subject: SparkyFitness: Passwort zurücksetzen');
      expect(output).toContain('https://example.com/reset');
    });

    it('never turns an unexpected language value into a file path', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync');
      existsSpy.mockClear();

      for (const value of [
        '../../etc',
        'de/../../x',
        '',
        '   ',
        null,
        undefined,
      ]) {
        expect(normalizeEmailLanguage(value)).toBe('en');
        getEmailTemplate('passwordReset', value, { resetUrl: 'u' });
      }

      expect(existsSpy).not.toHaveBeenCalled();
    });

    it('accepts language tags with a region or script', () => {
      expect(normalizeEmailLanguage('pt-BR')).toBe('pt-BR');
      expect(normalizeEmailLanguage('zh-Hans')).toBe('zh-Hans');
    });

    it('reads the language from the user preferences', async () => {
      vi.mocked(getUserPreferences).mockResolvedValue({ language: 'de' });

      await expect(resolveEmailLanguage({ userId: 'user-1' })).resolves.toBe(
        'de'
      );
      expect(getUserPreferences).toHaveBeenCalledWith('user-1');
    });

    it('looks the user up by email for the magic link', async () => {
      vi.mocked(findUserIdByEmail).mockResolvedValue({ id: 'user-2' });
      vi.mocked(getUserPreferences).mockResolvedValue({ language: 'de' });

      await expect(
        resolveEmailLanguage({ email: 'user@example.com' })
      ).resolves.toBe('de');
      expect(getUserPreferences).toHaveBeenCalledWith('user-2');
    });

    it('uses English for an unknown email address', async () => {
      vi.mocked(findUserIdByEmail).mockResolvedValue(undefined);

      vi.mocked(getUserPreferences).mockResolvedValue({ language: 'de' });

      await expect(
        resolveEmailLanguage({ email: 'nobody@example.com' })
      ).resolves.toBe('en');
      // Same queries as for a known address, so timing does not reveal
      // whether the address has an account.
      expect(getUserPreferences).toHaveBeenCalledTimes(1);
      expect(getUserPreferences).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000000'
      );
    });

    it('loads a catalog that appears after a failed lookup', () => {
      vi.restoreAllMocks();
      mockLocaleFiles({});
      expect(
        getEmailTemplate('passwordReset', 'de', { resetUrl: 'u' }).subject
      ).toBe('SparkyFitness Password Reset');

      vi.restoreAllMocks();
      mockLocaleFiles({ de: germanCatalog });
      expect(
        getEmailTemplate('passwordReset', 'de', { resetUrl: 'u' }).subject
      ).toBe('SparkyFitness: Passwort zurücksetzen');
    });

    it('escapes values in the HTML body only', () => {
      const url = 'https://example.com/a&b?x="1"<y>';
      const template = getEmailTemplate('passwordReset', 'en', {
        resetUrl: url,
      });

      expect(template.bodyHtml).toContain(
        'href="https://example.com/a&amp;b?x=&quot;1&quot;&lt;y&gt;"'
      );
      expect(template.bodyHtml).not.toContain(url);
      expect(template.bodyText).toContain(url);
    });

    it('fills in the expiry times and keeps the English wording', () => {
      expect(
        getEmailTemplate('passwordReset', 'en', {
          resetUrl: 'u',
          expiresInHours: '1',
        }).bodyText
      ).toContain('This link will expire in 1 hour.');
      expect(
        getEmailTemplate('mfaCode', 'en', {
          code: '1',
          expiresInMinutes: '5',
        }).bodyHtml
      ).toContain('<p>This code is valid for 5 minutes.</p>');
    });

    it('sends the expiry times the mails used before', async () => {
      const sendMailMock = configuredTransporter();

      await sendPasswordResetEmail('user@example.com', 'https://e.x/r');
      await sendEmailMfaCode('user@example.com', '123456');
      await sendMagicLinkEmail('user@example.com', 'https://e.x/m');

      const texts = sendMailMock.mock.calls.map(([mail]) => mail.text);
      expect(texts[0]).toContain('This link will expire in 1 hour.');
      expect(texts[1]).toContain('This code is valid for 5 minutes.');
      expect(texts[2]).toContain(
        'This link will expire in 15 minutes and can only be used once.'
      );
      for (const text of texts) {
        expect(text).not.toMatch(/\{\{/);
      }
    });

    it('uses English when the user has no language set', async () => {
      vi.mocked(getUserPreferences).mockResolvedValue(undefined);

      await expect(resolveEmailLanguage({ userId: 'user-3' })).resolves.toBe(
        'en'
      );
    });

    it('uses English when the lookup fails', async () => {
      vi.mocked(getUserPreferences).mockRejectedValue(new Error('db down'));

      await expect(resolveEmailLanguage({ userId: 'user-4' })).resolves.toBe(
        'en'
      );
    });
  });
});
