import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
// @ts-expect-error TS(7016): supertest does not publish declarations in this workspace
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderRoutes from '../routes/externalProviderRoutes.js';
import externalProviderService from '../services/externalProviderService.js';

const OWNER_ID = 'owner-1';
const DELEGATE_ID = 'delegate-2';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = OWNER_ID;
    req.activeUserId = OWNER_ID;
    req.authenticatedUserId = DELEGATE_ID;
    next();
  },
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: {
    getExternalDataProviders: vi.fn(),
    getExternalDataProvidersForUser: vi.fn(),
    createExternalDataProvider: vi.fn(),
    updateExternalDataProvider: vi.fn(),
    deleteExternalDataProvider: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/external-providers', externalProviderRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(externalProviderService.getExternalDataProviders).mockResolvedValue(
    []
  );
  vi.mocked(
    externalProviderService.getExternalDataProvidersForUser
  ).mockResolvedValue([]);
  vi.mocked(
    externalProviderService.createExternalDataProvider
  ).mockResolvedValue({ id: 'provider-1' });
  vi.mocked(
    externalProviderService.updateExternalDataProvider
  ).mockResolvedValue({ id: 'provider-1' });
  vi.mocked(
    externalProviderService.deleteExternalDataProvider
  ).mockResolvedValue(true);
});

describe('external provider list actor context', () => {
  it('passes the active target and logged-in actor separately to the default list', async () => {
    const response = await request(app).get('/external-providers');

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderService.getExternalDataProviders
    ).toHaveBeenCalledWith(OWNER_ID, DELEGATE_ID);
  });

  it('uses the logged-in actor as viewer for an explicit target list', async () => {
    const response = await request(app).get(
      `/external-providers/user/${OWNER_ID}`
    );

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderService.getExternalDataProvidersForUser
    ).toHaveBeenCalledWith(DELEGATE_ID, OWNER_ID);
  });

  it('creates personal providers only for the logged-in actor', async () => {
    const body = { provider_name: 'OFF', provider_type: 'openfoodfacts' };

    const response = await request(app).post('/external-providers').send(body);

    expect(response.statusCode).toBe(201);
    expect(
      externalProviderService.createExternalDataProvider
    ).toHaveBeenCalledWith(DELEGATE_ID, body);
  });

  it('updates providers only as the logged-in actor', async () => {
    const body = { provider_name: 'Updated' };

    const response = await request(app)
      .put('/external-providers/provider-1')
      .send(body);

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderService.updateExternalDataProvider
    ).toHaveBeenCalledWith(DELEGATE_ID, 'provider-1', body);
  });

  it('deletes providers only as the logged-in actor', async () => {
    const response = await request(app).delete(
      '/external-providers/provider-1'
    );

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderService.deleteExternalDataProvider
    ).toHaveBeenCalledWith(DELEGATE_ID, 'provider-1');
  });
});
