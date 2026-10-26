/**
 * A minimal HTTP server process for keepAliveDrain.test.ts with the real
 * shutdown handlers and the production keep-alive timeouts. Prints its port.
 *
 * GET /slow?ms=N answers after N ms; GET /stream?ms=N sends its headers at
 * once and ends the body after N ms; GET /large?bytes=N&ms=M sends its
 * headers at once and after M ms the whole N-byte body in one res.end(), which
 * a slow reader leaves sitting in the socket's write buffer; anything else
 * answers at once.
 */
import http from 'node:http';
import { installShutdownHandlers } from '../../utils/gracefulShutdown.js';

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const ms = Number(url.searchParams.get('ms') ?? 0);
  if (url.pathname === '/slow') {
    setTimeout(() => res.end('slow'), ms);
  } else if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('start ');
    setTimeout(() => res.end('end'), ms);
  } else if (url.pathname === '/large') {
    const body = Buffer.alloc(Number(url.searchParams.get('bytes')), 'x');
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': body.length,
    });
    res.flushHeaders();
    setTimeout(() => res.end(body), ms);
  } else {
    res.end('ok');
  }
});
server.keepAliveTimeout = 181000;
server.headersTimeout = 182000;
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
installShutdownHandlers(server);
const address = server.address();
process.stdout.write(
  `PORT ${typeof address === 'object' && address ? address.port : 0}\n`
);
