import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { log } from '../config/logging.js';

export interface EmailTransportConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  requireTLS?: boolean;
  auth?: {
    user?: string;
    pass?: string;
  };
}

export function getEmailTransportConfig(
  env: NodeJS.ProcessEnv = process.env
): EmailTransportConfig {
  const host = env.SPARKY_FITNESS_EMAIL_HOST;
  const user = env.SPARKY_FITNESS_EMAIL_USER;
  const pass = env.SPARKY_FITNESS_EMAIL_PASS;
  const rawPort = env.SPARKY_FITNESS_EMAIL_PORT;
  const rawSecure = env.SPARKY_FITNESS_EMAIL_SECURE;

  const port = rawPort ? parseInt(rawPort, 10) : 587;

  let secure: boolean;
  let requireTLS: boolean | undefined;

  if (rawSecure !== undefined && rawSecure !== '') {
    const isExplicitSecure = rawSecure === 'true';
    if (isExplicitSecure && (port === 587 || port === 25)) {
      // Port 587 (submission) and 25 use explicit TLS via STARTTLS, not direct/implicit TLS.
      // Setting secure: true causes SSL routines:tls_validate_record_header:wrong version number.
      // We set secure: false and requireTLS: true so STARTTLS is enforced without connection errors.
      log(
        'warn',
        `SPARKY_FITNESS_EMAIL_SECURE is set to true on port ${port}. Port ${port} uses STARTTLS rather than implicit SSL/TLS; using secure=false and requireTLS=true.`
      );
      secure = false;
      requireTLS = true;
    } else {
      secure = isExplicitSecure;
    }
  } else {
    // Port 465 uses direct SSL/TLS; other ports (587, 25, 2525, etc.) default to STARTTLS (secure=false)
    secure = port === 465;
  }

  return {
    host,
    port,
    secure,
    requireTLS,
    auth: {
      user,
      pass,
    },
  };
}

let transporter: Transporter = nodemailer.createTransport(
  getEmailTransportConfig() as SMTPTransport.Options
);

export function getTransporter(): Transporter {
  return transporter;
}

export function setTransporter(newTransporter: Transporter): void {
  transporter = newTransporter;
}

export function resetTransporter(env: NodeJS.ProcessEnv = process.env): void {
  transporter = nodemailer.createTransport(
    getEmailTransportConfig(env) as SMTPTransport.Options
  );
}

function isTransporterConfigured(): boolean {
  const options = transporter.options as
    | (SMTPTransport.Options & {
        host?: string;
        auth?: { user?: string; pass?: string };
      })
    | undefined;

  return Boolean(options?.host && options?.auth?.user);
}

function getTransporterDebugInfo(): string {
  const options = transporter.options as
    | (SMTPTransport.Options & {
        host?: string;
        auth?: { user?: string; pass?: string };
      })
    | undefined;

  return `Host=${options?.host ?? 'undefined'}, Port=${options?.port ?? 'undefined'}, Secure=${options?.secure ?? 'undefined'}, User=${options?.auth?.user ? 'configured' : 'not configured'}`;
}

