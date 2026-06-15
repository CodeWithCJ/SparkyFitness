import http from 'http';
import net from 'net';
import type { AddressInfo } from 'net';
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureOutboundProxy } from '../utils/outboundProxy.js';

// A local server standing in for an outbound target. NO_PROXY covers
// 127.0.0.1, so requests to it must bypass the proxy.
let targetServer: http.Server;
let targetPort: number;
const targetRequests: string[] = [];

// A local forward proxy: answers absolute-form GETs itself and pipes
// CONNECT tunnels to the target server regardless of the requested host,
// so no DNS resolution of the fake hostnames is involved.
let proxyServer: http.Server;
let proxyPort: number;
const proxyRequests: string[] = [];
const connectRequests: string[] = [];

beforeAll(async () => {
  targetServer = http.createServer((req, res) => {
    targetRequests.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ via: 'target' }));
  });
  await new Promise<void>((resolve) =>
    targetServer.listen(0, '127.0.0.1', resolve)
  );
  targetPort = (targetServer.address() as AddressInfo).port;

  proxyServer = http.createServer((req, res) => {
    proxyRequests.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ via: 'proxy' }));
  });
  proxyServer.on('connect', (req, clientSocket, head) => {
    connectRequests.push(`CONNECT ${req.url}`);
    const tunnel = net.connect(targetPort, '127.0.0.1', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      tunnel.write(head);
      clientSocket.pipe(tunnel);
      tunnel.pipe(clientSocket);
    });
    tunnel.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => tunnel.destroy());
  });
  await new Promise<void>((resolve) =>
    proxyServer.listen(0, '127.0.0.1', resolve)
  );
  proxyPort = (proxyServer.address() as AddressInfo).port;

  process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
  process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
  process.env.NO_PROXY = '127.0.0.1';
  configureOutboundProxy();
});

afterAll(async () => {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.NO_PROXY;
  proxyServer.closeAllConnections();
  targetServer.closeAllConnections();
  await new Promise((resolve) => proxyServer.close(resolve));
  await new Promise((resolve) => targetServer.close(resolve));
});

describe('configureOutboundProxy', () => {
  it('routes axios HTTP requests through the proxy', async () => {
    const response = await axios.get('http://proxied.test/axios-http');
    expect(response.data).toEqual({ via: 'proxy' });
    expect(proxyRequests).toContain('GET http://proxied.test/axios-http');
  });

  it('tunnels axios HTTPS requests through the proxy via CONNECT', async () => {
    // The tunnel leads to a plain-HTTP server, so the TLS handshake fails;
    // the assertion is that the request was routed as a CONNECT tunnel.
    await expect(
      axios.get('https://proxied.test/axios-https')
    ).rejects.toThrow();
    expect(connectRequests).toContain('CONNECT proxied.test:443');
  });

  it('routes native fetch requests through the proxy', async () => {
    const response = await fetch('http://proxied.test/fetch-http');
    expect(response.ok).toBe(true);
    // undici may use either absolute-form forwarding or a CONNECT tunnel.
    const viaAbsoluteForm = proxyRequests.includes(
      'GET http://proxied.test/fetch-http'
    );
    const viaConnect = connectRequests.includes('CONNECT proxied.test:80');
    expect(viaAbsoluteForm || viaConnect).toBe(true);
  });

  it('bypasses the proxy for NO_PROXY hosts with axios', async () => {
    const response = await axios.get(
      `http://127.0.0.1:${targetPort}/axios-direct`
    );
    expect(response.data).toEqual({ via: 'target' });
    expect(targetRequests).toContain('GET /axios-direct');
    expect(proxyRequests.join()).not.toContain('axios-direct');
  });

  it('bypasses the proxy for NO_PROXY hosts with native fetch', async () => {
    const response = await fetch(`http://127.0.0.1:${targetPort}/fetch-direct`);
    expect(await response.json()).toEqual({ via: 'target' });
    expect(targetRequests).toContain('GET /fetch-direct');
    expect(proxyRequests.join()).not.toContain('fetch-direct');
    expect(connectRequests.join()).not.toContain(`127.0.0.1:${targetPort}`);
  });
});
