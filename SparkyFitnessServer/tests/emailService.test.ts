import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Transporter } from 'nodemailer';
import {
  getEmailTransportConfig,
  sendPasswordResetEmail,
  sendEmailMfaCode,
  sendMagicLinkEmail,
  setTransporter,
  resetTransporter,
} from '../services/emailService.js';

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
});
