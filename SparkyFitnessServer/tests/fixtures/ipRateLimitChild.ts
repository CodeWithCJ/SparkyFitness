/**
 * One server instance for ipRateLimit.integration.test.ts: a POST /limited
 * route behind makeIpRateLimit('limited', max, windowMs), as the auth routes use it.
 * Prints `READY <port>` once listening.
 *
 * Usage: ipRateLimitChild.ts <max> <windowMs>
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { makeIpRateLimit } from '../../middleware/ipRateLimit.js';

const [max, windowMs] = process.argv.slice(2).map(Number) as [number, number];

const app = express();
app.set('trust proxy', true);
app.post('/limited', makeIpRateLimit('limited', max, windowMs), (_req, res) => {
  res.json({ ok: true, pid: process.pid });
});
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message });
});

const server = app.listen(0, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  process.stdout.write(`READY ${port}\n`);
});
