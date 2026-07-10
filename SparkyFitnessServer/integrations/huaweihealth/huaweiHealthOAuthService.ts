import crypto from 'node:crypto';
import axios from 'axios';
import { z } from 'zod/v4';
import { decrypt, encrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import {
  getHuaweiHealthConfig,
  HUAWEI_AUTHORIZATION_URL,
  HUAWEI_HEALTH_API_BASE_URL,
  HUAWEI_HEALTH_READ_SCOPES,
  HUAWEI_TOKEN_URL,
  type HuaweiHealthConfig,
} from './huaweiHealthConfig.js';
import { HuaweiHealthError } from './huaweiHealthErrors.js';
import { verifyHuaweiIdToken } from './huaweiHealthIdToken.js';
import huaweiHealthOAuthRepository from './huaweiHealthOAuthRepository.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStatePartSchema = z.string().regex(/^[0-9a-f]{64}$/);
const oauthStateRecordSchema = z.tuple([
  oauthStatePartSchema,
  oauthStatePartSchema,
  z.coerce.number().int().positive(),
]);
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive(),
  scope: z.string().default(''),
  id_token: z.string().min(1),
  token_type: z.string().optional(),
});
const refreshTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export interface HuaweiHealthEncryptedValue {
  encryptedText: string;
  iv: string;
  tag: string;
}

export interface HuaweiHealthStoredTokens {
  accessToken: HuaweiHealthEncryptedValue;
  refreshToken: HuaweiHealthEncryptedValue;
  tokenExpiresAt: Date;
  scope: string;
  externalUserId: string;
}

export interface HuaweiHealthRefreshedTokens {
  accessToken: HuaweiHealthEncryptedValue;
  refreshToken?: HuaweiHealthEncryptedValue;
  tokenExpiresAt: Date;
  scope?: string;
}

export interface HuaweiHealthConnectionRecord {
  isActive: boolean;
  externalUserId: string | null;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
  scope: string | null;
  encryptedAccessToken: string | null;
  accessTokenIv: string | null;
  accessTokenTag: string | null;
  encryptedRefreshToken?: string | null;
  refreshTokenIv?: string | null;
  refreshTokenTag?: string | null;
}

export interface HuaweiHealthOAuthRepository {
  storeOAuthState(
    userId: string,
    authenticatedUserId: string,
    stateRecord: string
  ): Promise<void>;
  consumeOAuthState(
    userId: string,
    authenticatedUserId: string,
    state: string
  ): Promise<string | null>;
  saveTokens(
    userId: string,
    authenticatedUserId: string,
    tokens: HuaweiHealthStoredTokens
  ): Promise<void>;
  saveRefreshedTokens(
    userId: string,
    authenticatedUserId: string,
    tokens: HuaweiHealthRefreshedTokens
  ): Promise<void>;
  getConnection(
    userId: string,
    authenticatedUserId: string
  ): Promise<HuaweiHealthConnectionRecord | null>;
  clearConnection(userId: string, authenticatedUserId: string): Promise<void>;
}

interface HuaweiHealthHttpClient {
  post(
    url: string,
    body: URLSearchParams,
    config: { headers: Record<string, string> }
  ): Promise<{ data: unknown }>;
  delete(
    url: string,
    config: {
      params: { deleteData: boolean };
      headers: Record<string, string>;
    }
  ): Promise<{ data: unknown }>;
}

interface HuaweiHealthOAuthDependencies {
  repository: HuaweiHealthOAuthRepository;
  httpClient: HuaweiHealthHttpClient;
  encryptValue(value: string): Promise<HuaweiHealthEncryptedValue>;
  decryptValue(
    encryptedText: string,
    iv: string,
    tag: string
  ): Promise<string | null>;
  verifyIdToken(
    idToken: string,
    config: HuaweiHealthConfig,
    expectedNonce: string
  ): Promise<{ sub: string }>;
  randomHex(): string;
  now(): Date;
}

function requireConfig(): HuaweiHealthConfig {
  const config = getHuaweiHealthConfig();
  if (!config) {
    throw new HuaweiHealthError(
      'HUAWEI_NOT_CONFIGURED',
      503,
      'HUAWEI Health is not configured for this SparkyFitness instance.'
    );
  }
  return config;
}

function assertOwner(userId: string, authenticatedUserId: string): void {
  if (userId !== authenticatedUserId) {
    throw new HuaweiHealthError(
      'HUAWEI_OWNER_ONLY',
      403,
      'HUAWEI Health can only be linked by the signed-in profile owner.'
    );
  }
}

function parseOAuthStateRecord(record: string): {
  state: string;
  nonce: string;
  issuedAt: number;
} {
  const parsed = oauthStateRecordSchema.safeParse(record.split('.'));
  if (!parsed.success) {
    throw new HuaweiHealthError(
      'HUAWEI_OAUTH_STATE_INVALID',
      400,
      'The Huawei authorization state is invalid or has already been used.'
    );
  }
  const [state, nonce, issuedAt] = parsed.data;
  return { state, nonce, issuedAt };
}

