import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
// @ts-expect-error TS(7016): supertest does not publish declarations in this workspace
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminRoutes from '../routes/adminRoutes.js';
import errorHandler from '../middleware/errorHandler.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { invalidateOpenFoodFactsSession } from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import { logAdminAction } from '../services/authService.js';

const ADMIN_ID = 'admin-1';
const ACTIVE_TARGET_ID = 'family-owner-2';
const PROVIDER_ID = 'provider-1';
type StoredExternalProvider = NonNullable<
  Awaited<
    ReturnType<typeof externalProviderRepository.getExternalDataProviderById>
  >
>;

function makeStoredProvider(
  overrides: Partial<StoredExternalProvider>
): StoredExternalProvider {
  return {
    id: PROVIDER_ID,
    provider_name: 'Global OFF',
    provider_type: 'openfoodfacts',
    user_id: ADMIN_ID,
    is_public: true,
    is_active: false,
    base_url: null,
    sync_frequency: 'manual',
    app_id: null,
    app_key: null,
    token_expires_at: null,
    external_user_id: null,
    garth_dump: null,
    is_strictly_private: false,
    categories: [],
    required_fields: [],
    field_labels: {},
    supports_barcode: true,
    ...overrides,
  };
}

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = ACTIVE_TARGET_ID;
    req.activeUserId = ACTIVE_TARGET_ID;
    req.authenticatedUserId = ADMIN_ID;
    next();
  },
  isAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../services/authService.js', () => ({
  default: {},
  logAdminAction: vi.fn(),
}));
vi.mock('../models/userRepository.js', () => ({ default: {} }));
vi.mock('../models/chatRepository.js', () => ({ default: {} }));
vi.mock('../models/externalProviderRepository.js');
vi.mock('../auth.js', () => ({ auth: { api: {} } }));
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  invalidateOpenFoodFactsSession: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/admin', adminRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    externalProviderRepository.getExternalProviderTypes
  ).mockResolvedValue([
    { id: 'openfoodfacts' },
    { id: 'fatsecret' },
    { id: 'usda' },
  ]);
  vi.mocked(
    externalProviderRepository.createGlobalExternalDataProvider
  ).mockResolvedValue({ id: PROVIDER_ID, provider_name: 'Global OFF' });
  vi.mocked(
    externalProviderRepository.updateGlobalExternalDataProvider
  ).mockResolvedValue({ id: PROVIDER_ID, provider_name: 'Global OFF' });
  vi.mocked(
    externalProviderRepository.deleteGlobalExternalDataProvider
  ).mockResolvedValue(true);
});

