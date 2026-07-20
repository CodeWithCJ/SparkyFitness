import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): no types for supertest
import request from 'supertest';
import express from 'express';

// Proves the switched-context permission gate is wired onto the Fitbit, Oura,
// Polar, Strava, and Withings integration routers (Google Health and Garmin
// have their own dedicated suites). The real middleware logic lives in
// checkPermissionMiddleware.test.ts; here we only assert the gate is attached
// and fails closed. When permission is denied the handler never runs, so the
// integration services are mocked as inert.
const { permissionState } = vi.hoisted(() => ({
  permissionState: { allow: true },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: (req: any, _res: any, next: any) => {
      req.userId = 'active-user';
      req.originalUserId = 'delegate';
      req.authenticatedUserId = 'delegate';
      next();
    },
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(
    () => (_req: any, res: any, next: any) =>
      permissionState.allow
        ? next()
        : res.status(403).json({ error: 'Forbidden' })
  ),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// Inert service mocks — handlers must not be reached on the denied path.
vi.mock('../integrations/fitbit/fitbitService.js', () => ({ default: {} }));
vi.mock('../services/fitbitService.js', () => ({ default: {} }));
vi.mock('../integrations/oura/ouraService.js', () => ({ default: {} }));
vi.mock('../services/ouraService.js', () => ({ default: {} }));
vi.mock('../integrations/polar/polarService.js', () => ({ default: {} }));
vi.mock('../services/polarService.js', () => ({ default: {} }));
vi.mock('../integrations/strava/stravaService.js', () => ({ default: {} }));
vi.mock('../services/stravaService.js', () => ({ default: {} }));
vi.mock('../integrations/withings/withingsService.js', () => ({ default: {} }));
vi.mock('../services/withingsService.js', () => ({ default: {} }));

import fitbitRoutes from '../routes/fitbitRoutes.js';
import ouraRoutes from '../routes/ouraRoutes.js';
import polarRoutes from '../routes/polarRoutes.js';
import stravaRoutes from '../routes/stravaRoutes.js';
import withingsRoutes from '../routes/withingsRoutes.js';

function appWith(mountPath: string, router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

const cases: Array<[string, express.Router]> = [
  ['/fitbit', fitbitRoutes],
  ['/oura', ouraRoutes],
  ['/polar', polarRoutes],
  ['/strava', stravaRoutes],
  ['/withings', withingsRoutes],
];

beforeEach(() => {
  permissionState.allow = true;
});

describe('integration routers reject switched-context delegates lacking diary access', () => {
  for (const [mount, router] of cases) {
    it(`${mount} POST /disconnect returns 403 when permission is denied`, async () => {
      permissionState.allow = false;
      const app = appWith(mount, router);
      const res = await request(app).post(`${mount}/disconnect`).send({});
      expect(res.statusCode).toBe(403);
    });

    it(`${mount} POST /sync returns 403 when permission is denied`, async () => {
      permissionState.allow = false;
      const app = appWith(mount, router);
      const res = await request(app).post(`${mount}/sync`).send({});
      expect(res.statusCode).toBe(403);
    });
  }
});
