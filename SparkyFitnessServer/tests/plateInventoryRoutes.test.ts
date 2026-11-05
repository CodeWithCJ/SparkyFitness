import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import plateInventoryRoutes from '../routes/v2/plateInventoryRoutes.js';
import * as plateRepo from '../models/plateInventoryRepository.js';
import { PLATE_PRESETS } from '@workspace/shared';

vi.mock('../models/plateInventoryRepository.js', () => ({
  getPlateInventory: vi.fn(),
  savePlateInventory: vi.fn(),
  deletePlateInventory: vi.fn(),
  listGyms: vi.fn(),
  createGym: vi.fn(),
  activateGym: vi.fn(),
  deleteGym: vi.fn(),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/plate-inventory', plateInventoryRoutes);
app.use(errorHandler);

// A delegate: the signed-in person differs from the account being acted on.
const delegateApp = express();
delegateApp.use(express.json());
delegateApp.use((req, _res, next) => {
  req.originalUserId = 'delegate-user-id';
  next();
});
delegateApp.use('/api/v2/plate-inventory', plateInventoryRoutes);
delegateApp.use(errorHandler);

const kg = PLATE_PRESETS.kg;
const validBody = () => ({
  weight_unit: 'kg',
  bars: kg.bars.map((bar, i) => ({ ...bar, id: `bar-${i}` })),
  plates: kg.plates,
  collars_enabled: true,
  collar_weight: kg.collarWeight,
});

describe('Plate inventory routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a delegate with a message about plates, not account linking', async () => {
    const res = await request(delegateApp).get('/api/v2/plate-inventory');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/plates and bars/);
    expect(res.body.error).not.toMatch(/account linking/);
    expect(plateRepo.getPlateInventory).not.toHaveBeenCalled();
  });

  it('returns a null inventory until one is saved', async () => {
    vi.mocked(plateRepo.getPlateInventory).mockResolvedValue(null);
    const res = await request(app).get('/api/v2/plate-inventory');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ inventory: null });
    expect(plateRepo.getPlateInventory).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('saves a valid inventory', async () => {
    vi.mocked(plateRepo.savePlateInventory).mockResolvedValue({
      id: 'inv-1',
      user_id: 'test-user-id',
      ...validBody(),
      created_at: '2026-10-24T00:00:00.000Z',
      updated_at: '2026-10-24T00:00:00.000Z',
    } as Awaited<ReturnType<typeof plateRepo.savePlateInventory>>);
    const res = await request(app)
      .put('/api/v2/plate-inventory')
      .send(validBody());
    expect(res.statusCode).toBe(200);
    expect(plateRepo.savePlateInventory).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ weight_unit: 'kg', collars_enabled: true }),
      'test-user-id'
    );
  });

  it('accepts odd plates with up to three decimals', async () => {
    vi.mocked(plateRepo.savePlateInventory).mockResolvedValue(
      {} as Awaited<ReturnType<typeof plateRepo.savePlateInventory>>
    );
    const body = validBody();
    body.plates = [...body.plates, { weight: 0.25, pairs: 1 }];
    body.plates.push({ weight: 0.125, pairs: 1 });
    const res = await request(app).put('/api/v2/plate-inventory').send(body);
    expect(res.statusCode).toBe(200);
  });

  it.each([
    [
      'an unknown unit',
      (b: ReturnType<typeof validBody>) => ({ ...b, weight_unit: 'st' }),
    ],
    ['no bars', (b: ReturnType<typeof validBody>) => ({ ...b, bars: [] })],
    [
      'a plate with too many decimals',
      (b: ReturnType<typeof validBody>) => ({
        ...b,
        plates: [{ weight: 1.2345, pairs: 1 }],
      }),
    ],
    [
      'a negative number of pairs',
      (b: ReturnType<typeof validBody>) => ({
        ...b,
        plates: [{ weight: 5, pairs: -1 }],
      }),
    ],
    [
      'a plate weight listed twice',
      (b: ReturnType<typeof validBody>) => ({
        ...b,
        plates: [
          { weight: 5, pairs: 1 },
          { weight: 5, pairs: 2 },
        ],
      }),
    ],
    [
      'duplicate bar ids',
      (b: ReturnType<typeof validBody>) => ({
        ...b,
        bars: [b.bars[0]!, { ...b.bars[1]!, id: b.bars[0]!.id }],
      }),
    ],
    [
      'more pairs than the limit',
      (b: ReturnType<typeof validBody>) => ({
        ...b,
        plates: [{ weight: 5, pairs: 21 }],
      }),
    ],
  ])('rejects %s', async (_name, mutate) => {
    const res = await request(app)
      .put('/api/v2/plate-inventory')
      .send(mutate(validBody()));
    expect(res.statusCode).toBe(400);
    expect(plateRepo.savePlateInventory).not.toHaveBeenCalled();
  });

  it('removes the inventory, and 404s when there is none', async () => {
    vi.mocked(plateRepo.deletePlateInventory).mockResolvedValueOnce(true);
    const ok = await request(app).delete('/api/v2/plate-inventory');
    expect(ok.statusCode).toBe(200);
    vi.mocked(plateRepo.deletePlateInventory).mockResolvedValueOnce(false);
    const missing = await request(app).delete('/api/v2/plate-inventory');
    expect(missing.statusCode).toBe(404);
  });

  describe('gyms', () => {
    const gymId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    it('lists gyms', async () => {
      vi.mocked(plateRepo.listGyms).mockResolvedValue([]);
      const res = await request(app).get('/api/v2/plate-inventory/gyms');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ gyms: [] });
    });

    it('creates a gym, and rejects a bad body', async () => {
      vi.mocked(plateRepo.createGym).mockResolvedValue({
        id: gymId,
      } as Awaited<ReturnType<typeof plateRepo.createGym>>);
      const res = await request(app)
        .post('/api/v2/plate-inventory/gyms')
        .send({
          name: 'Work',
          weight_unit: 'kg',
          bars: [{ id: 'b1', name: null, kind: 'barbell', weight: 20 }],
          plates: [],
          dumbbells: [10, 5, 5],
          collars_enabled: false,
          collar_weight: 0,
        });
      expect(res.status).toBe(201);
      expect(
        vi.mocked(plateRepo.createGym).mock.calls[0]![1].dumbbells
      ).toEqual([5, 10]);
      const bad = await request(app)
        .post('/api/v2/plate-inventory/gyms')
        .send({ name: 'x' });
      expect(bad.status).toBe(400);
    });

    it('activates a gym, and 404s for an unknown or malformed id', async () => {
      vi.mocked(plateRepo.activateGym).mockResolvedValueOnce({
        id: gymId,
      } as Awaited<ReturnType<typeof plateRepo.activateGym>>);
      expect(
        (
          await request(app).put(
            `/api/v2/plate-inventory/gyms/${gymId}/activate`
          )
        ).status
      ).toBe(200);
      vi.mocked(plateRepo.activateGym).mockResolvedValueOnce(null);
      expect(
        (
          await request(app).put(
            `/api/v2/plate-inventory/gyms/${gymId}/activate`
          )
        ).status
      ).toBe(404);
      expect(
        (await request(app).put('/api/v2/plate-inventory/gyms/nope/activate'))
          .status
      ).toBe(404);
      expect(plateRepo.activateGym).toHaveBeenCalledTimes(2);
    });

    it('deletes a gym', async () => {
      vi.mocked(plateRepo.deleteGym).mockResolvedValueOnce(true);
      expect(
        (await request(app).delete(`/api/v2/plate-inventory/gyms/${gymId}`))
          .status
      ).toBe(200);
      vi.mocked(plateRepo.deleteGym).mockResolvedValueOnce(false);
      expect(
        (await request(app).delete(`/api/v2/plate-inventory/gyms/${gymId}`))
          .status
      ).toBe(404);
    });
  });
});
