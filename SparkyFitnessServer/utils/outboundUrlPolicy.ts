import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import undici from 'undici';

const { Agent, buildConnector } = undici;

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

export interface AiNetworkPolicy {
  allowPrivateNetwork: boolean;
  reason: 'admin' | 'global' | 'env' | 'public-only';
}

interface AiServicePolicySource {
  is_public?: boolean | null;
  source?: string | null;
}

interface LookupAddress {
  address: string;
  family: number;
}

export class OutboundUrlBlockedError extends Error {
  statusCode = 403;
  code = 'private_network_forbidden';

  constructor(
    message = 'Private or internal AI service URLs are not allowed. To allow connections to local services (e.g., local Ollama), set ALLOW_PRIVATE_NETWORK_AI=true in your server environment configuration.'
  ) {
    super(message);
    this.name = 'OutboundUrlBlockedError';
  }
}

// A URL fetch could never use regardless of trust (malformed, wrong scheme,
// embedded credentials) — bad input (400), not a network-policy denial (403).
export class OutboundUrlShapeError extends Error {
  statusCode = 400;
  code = 'invalid_outbound_url';

  constructor(message: string) {
    super(message);
    this.name = 'OutboundUrlShapeError';
  }
}

export const PUBLIC_ONLY_AI_NETWORK_POLICY: AiNetworkPolicy = {
  allowPrivateNetwork: false,
  reason: 'public-only',
};

export function requiresUserSuppliedAiUrl(serviceType: string): boolean {
  return (
    serviceType === 'ollama' ||
    serviceType === 'openai_compatible' ||
    serviceType === 'custom'
  );
}