export function createHuaweiHealthOAuthService(
  dependencies: HuaweiHealthOAuthDependencies
) {
  const {
    repository,
    httpClient,
    encryptValue,
    decryptValue,
    verifyIdToken,
    randomHex,
    now,
  } = dependencies;

  return {
    async createAuthorizationRequest(
      userId: string,
      authenticatedUserId: string
    ): Promise<{ authUrl: string }> {
      assertOwner(userId, authenticatedUserId);
      const config = requireConfig();
      const state = randomHex();
      const nonce = randomHex();
      const issuedAt = now().getTime();
      await repository.storeOAuthState(
        userId,
        authenticatedUserId,
        `${state}.${nonce}.${issuedAt}`
      );

      const params = new URLSearchParams({
        response_type: 'code',
        access_type: 'offline',
        display: 'touch',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: HUAWEI_HEALTH_READ_SCOPES.join(' '),
        state,
        nonce,
      });
      return { authUrl: `${HUAWEI_AUTHORIZATION_URL}?${params}` };
    },

    async exchangeCodeForTokens(
      userId: string,
      authenticatedUserId: string,
      code: string,
      state: string
    ): Promise<{ connected: true }> {
      assertOwner(userId, authenticatedUserId);
      const config = requireConfig();
      const stateRecord = await repository.consumeOAuthState(
        userId,
        authenticatedUserId,
        state
      );
      if (!stateRecord) {
        throw new HuaweiHealthError(
          'HUAWEI_OAUTH_STATE_INVALID',
          400,
          'The Huawei authorization state is invalid or has already been used.'
        );
      }
      const storedState = parseOAuthStateRecord(stateRecord);
      if (storedState.state !== state) {
        throw new HuaweiHealthError(
          'HUAWEI_OAUTH_STATE_INVALID',
          400,
          'The Huawei authorization state does not match.'
        );
      }
      const stateAge = now().getTime() - storedState.issuedAt;
      if (stateAge < 0 || stateAge > OAUTH_STATE_TTL_MS) {
        throw new HuaweiHealthError(
          'HUAWEI_OAUTH_STATE_EXPIRED',
          400,
          'The Huawei authorization request has expired.'
        );
      }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      let responseData: unknown;
      try {
        responseData = (
          await httpClient.post(HUAWEI_TOKEN_URL, body, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })
        ).data;
      } catch (error) {
        throw new HuaweiHealthError(
          'HUAWEI_OAUTH_EXCHANGE_FAILED',
          502,
          'Huawei rejected the authorization code exchange.',
          { cause: error }
        );
      }

      const tokenResult = tokenResponseSchema.safeParse(responseData);
      if (!tokenResult.success) {
        throw new HuaweiHealthError(
          'HUAWEI_TOKEN_RESPONSE_INVALID',
          502,
          'Huawei returned an invalid token response.'
        );
      }
      const tokenResponse = tokenResult.data;

      let verifiedIdentity: { sub: string };
      try {
        verifiedIdentity = await verifyIdToken(
          tokenResponse.id_token,
          config,
          storedState.nonce
        );
      } catch (error) {
        if (error instanceof HuaweiHealthError) throw error;
        throw new HuaweiHealthError(
          'HUAWEI_ID_TOKEN_INVALID',
          502,
          'Huawei returned an invalid identity token.',
          { cause: error }
        );
      }

      const [accessToken, refreshToken] = await Promise.all([
        encryptValue(tokenResponse.access_token),
        encryptValue(tokenResponse.refresh_token),
      ]);
      await repository.saveTokens(userId, authenticatedUserId, {
        accessToken,
        refreshToken,
        tokenExpiresAt: new Date(
          now().getTime() + tokenResponse.expires_in * 1000
        ),
        scope: tokenResponse.scope,
        externalUserId: verifiedIdentity.sub,
      });
      return { connected: true };
    },

    async getStatus(userId: string, authenticatedUserId: string) {
      assertOwner(userId, authenticatedUserId);
      const config = getHuaweiHealthConfig();
      if (!config) {
        return {
          available: false,
          connected: false,
          isActive: false,
          lastSyncAt: null,
          tokenExpiresAt: null,
          grantedScopes: [] as string[],
          reason: 'HUAWEI_NOT_CONFIGURED' as const,
        };
      }

      const connection = await repository.getConnection(
        userId,
        authenticatedUserId
      );
      return {
        available: true,
        connected: Boolean(connection?.isActive && connection.externalUserId),
        isActive: connection?.isActive ?? false,
        lastSyncAt: connection?.lastSyncAt ?? null,
        tokenExpiresAt: connection?.tokenExpiresAt ?? null,
        grantedScopes: connection?.scope?.split(/\s+/).filter(Boolean) ?? [],
      };
    },

    async getValidAccessToken(
      userId: string,
      authenticatedUserId: string
    ): Promise<string> {
      assertOwner(userId, authenticatedUserId);
      const config = requireConfig();
      const connection = await repository.getConnection(
        userId,
        authenticatedUserId
      );
      if (!connection?.isActive) {
        throw new HuaweiHealthError(
          'HUAWEI_NOT_CONNECTED',
          409,
          'HUAWEI Health is not connected.'
        );
      }

      const accessTokenIsFresh =
        connection.encryptedAccessToken &&
        connection.accessTokenIv &&
        connection.accessTokenTag &&
        connection.tokenExpiresAt &&
        connection.tokenExpiresAt.getTime() > now().getTime() + 5 * 60 * 1000;
      if (accessTokenIsFresh) {
        const accessToken = await decryptValue(
          connection.encryptedAccessToken as string,
          connection.accessTokenIv as string,
          connection.accessTokenTag as string
        );
        if (accessToken) return accessToken;
      }

      if (
        !connection.encryptedRefreshToken ||
        !connection.refreshTokenIv ||
        !connection.refreshTokenTag
      ) {
        throw new HuaweiHealthError(
          'HUAWEI_NOT_CONNECTED',
          409,
          'HUAWEI Health needs to be connected again.'
        );
      }
      const refreshToken = await decryptValue(
        connection.encryptedRefreshToken,
        connection.refreshTokenIv,
        connection.refreshTokenTag
      );
      if (!refreshToken) {
        throw new HuaweiHealthError(
          'HUAWEI_NOT_CONNECTED',
          409,
          'HUAWEI Health needs to be connected again.'
        );
      }

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
      let responseData: unknown;
      try {
        responseData = (
          await httpClient.post(HUAWEI_TOKEN_URL, body, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })
        ).data;
      } catch (error) {
        throw new HuaweiHealthError(
          'HUAWEI_TOKEN_REFRESH_FAILED',
          502,
          'Huawei rejected the refresh token.',
          { cause: error }
        );
      }

      const refreshResult = refreshTokenResponseSchema.safeParse(responseData);
      if (!refreshResult.success) {
        throw new HuaweiHealthError(
          'HUAWEI_TOKEN_RESPONSE_INVALID',
          502,
          'Huawei returned an invalid refresh response.'
        );
      }
      const refreshed = refreshResult.data;
      const encryptedAccessToken = await encryptValue(refreshed.access_token);
      const encryptedRefreshToken = refreshed.refresh_token
        ? await encryptValue(refreshed.refresh_token)
        : undefined;
      await repository.saveRefreshedTokens(userId, authenticatedUserId, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: new Date(now().getTime() + refreshed.expires_in * 1000),
        scope: refreshed.scope,
      });
      return refreshed.access_token;
    },

    async disconnect(
      userId: string,
      authenticatedUserId: string
    ): Promise<void> {
      assertOwner(userId, authenticatedUserId);
      const config = requireConfig();
      const connection = await repository.getConnection(
        userId,
        authenticatedUserId
      );
      if (!connection) return;

      if (
        connection.encryptedAccessToken &&
        connection.accessTokenIv &&
        connection.accessTokenTag
      ) {
        const accessToken = await decryptValue(
          connection.encryptedAccessToken,
          connection.accessTokenIv,
          connection.accessTokenTag
        );
        if (accessToken) {
          try {
            await httpClient.delete(
              `${HUAWEI_HEALTH_API_BASE_URL}/consents/${encodeURIComponent(config.appId)}`,
              {
                params: { deleteData: false },
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
          } catch (error) {
            throw new HuaweiHealthError(
              'HUAWEI_DISCONNECT_FAILED',
              502,
              'Huawei authorization could not be canceled.',
              { cause: error }
            );
          }
        }
      }

      await repository.clearConnection(userId, authenticatedUserId);
    },
  };
}

const huaweiHealthOAuthService = createHuaweiHealthOAuthService({
  repository: huaweiHealthOAuthRepository,
  httpClient: axios,
  encryptValue: async (value) => {
    const encrypted = await encrypt(value, ENCRYPTION_KEY);
    if (!encrypted.encryptedText || !encrypted.iv || !encrypted.tag) {
      throw new Error('Token encryption failed.');
    }
    return encrypted as HuaweiHealthEncryptedValue;
  },
  decryptValue: (encryptedText, iv, tag) =>
    decrypt(encryptedText, iv, tag, ENCRYPTION_KEY),
  verifyIdToken: verifyHuaweiIdToken,
  randomHex: () => crypto.randomBytes(32).toString('hex'),
  now: () => new Date(),
});

export default huaweiHealthOAuthService;
