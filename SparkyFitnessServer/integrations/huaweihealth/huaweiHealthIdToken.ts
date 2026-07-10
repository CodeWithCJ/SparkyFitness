import axios from 'axios';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod/v4';
import {
  HUAWEI_OPENID_CONFIGURATION_URL,
  HUAWEI_HTTP_TIMEOUT_MS,
  type HuaweiHealthConfig,
} from './huaweiHealthConfig.js';
import { HuaweiHealthError } from './huaweiHealthErrors.js';

const openIdConfigurationSchema = z.object({
  issuer: z.url(),
  jwks_uri: z.url(),
});

const remoteJwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function assertHuaweiHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'huawei.com' && !url.hostname.endsWith('.huawei.com'))
  ) {
    throw new HuaweiHealthError(
      'HUAWEI_ID_TOKEN_INVALID',
      502,
      'Huawei OpenID metadata returned an untrusted URL.'
    );
  }
  return url;
}

export async function verifyHuaweiIdToken(
  idToken: string,
  config: HuaweiHealthConfig,
  expectedNonce: string
): Promise<{ sub: string }> {
  try {
    const discoveryResponse = await axios.get(HUAWEI_OPENID_CONFIGURATION_URL, {
      timeout: HUAWEI_HTTP_TIMEOUT_MS,
    });
    const discovery = openIdConfigurationSchema.parse(discoveryResponse.data);
    assertHuaweiHttpsUrl(discovery.issuer);
    const jwksUrl = assertHuaweiHttpsUrl(discovery.jwks_uri);
    let jwks = remoteJwkSets.get(jwksUrl.href);
    if (!jwks) {
      jwks = createRemoteJWKSet(jwksUrl);
      remoteJwkSets.set(jwksUrl.href, jwks);
    }

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: discovery.issuer,
      audience: config.clientId,
    });
    if (payload.nonce !== expectedNonce || typeof payload.sub !== 'string') {
      throw new Error('Huawei ID token nonce or subject is invalid.');
    }
    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof HuaweiHealthError) throw error;
    throw new HuaweiHealthError(
      'HUAWEI_ID_TOKEN_INVALID',
      502,
      'Huawei returned an invalid identity token.',
      { cause: error }
    );
  }
}
