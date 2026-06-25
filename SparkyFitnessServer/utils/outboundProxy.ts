import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { log } from '../config/logging.js';

interface ProxyAgentPair {
  http: HttpProxyAgent<string>;
  https: HttpsProxyAgent<string>;
}

// Agents own connection pools, so reuse one pair per proxy URL.
const agentCache = new Map<string, ProxyAgentPair>();

function agentsFor(proxyUrl: string): ProxyAgentPair {
  let agents = agentCache.get(proxyUrl);
  if (!agents) {
    agents = {
      http: new HttpProxyAgent(proxyUrl),
      https: new HttpsProxyAgent(proxyUrl),
    };
    agentCache.set(proxyUrl, agents);
  }
  return agents;
}

function redactProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '<unparseable proxy URL>';
  }
}

/**
 * Routes the server's outbound HTTP(S) requests through the proxy named by
 * the standard HTTP_PROXY / HTTPS_PROXY / NO_PROXY environment variables.
 * No-op when none are set. Must run after the environment is loaded and
 * before any outbound request is made.
 */
function configureOutboundProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxyUrl) {
    return;
  }

  // Native fetch: undici's env-aware dispatcher honors HTTP(S)_PROXY and
  // NO_PROXY per request and tunnels HTTPS targets via CONNECT.
  const dispatcher = new EnvHttpProxyAgent();
  setGlobalDispatcher(dispatcher);

  // Set the dispatcher on global symbols to ensure Node's native fetch (which uses internal undici) respects it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  g[Symbol.for('undici.globalDispatcher.1')] = dispatcher;
  g[Symbol.for('undici.globalDispatcher.2')] = dispatcher;

  // Axios: its built-in proxy handling cannot tunnel HTTPS targets, so
  // disable it and attach CONNECT-capable agents per request instead.
  // getProxyForUrl returns '' for NO_PROXY matches, leaving those direct.
  axios.defaults.proxy = false;
  axios.interceptors.request.use((config) => {
    const requestProxy = getProxyForUrl(axios.getUri(config));
    if (requestProxy) {
      const agents = agentsFor(requestProxy);
      config.httpAgent = agents.http;
      config.httpsAgent = agents.https;
    }
    return config;
  });

  log('info', `Outbound proxy enabled via ${redactProxyUrl(proxyUrl)}`);
}

export { configureOutboundProxy };
