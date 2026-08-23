import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSecrets } from '../utils/secretLoader.js';

describe('secretLoader', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-secrets-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads secrets from *_FILE variables when target variable is unset', () => {
    const secretFile = path.join(tempDir, 'db_password.txt');
    fs.writeFileSync(secretFile, 'supersecret_password\n');

    delete process.env.SPARKY_FITNESS_DB_PASSWORD;
    process.env.SPARKY_FITNESS_DB_PASSWORD_FILE = secretFile;

    loadSecrets();

    expect(process.env.SPARKY_FITNESS_DB_PASSWORD).toBe('supersecret_password');
  });

  it('loads secrets when target variable is an empty string', () => {
    const secretFile = path.join(tempDir, 'app_db_password.txt');
    fs.writeFileSync(secretFile, 'app_password_123');

    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = '';
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD_FILE = secretFile;

    loadSecrets();

    expect(process.env.SPARKY_FITNESS_APP_DB_PASSWORD).toBe('app_password_123');
  });

  it('loads secrets when target variable contains only whitespace', () => {
    const secretFile = path.join(tempDir, 'email_pass.txt');
    fs.writeFileSync(secretFile, 'email_secret_pass');

    process.env.SPARKY_FITNESS_EMAIL_PASS = '   ';
    process.env.SPARKY_FITNESS_EMAIL_PASS_FILE = secretFile;

    loadSecrets();

    expect(process.env.SPARKY_FITNESS_EMAIL_PASS).toBe('email_secret_pass');
  });

  it('preserves existing non-empty environment variable when both VAR and VAR_FILE are set', () => {
    const secretFile = path.join(tempDir, 'encryption_key.txt');
    fs.writeFileSync(secretFile, 'key_from_file');

    process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY = 'explicit_env_key';
    process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY_FILE = secretFile;

    loadSecrets();

    expect(process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY).toBe(
      'explicit_env_key'
    );
  });

  it('handles multiple sensitive secret files simultaneously', () => {
    const secrets: Record<string, string> = {
      SPARKY_FITNESS_DB_PASSWORD: 'db_secret_pass',
      SPARKY_FITNESS_APP_DB_PASSWORD: 'app_db_secret_pass',
      SPARKY_FITNESS_EMAIL_PASS: 'smtp_secret_pass',
      SPARKY_FITNESS_OIDC_CLIENT_ID: 'oidc_client_id_val',
      SPARKY_FITNESS_OIDC_CLIENT_SECRET: 'oidc_client_secret_val',
      BETTER_AUTH_SECRET: 'better_auth_secret_val',
      SPARKY_FITNESS_API_ENCRYPTION_KEY: 'encryption_key_val',
    };

    for (const [varName, value] of Object.entries(secrets)) {
      const filePath = path.join(tempDir, `${varName}.txt`);
      fs.writeFileSync(filePath, `${value} \n`);
      delete process.env[varName];
      process.env[`${varName}_FILE`] = filePath;
    }

    loadSecrets();

    for (const [varName, expectedValue] of Object.entries(secrets)) {
      expect(process.env[varName]).toBe(expectedValue);
    }
  });

  it('logs a warning without throwing if secret file does not exist', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NON_EXISTENT_SECRET_FILE = path.join(
      tempDir,
      'does_not_exist.txt'
    );
    delete process.env.NON_EXISTENT_SECRET;

    expect(() => loadSecrets()).not.toThrow();
    expect(process.env.NON_EXISTENT_SECRET).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Secrets] WARNING: File specified in NON_EXISTENT_SECRET_FILE'
      )
    );
  });

  it('ignores *_FILE variables with empty file paths', () => {
    process.env.EMPTY_PATH_VAR_FILE = '';
    delete process.env.EMPTY_PATH_VAR;

    expect(() => loadSecrets()).not.toThrow();
    expect(process.env.EMPTY_PATH_VAR).toBeUndefined();
  });
});