async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<boolean> {
  log(
    'info',
    `Attempting to send password reset email to ${toEmail} with URL: ${resetUrl}`
  );
  log('debug', `Email Transporter Config: ${getTransporterDebugInfo()}`);

  if (!isTransporterConfigured()) {
    log(
      'warn',
      'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.'
    );
    console.log(`
      ------------------------------------
      PASSWORD RESET EMAIL (NOT SENT - EMAIL SERVICE NOT CONFIGURED)
      To: ${toEmail}
      Subject: SparkyFitness Password Reset
      
      You have requested a password reset for your SparkyFitness account.
      Please click on the following link to reset your password:
      
      ${resetUrl}
      
      This link will expire in 1 hour.
      If you did not request a password reset, please ignore this email.
      ------------------------------------
    `);
    return false;
  }

  try {
    await transporter.sendMail({
      from:
        process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com',
      to: toEmail,
      subject: 'SparkyFitness Password Reset',
      html: `
        <p>You have requested a password reset for your SparkyFitness account.</p>
        <p>Please click on the following link to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `,
    });
    log('info', `Password reset email successfully sent to ${toEmail}.`);
    return true;
  } catch (error: unknown) {
    log(
      'error',
      `Failed to send password reset email to ${toEmail}. Error details:`,
      error
    );
    if (error && typeof error === 'object' && 'response' in error) {
      log(
        'error',
        `SMTP Response: ${(error as { response: unknown }).response}`
      );
    }
    if (error && typeof error === 'object' && 'responseCode' in error) {
      log(
        'error',
        `SMTP Response Code: ${(error as { responseCode: unknown }).responseCode}`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send password reset email: ${message}`, {
      cause: error,
    });
  }
}

async function sendEmailMfaCode(
  toEmail: string,
  code: string
): Promise<boolean> {
  log('info', `Attempting to send email MFA code to ${toEmail}`);
  log('debug', `Email Transporter Config: ${getTransporterDebugInfo()}`);

  if (!isTransporterConfigured()) {
    log(
      'warn',
      'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.'
    );
    console.log(`
      ------------------------------------
      EMAIL MFA CODE (NOT SENT - EMAIL SERVICE NOT CONFIGURED)
      To: ${toEmail}
      Subject: Your SparkyFitness MFA Code
      
      Your Multi-Factor Authentication code is:
      
      ${code}
      
      This code is valid for 5 minutes.
      ------------------------------------
    `);
    return false;
  }

  try {
    await transporter.sendMail({
      from:
        process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com',
      to: toEmail,
      subject: 'Your SparkyFitness MFA Code',
      html: `
        <p>Your Multi-Factor Authentication code is:</p>
        <h3>${code}</h3>
        <p>This code is valid for 5 minutes.</p>
        <p>If you did not request this code, please ignore this email.</p>
      `,
    });
    log('info', `Email MFA code successfully sent to ${toEmail}.`);
    return true;
  } catch (error: unknown) {
    log(
      'error',
      `Failed to send email MFA code to ${toEmail}. Error details:`,
      error
    );
    if (error && typeof error === 'object' && 'response' in error) {
      log(
        'error',
        `SMTP Response: ${(error as { response: unknown }).response}`
      );
    }
    if (error && typeof error === 'object' && 'responseCode' in error) {
      log(
        'error',
        `SMTP Response Code: ${(error as { responseCode: unknown }).responseCode}`,
        {
          cause: error,
        }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send email MFA code: ${message}`, {
      cause: error,
    });
  }
}

async function sendMagicLinkEmail(
  toEmail: string,
  magicLinkUrl: string
): Promise<boolean> {
  log(
    'info',
    `Attempting to send magic link email to ${toEmail} with URL: ${magicLinkUrl}`
  );
  log('debug', `Email Transporter Config: ${getTransporterDebugInfo()}`);

  if (!isTransporterConfigured()) {
    log(
      'warn',
      'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.'
    );
    console.log(`
      ------------------------------------
      MAGIC LINK EMAIL (NOT SENT - EMAIL SERVICE NOT CONFIGURED)
      To: ${toEmail}
      Subject: Your SparkyFitness Login Link
      
      You have requested a passwordless login to your SparkyFitness account.
      Please click on the following link to log in:
      
      ${magicLinkUrl}
      
      This link will expire in 15 minutes and can only be used once.
      If you did not request this, please ignore this email.
      ------------------------------------
    `);
    return false;
  }

  try {
    await transporter.sendMail({
      from:
        process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com',
      to: toEmail,
      subject: 'Your SparkyFitness Login Link',
      html: `
        <p>You have requested a passwordless login to your SparkyFitness account.</p>
        <p>Please click on the following link to log in:</p>
        <p><a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
        <p>This link will expire in 15 minutes and can only be used once.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
    log('info', `Magic link email successfully sent to ${toEmail}.`);
    return true;
  } catch (error: unknown) {
    log(
      'error',
      `Failed to send magic link email to ${toEmail}. Error details:`,
      error
    );
    if (error && typeof error === 'object' && 'response' in error) {
      log(
        'error',
        `SMTP Response: ${(error as { response: unknown }).response}`
      );
    }
    if (error && typeof error === 'object' && 'responseCode' in error) {
      log(
        'error',
        `SMTP Response Code: ${(error as { responseCode: unknown }).responseCode}`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send magic link email: ${message}`, {
      cause: error,
    });
  }
}

export { sendPasswordResetEmail };
export { sendEmailMfaCode };
export { sendMagicLinkEmail };
export default {
  sendPasswordResetEmail,
  sendEmailMfaCode,
  sendMagicLinkEmail,
};