describe('admin global Open Food Facts provider credentials', () => {
  it('binds global provider ownership and audit attribution to the authenticated admin', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({
        provider_name: 'Global USDA',
        provider_type: 'usda',
        is_active: true,
      });

    expect(response.statusCode).toBe(201);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).toHaveBeenCalledWith(expect.objectContaining({ user_id: ADMIN_ID }));
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      null,
      'GLOBAL_PROVIDER_CREATED',
      expect.objectContaining({ providerId: PROVIDER_ID })
    );
  });

  it('attributes global provider updates and cache invalidation to the authenticated admin', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({ is_active: true, app_id: 'off-user', app_key: 'pw' })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_name: 'Updated Global OFF' });

    expect(response.statusCode).toBe(200);
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      ADMIN_ID,
      PROVIDER_ID
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      null,
      'GLOBAL_PROVIDER_UPDATED',
      expect.objectContaining({ providerId: PROVIDER_ID })
    );
  });

  it('attributes global provider deletion and cache invalidation to the authenticated admin', async () => {
    const response = await request(app).delete(
      `/admin/external-data-providers/global/${PROVIDER_ID}`
    );

    expect(response.statusCode).toBe(200);
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      ADMIN_ID,
      PROVIDER_ID
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      null,
      'GLOBAL_PROVIDER_DELETED',
      expect.objectContaining({ providerId: PROVIDER_ID })
    );
  });

  it('returns editable usernames without credential secrets or encrypted storage fields', async () => {
    vi.mocked(
      externalProviderRepository.getGlobalExternalDataProviders
    ).mockResolvedValue([
      {
        id: PROVIDER_ID,
        provider_name: 'Global OFF',
        provider_type: 'openfoodfacts',
        is_active: true,
        is_public: true,
        app_id: 'off-user',
        app_key: 'off-password',
        encrypted_app_id: 'encrypted-user',
        app_id_iv: 'user-iv',
        app_id_tag: 'user-tag',
        encrypted_app_key: 'encrypted-password',
        app_key_iv: 'password-iv',
        app_key_tag: 'password-tag',
        encrypted_access_token: 'encrypted-token',
        access_token_iv: 'token-iv',
        access_token_tag: 'token-tag',
      },
    ]);

    const response = await request(app).get(
      '/admin/external-data-providers/global'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: PROVIDER_ID,
        provider_type: 'openfoodfacts',
        app_id: 'off-user',
      }),
    ]);
    expect(response.body[0].app_key).toBeUndefined();
    expect(Object.keys(response.body[0])).not.toEqual(
      expect.arrayContaining([
        'encrypted_app_id',
        'app_id_iv',
        'app_id_tag',
        'encrypted_app_key',
        'app_key_iv',
        'app_key_tag',
        'encrypted_access_token',
        'access_token_iv',
        'access_token_tag',
      ])
    );
  });

  it('allows creating an active read-only OFF provider without credentials', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({
        provider_name: 'Global OFF',
        provider_type: 'openfoodfacts',
        is_active: true,
      });

    expect(response.statusCode).toBe(201);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: 'openfoodfacts',
        is_active: true,
        app_id: null,
        app_key: null,
      })
    );
  });

  it('allows creating an inactive OFF provider without credentials', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({
        provider_name: 'Global OFF',
        provider_type: 'openfoodfacts',
        is_active: false,
      });

    expect(response.statusCode).toBe(201);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: 'openfoodfacts',
        is_active: false,
        app_id: null,
        app_key: null,
      })
    );
  });

  it('allows activating an existing credential-less OFF provider for reads', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(makeStoredProvider({}));

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ is_active: true });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({ is_active: true })
    );
  });

  it("clears another provider type's credentials when switching an active row to read-only OFF", async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        provider_name: 'FatSecret',
        provider_type: 'fatsecret',
        is_active: true,
        app_id: 'fatsecret-client-id',
        app_key: 'fatsecret-client-secret',
      })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_type: 'openfoodfacts' });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({
        provider_type: 'openfoodfacts',
        app_id: null,
        app_key: null,
      })
    );
  });

  it('rejects a global OFF provider with only one credential field', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({
        provider_name: 'Incomplete Global OFF',
        provider_type: 'openfoodfacts',
        app_id: 'off-user',
        is_active: true,
      });

    expect(response.statusCode).toBe(400);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('clears old credentials when switching an inactive global row to credential-less OFF', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        provider_name: 'FatSecret',
        provider_type: 'fatsecret',
        app_id: 'fatsecret-client-id',
        app_key: 'fatsecret-client-secret',
      })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_type: 'openfoodfacts' });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({
        provider_type: 'openfoodfacts',
        app_id: null,
        app_key: null,
      })
    );
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      ADMIN_ID,
      PROVIDER_ID
    );
  });

  it('uses the complete post-update credential state for an active OFF row', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        is_active: true,
        app_id: 'off-user',
        app_key: 'off-password',
      })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_name: 'Renamed Global OFF' });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalled();
  });

  it('clears old OFF credentials when changing a global row to another provider without new credentials', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        is_active: true,
        app_id: 'old-off-user',
        app_key: 'old-off-password',
      })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_type: 'fatsecret' });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({
        provider_type: 'fatsecret',
        app_id: null,
        app_key: null,
      })
    );
  });

  it('replaces old OFF credentials with the complete pair supplied for a new global provider type', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        is_active: true,
        app_id: 'old-off-user',
        app_key: 'old-off-password',
      })
    );

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({
        provider_type: 'fatsecret',
        app_id: 'new-client-id',
        app_key: 'new-client-secret',
      });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({
        provider_type: 'fatsecret',
        app_id: 'new-client-id',
        app_key: 'new-client-secret',
      })
    );
  });
});
