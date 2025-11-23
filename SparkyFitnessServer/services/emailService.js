const nodemailer = require('nodemailer');
const { log } = require('../config/logging');

// Configure your email transporter
// You will need to replace this with your actual email service provider details.
// Example using Gmail:
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER, // Your email address
//     pass: process.env.EMAIL_PASS, // Your email password or app-specific password
//   },
// });

// Example using SMTP:
const transporter = nodemailer.createTransport({
  host: process.env.SPARKY_FITNESS_EMAIL_HOST, // e.g., 'smtp.sendgrid.net'
  port: process.env.SPARKY_FITNESS_EMAIL_PORT, // e.g., 587 or 465
  secure: process.env.SPARKY_FITNESS_EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SPARKY_FITNESS_EMAIL_USER, // Your SMTP username
    pass: process.env.SPARKY_FITNESS_EMAIL_PASS, // Your SMTP password
  },
});


async function sendPasswordResetEmail(toEmail, resetUrl) {
  log('info', `Attempting to send password reset email to ${toEmail} with URL: ${resetUrl}`);
  log('debug', `Email Transporter Config: Host=${transporter.options.host}, Port=${transporter.options.port}, Secure=${transporter.options.secure}, User=${transporter.options.auth.user ? 'configured' : 'not configured'}`);

  if (!transporter.options.host || !transporter.options.auth.user) {
    log('warn', 'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.');
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
    return false; // Indicate that the email was not actually sent
  }

  try {
    await transporter.sendMail({
      from: process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com', // Your sender email address
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
  } catch (error) {
    log('error', `Failed to send password reset email to ${toEmail}. Error details:`, error);
    // Log more specific Nodemailer error properties if available
    if (error.response) {
      log('error', `SMTP Response: ${error.response}`);
    }
    if (error.responseCode) {
      log('error', `SMTP Response Code: ${error.responseCode}`);
    }
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendEmailMfaCode,
  sendMagicLinkEmail,
};

async function sendEmailMfaCode(toEmail, code) {
  log('info', `Attempting to send email MFA code to ${toEmail}`);
  log('debug', `Email Transporter Config: Host=${transporter.options.host}, Port=${transporter.options.port}, Secure=${transporter.options.secure}, User=${transporter.options.auth.user ? 'configured' : 'not configured'}`);

  if (!transporter.options.host || !transporter.options.auth.user) {
    log('warn', 'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.');
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
      from: process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com',
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
  } catch (error) {
    log('error', `Failed to send email MFA code to ${toEmail}. Error details:`, error);
    if (error.response) {
      log('error', `SMTP Response: ${error.response}`);
    }
    if (error.responseCode) {
      log('error', `SMTP Response Code: ${error.responseCode}`);
    }
    throw new Error(`Failed to send email MFA code: ${error.message}`);
  }
}

async function sendMagicLinkEmail(toEmail, magicLinkUrl) {
  log('info', `Attempting to send magic link email to ${toEmail} with URL: ${magicLinkUrl}`);
  log('debug', `Email Transporter Config: Host=${transporter.options.host}, Port=${transporter.options.port}, Secure=${transporter.options.secure}, User=${transporter.options.auth.user ? 'configured' : 'not configured'}`);

  if (!transporter.options.host || !transporter.options.auth.user) {
    log('warn', 'Email transporter is not fully configured (missing SMTP_HOST or SMTP_USER). Logging email content instead of sending.');
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
      from: process.env.SPARKY_FITNESS_EMAIL_FROM || 'noreply@sparkyfitness.com',
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
  } catch (error) {
    log('error', `Failed to send magic link email to ${toEmail}. Error details:`, error);
    if (error.response) {
      log('error', `SMTP Response: ${error.response}`);
    }
    if (error.responseCode) {
      log('error', `SMTP Response Code: ${error.responseCode}`);
    }
    throw new Error(`Failed to send magic link email: ${error.message}`);
  }
}