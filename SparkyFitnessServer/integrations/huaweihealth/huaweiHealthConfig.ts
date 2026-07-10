import { z } from 'zod/v4';
import { HuaweiHealthError } from './huaweiHealthErrors.js';

const HUAWEI_AUTHORIZATION_URL =
  'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize';
const HUAWEI_TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';
const HUAWEI_HEALTH_API_BASE_URL =
  'https://health-api.cloud.huawei.com/healthkit/v2';
const HUAWEI_OPENID_CONFIGURATION_URL =
  'https://oauth-login.cloud.huawei.com/.well-known/openid-configuration';
const HUAWEI_HTTP_TIMEOUT_MS = 15_000;

// Huawei history access is intentionally limited to one week for the MVP.
// The remaining scopes map one-to-one to data that SparkyFitness imports.
const HUAWEI_HEALTH_READ_SCOPES = [
  'openid',
  'https://www.huawei.com/healthkit/historydata.open.week',
  'https://www.huawei.com/healthkit/step.read',
  'https://www.huawei.com/healthkit/calories.read',
  'https://www.huawei.com/healthkit/distance.read',
  'https://www.huawei.com/healthkit/heartrate.read',
  'https://www.huawei.com/healthkit/oxygensaturation.read',
  'https://www.huawei.com/healthkit/heightweight.read',
  'https://www.huawei.com/healthkit/sleep.read',
  'https://www.huawei.com/healthkit/activityrecord.read',
] as const;

const httpUrlSchema = z
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'URL must use HTTP or HTTPS.',
  });

export interface HuaweiHealthConfig {
  clientId: string;
  clientSecret: string;
  appId: string;
  redirectUri: string;
}

function parseHttpUrl(value: string, envName: string): string {
  const parsed = httpUrlSchema.safeParse(value);
  if (!parsed.success) {
    throw new HuaweiHealthError(
      'HUAWEI_CONFIGURATION_INVALID',
      503,
      `${envName} must be a valid HTTP(S) URL.`
    );
  }
  const url = new URL(parsed.data);
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    /^127\./.test(url.hostname) ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !isLoopback) {
    throw new HuaweiHealthError(
      'HUAWEI_CONFIGURATION_INVALID',
      503,
      `${envName} must use HTTPS outside local loopback development.`
    );
  }
  return parsed.data;
}

export function getHuaweiHealthConfig(): HuaweiHealthConfig | null {
  const clientId = process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) return null;

  const explicitRedirectUri =
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_REDIRECT_URI?.trim();
  const frontendUrl =
    process.env.SPARKY_FITNESS_FRONTEND_URL?.trim() || 'http://localhost:8080';
  const redirectUri = explicitRedirectUri
    ? parseHttpUrl(
        explicitRedirectUri,
        'SPARKY_FITNESS_HUAWEI_HEALTH_REDIRECT_URI'
      )
    : new URL(
        '/huaweihealth/callback',
        parseHttpUrl(frontendUrl, 'SPARKY_FITNESS_FRONTEND_URL')
      ).toString();

  return {
    clientId,
    clientSecret,
    appId: process.env.SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID?.trim() || clientId,
    redirectUri,
  };
}

export {
  HUAWEI_AUTHORIZATION_URL,
  HUAWEI_HEALTH_API_BASE_URL,
  HUAWEI_HEALTH_READ_SCOPES,
  HUAWEI_HTTP_TIMEOUT_MS,
  HUAWEI_OPENID_CONFIGURATION_URL,
  HUAWEI_TOKEN_URL,
};