export function deriveAiNetworkPolicy(
  aiService: AiServicePolicySource | null | undefined,
  isAdmin: boolean
): AiNetworkPolicy {
  if (isAdmin) {
    return { allowPrivateNetwork: true, reason: 'admin' };
  }
  if (aiService?.is_public || aiService?.source === 'global') {
    return { allowPrivateNetwork: true, reason: 'global' };
  }
  if (process.env.ALLOW_PRIVATE_NETWORK_AI === 'true') {
    return { allowPrivateNetwork: true, reason: 'env' };
  }
  return PUBLIC_ONLY_AI_NETWORK_POLICY;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIp(hostname: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  try {
    return ipaddr.parse(stripIpv6Brackets(hostname));
  } catch {
    return null;
  }
}

function publicAddressError(address: string): OutboundUrlBlockedError {
  return new OutboundUrlBlockedError(
    `AI service URL resolves to a private or internal address (${address}).`
  );
}

export function isPublicIpAddress(address: string): boolean {
  let parsed = parseIp(address);
  if (!parsed) return false;

  if (
    parsed.kind() === 'ipv6' &&
    'isIPv4MappedAddress' in parsed &&
    parsed.isIPv4MappedAddress()
  ) {
    parsed = parsed.toIPv4Address();
  }

  return parsed.range() === 'unicast';
}

export function parseOutboundHttpUrl(urlString: unknown): URL {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    throw new OutboundUrlShapeError('AI service URL is required.');
  }

  let url: URL;
  try {
    url = new URL(urlString.trim());
  } catch {
    throw new OutboundUrlShapeError('AI service URL is malformed.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlShapeError('AI service URL must use http or https.');
  }

  if (url.username || url.password) {
    throw new OutboundUrlShapeError(
      'AI service URL must not include embedded credentials.'
    );
  }

  return url;
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dns.lookup(hostname, { all: true, verbatim: false });
}

export async function resolveHostnameForOutboundConnection(
  hostname: string,
  policy: AiNetworkPolicy,
  lookup: (hostname: string) => Promise<LookupAddress[]> = defaultLookup
): Promise<string> {
  const normalizedHostname = stripIpv6Brackets(hostname.toLowerCase());

  if (policy.allowPrivateNetwork) {
    return normalizedHostname;
  }

  const literalIp = parseIp(normalizedHostname);
  if (literalIp) {
    if (!isPublicIpAddress(normalizedHostname)) {
      throw publicAddressError(normalizedHostname);
    }
    return normalizedHostname;
  }

  const addresses = await lookup(normalizedHostname);
  if (!addresses.length) {
    throw new OutboundUrlBlockedError(
      'AI service URL hostname did not resolve.'
    );
  }

  for (const { address } of addresses) {
    if (!isPublicIpAddress(address)) {
      throw publicAddressError(address);
    }
  }

  return addresses[0].address;
}

export function assertOutboundUrlShapeAndLiteralAllowed(
  urlString: unknown,
  policy: AiNetworkPolicy
): URL {
  const url = parseOutboundHttpUrl(urlString);
  assertLiteralHostnameAllowed(url.hostname, policy);
  return url;
}

function assertLiteralHostnameAllowed(
  hostname: string,
  policy: AiNetworkPolicy
): void {
  if (policy.allowPrivateNetwork) return;
  hostname = stripIpv6Brackets(hostname.toLowerCase());
  if (hostname === 'localhost' || hostname === 'localhost.') {
    throw publicAddressError(hostname);
  }
  const literalIp = parseIp(hostname);
  if (literalIp && !isPublicIpAddress(hostname)) {
    throw publicAddressError(hostname);
  }
}

function createGuardedLookup(policy: AiNetworkPolicy): net.LookupFunction {
  return (hostname, options, callback) => {
    resolveHostnameForOutboundConnection(hostname, policy)
      .then((address) => {
        const family = net.isIP(address);
        if (options.all) {
          callback(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      })
      .catch((error) => {
        callback(
          error instanceof Error
            ? error
            : new OutboundUrlBlockedError(String(error)),
          '',
          0
        );
      });
  };
}

export function createGuardedDispatcher(
  policy: AiNetworkPolicy,
  agentOptions: Record<string, unknown> = {}
) {
  const requestedConnectTimeout = agentOptions.connectTimeout;
  const connectTimeout =
    typeof requestedConnectTimeout === 'number' &&
    Number.isFinite(requestedConnectTimeout) &&
    requestedConnectTimeout > 0
      ? requestedConnectTimeout
      : DEFAULT_CONNECT_TIMEOUT_MS;
  const standardConnector = buildConnector({
    timeout: connectTimeout,
    ...(policy.allowPrivateNetwork
      ? {}
      : { lookup: createGuardedLookup(policy) }),
  });

  return new Agent({
    ...agentOptions,
    connect(options, callback): void {
      try {
        // net/tls bypass their lookup hook for literal IPs, so enforce the same
        // literal-address rule before delegating to Undici's connector.
        assertLiteralHostnameAllowed(options.hostname, policy);
        standardConnector(options, callback);
      } catch (error) {
        callback(
          error instanceof Error
            ? error
            : new OutboundUrlBlockedError(String(error)),
          null
        );
      }
    },
  });
}

// Dispatcher behavior depends only on `allowPrivateNetwork` (the lookup guard
// and the literal check read nothing else from the policy), so two
// process-lifetime agents cover every policy. Sharing them restores connection
// reuse instead of paying a fresh Agent and socket pool per AI request.
const sharedGuardedDispatchers = new Map<
  boolean,
  ReturnType<typeof createGuardedDispatcher>
>();

function sharedGuardedDispatcher(policy: AiNetworkPolicy) {
  let dispatcher = sharedGuardedDispatchers.get(policy.allowPrivateNetwork);
  if (!dispatcher) {
    dispatcher = createGuardedDispatcher(policy);
    sharedGuardedDispatchers.set(policy.allowPrivateNetwork, dispatcher);
  }
  return dispatcher;
}

export function createGuardedFetch(policy: AiNetworkPolicy): typeof fetch {
  const dispatcher = sharedGuardedDispatcher(policy);
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);

    assertOutboundUrlShapeAndLiteralAllowed(url, policy);

    return fetch(input, {
      ...init,
      redirect: 'manual',
      // Undici-specific option supported by Node's fetch implementation.
      dispatcher,
    } as RequestInit & { dispatcher: unknown });
  }) as typeof fetch;
}

export function isOutboundUrlBlockedError(error: unknown): boolean {
  return getOutboundUrlBlockedError(error) !== null;
}

export function getOutboundUrlBlockedError(
  error: unknown
): OutboundUrlBlockedError | null {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === 'object' && current !== null) {
    if (current instanceof OutboundUrlBlockedError) return current;
    if (seen.has(current)) return null;
    seen.add(current);

    if (!('cause' in current)) return null;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}
