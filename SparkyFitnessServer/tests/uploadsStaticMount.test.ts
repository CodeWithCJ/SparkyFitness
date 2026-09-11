import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the public /uploads static mounts (SparkyFitnessServer.ts).
 *
 * Sensitive photo subtrees must never be reachable without authentication:
 * check-in progress photos and pregnancy bump photos are both served only by
 * their owner-checked routes. SparkyFitnessServer.ts cannot be imported (it has
 * no exports and opens a DB connection and a listener at module scope), so the
 * mount block is reconstructed here, and a separate source-order assertion
 * below checks the real file still has the deny rule in front of the static
 * mounts.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let uploadsRoot: string;

const uploadsSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'attachment',
};

const SENSITIVE_UPLOAD_SUBTREES = new Set(['check-in', 'pregnancy']);

function buildApp() {
  const app = express();
  app.use(['/uploads', '/api/uploads'], (req, res, next) => {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      res.status(400).end();
      return;
    }
    const normalized = path.posix.normalize(decodedPath.replace(/\\/g, '/'));
    const firstSegment = normalized
      .split('/')
      .filter(Boolean)[0]
      ?.toLowerCase();
    if (firstSegment && SENSITIVE_UPLOAD_SUBTREES.has(firstSegment)) {
      res.status(404).end();
      return;
    }
    next();
  });
  const options = {
    etag: false,
    lastModified: false,
    maxAge: '7d',
    immutable: true,
    setHeaders: (res: express.Response) => {
      for (const [name, value] of Object.entries(uploadsSecurityHeaders)) {
        res.setHeader(name, value);
      }
    },
  };
  app.use('/api/uploads', express.static(uploadsRoot, options));
  app.use('/uploads', express.static(uploadsRoot, options));
  return app;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function seed(relativePath: string) {
  const absolute = path.join(uploadsRoot, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, PNG);
}

beforeAll(async () => {
  uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sparky-uploads-'));
  await seed('pregnancy/user-1/preg-1/w12-1700000000000.png');
  await seed('check-in/user-1/2026-01-01/front.png');
  await seed('exercises/ex-1/image.png');
});

afterAll(async () => {
  await fs.rm(uploadsRoot, { recursive: true, force: true });
});

describe('public uploads static mounts', () => {
  it.each([
    '/uploads/pregnancy/user-1/preg-1/w12-1700000000000.png',
    '/api/uploads/pregnancy/user-1/preg-1/w12-1700000000000.png',
  ])('denies unauthenticated pregnancy bump photos via %s', async (url) => {
    const res = await request(buildApp()).get(url);
    expect(res.status).toBe(404);
  });

  it.each([
    '/uploads/check-in/user-1/2026-01-01/front.png',
    '/api/uploads/check-in/user-1/2026-01-01/front.png',
  ])('denies unauthenticated check-in photos via %s', async (url) => {
    const res = await request(buildApp()).get(url);
    expect(res.status).toBe(404);
  });

  it('denies a case-variant path (Express routing is case-insensitive)', async () => {
    const res = await request(buildApp()).get(
      '/uploads/Pregnancy/user-1/preg-1/w12-1700000000000.png'
    );
    expect(res.status).toBe(404);
  });

  // These URLs do not begin with a protected prefix, but serve-static decodes
  // and normalizes them into one. The guard must therefore test the resolved
  // path, not the literal URL.
  it.each([
    '/uploads/exercises/..%2fpregnancy/user-1/preg-1/w12-1700000000000.png',
    '/api/uploads/exercises/..%2fpregnancy/user-1/preg-1/w12-1700000000000.png',
    '/uploads/exercises/..%2fcheck-in/user-1/2026-01-01/front.png',
    '/api/uploads/exercises/..%2fcheck-in/user-1/2026-01-01/front.png',
  ])(
    'denies an encoded traversal into a sensitive subtree via %s',
    async (url) => {
      const res = await request(buildApp()).get(url);
      expect(res.status).toBe(404);
    }
  );

  it('still serves genuinely public uploads', async () => {
    const res = await request(buildApp()).get(
      '/uploads/exercises/ex-1/image.png'
    );
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('SparkyFitnessServer.ts mount ordering', () => {
  // The deny rule only works because it is registered before express.static.
  // If this fails after a refactor, FIX THE ORDER (or update the anchors) —
  // do not delete the assertion: moving the deny rule below the static mounts
  // silently republishes every sensitive photo.
  it('registers the sensitive-subtree deny rule before the static mounts', async () => {
    const source = await fs.readFile(
      path.join(__dirname, '..', 'SparkyFitnessServer.ts'),
      'utf8'
    );
    const denyIndex = source.indexOf('SENSITIVE_UPLOAD_SUBTREES');
    const staticIndex = source.indexOf(
      'express.static(UPLOADS_BASE_DIR, uploadsStaticOptions)'
    );
    expect(denyIndex).toBeGreaterThan(-1);
    expect(staticIndex).toBeGreaterThan(-1);
    expect(denyIndex).toBeLessThan(staticIndex);
  });
});
