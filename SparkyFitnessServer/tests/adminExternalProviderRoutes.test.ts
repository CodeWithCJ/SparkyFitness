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
import {
  listToolsForAdmin,
  McpServerListError,
} from '../ai/tools/mcpServerTools.js';

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
    provider_options: null,
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
vi.mock('../ai/tools/mcpServerTools.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/tools/mcpServerTools.js')>()),
  listToolsForAdmin: vi.fn(),
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn().mockResolvedValue(true),
  resolveIsAdminByUserId: vi.fn().mockResolvedValue(true),
}));

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
    { id: 'mcp_server' },
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

describe('admin global MCP tool servers', () => {
  const body = {
    provider_name: 'Household tools',
    provider_type: 'mcp_server',
    base_url: 'http://192.168.1.20:8000/mcp',
  };
  const options = { allowed_tools: ['solve_shake'], send_user_id: true };

  it('adds a server with every tool blocked', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send(body);

    expect(response.statusCode).toBe(201);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_options: { allowed_tools: [], send_user_id: false },
      })
    );
  });

  it('saves the tools an admin allows', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(makeStoredProvider({ provider_type: 'mcp_server' }));

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_options: options });

    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({ provider_options: options })
    );
  });

  it.each([undefined, '', '   ', null])(
    'refuses saving a different URL without a token (%s)',
    async (app_key) => {
      vi.mocked(
        externalProviderRepository.getExternalDataProviderById
      ).mockResolvedValue(
        makeStoredProvider({
          provider_type: 'mcp_server',
          base_url: body.base_url,
          app_key: 'stored',
        })
      );
      const response = await request(app)
        .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
        .send({ base_url: 'http://192.168.1.21/mcp', app_key });
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe(
        'Enter the token again when you change the server URL.'
      );
      expect(
        externalProviderRepository.updateGlobalExternalDataProvider
      ).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      storedToken: 'stored',
      app_key: 'new',
      base_url: 'http://192.168.1.21/mcp',
      changed: true,
    },
    {
      storedToken: null,
      app_key: undefined,
      base_url: 'http://192.168.1.21/mcp',
      changed: true,
    },
    {
      storedToken: 'stored',
      app_key: undefined,
      base_url: ` ${body.base_url} `,
      changed: false,
    },
  ])(
    'saves a permitted URL update and resets only stale choices ($changed)',
    async ({ storedToken, app_key, base_url, changed }) => {
      vi.mocked(
        externalProviderRepository.getExternalDataProviderById
      ).mockResolvedValue(
        makeStoredProvider({
          provider_type: 'mcp_server',
          base_url: body.base_url,
          app_key: storedToken,
          provider_options: options,
        })
      );
      const response = await request(app)
        .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
        .send({ base_url, app_key });
      expect(response.statusCode).toBe(200);
      expect(
        externalProviderRepository.updateGlobalExternalDataProvider
      ).toHaveBeenCalledWith(
        PROVIDER_ID,
        expect.objectContaining({
          provider_options: changed
            ? { allowed_tools: [], send_user_id: true }
            : undefined,
        })
      );
    }
  );

  it('uses options explicitly supplied with a URL change', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        provider_type: 'mcp_server',
        base_url: body.base_url,
        app_key: 'stored',
        provider_options: options,
      })
    );
    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({
        base_url: 'http://192.168.1.21/mcp',
        app_key: 'new',
        provider_options: options,
      });
    expect(response.statusCode).toBe(200);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      expect.objectContaining({ provider_options: options })
    );
  });

  it('refuses a server with no URL', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({ ...body, base_url: undefined });

    expect(response.statusCode).toBe(400);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('refuses options on another provider', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/global')
      .send({
        provider_name: 'Global USDA',
        provider_type: 'usda',
        provider_options: options,
      });

    expect(response.statusCode).toBe(400);
    expect(
      externalProviderRepository.createGlobalExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('refuses turning a global provider into a tool server', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(makeStoredProvider({ provider_type: 'usda' }));

    const response = await request(app)
      .put(`/admin/external-data-providers/global/${PROVIDER_ID}`)
      .send({ provider_type: 'mcp_server' });

    expect(response.statusCode).toBe(400);
    expect(
      externalProviderRepository.updateGlobalExternalDataProvider
    ).not.toHaveBeenCalled();
  });
});

describe('listing an MCP tool server’s tools', () => {
  const SERVER_ID = '7f1d6c2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
  const listing = [
    { name: 'search', description: 'Searches notes.', problem: null },
  ];

  it('asks the server with the token the admin typed', async () => {
    vi.mocked(listToolsForAdmin).mockResolvedValue(listing);

    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ base_url: 'https://tools.example', app_key: 'typed' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ tools: listing });
    expect(listToolsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: ADMIN_ID,
        base_url: 'https://tools.example',
        app_key: 'typed',
      })
    );
  });

  it('uses the stored token of a saved server when none is typed', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        id: SERVER_ID,
        provider_type: 'mcp_server',
        app_key: 'stored',
        base_url: 'https://tools.example',
      })
    );
    vi.mocked(listToolsForAdmin).mockResolvedValue(listing);

    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ base_url: ' https://tools.example ', provider_id: SERVER_ID });

    expect(response.statusCode).toBe(200);
    expect(listToolsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ app_key: 'stored' })
    );
  });

  it.each([undefined, '', '   '])(
    'refuses loading a different URL with a stored token (%s)',
    async (app_key) => {
      vi.mocked(
        externalProviderRepository.getExternalDataProviderById
      ).mockResolvedValue(
        makeStoredProvider({
          id: SERVER_ID,
          provider_type: 'mcp_server',
          app_key: 'stored',
          base_url: 'https://saved.example',
        })
      );
      const response = await request(app)
        .post('/admin/external-data-providers/mcp-server/tools')
        .send({
          base_url: 'https://other.example',
          provider_id: SERVER_ID,
          app_key,
        });
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe(
        'Enter the token to load tools from a different URL.'
      );
      expect(listToolsForAdmin).not.toHaveBeenCalled();
    }
  );

  it.each(['typed', undefined])(
    'loads a different URL with a fresh token or no stored token (%s)',
    async (app_key) => {
      vi.mocked(
        externalProviderRepository.getExternalDataProviderById
      ).mockResolvedValue(
        makeStoredProvider({
          id: SERVER_ID,
          provider_type: 'mcp_server',
          app_key: app_key ? 'stored' : null,
          base_url: 'https://saved.example',
        })
      );
      vi.mocked(listToolsForAdmin).mockResolvedValue(listing);
      const response = await request(app)
        .post('/admin/external-data-providers/mcp-server/tools')
        .send({
          base_url: ' https://other.example ',
          provider_id: SERVER_ID,
          app_key,
        });
      expect(response.statusCode).toBe(200);
      expect(listToolsForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          base_url: 'https://other.example',
          app_key: app_key ?? null,
        })
      );
    }
  );

  it('will not use the stored key of another kind of provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({ id: SERVER_ID, app_key: 'usda-key' })
    );

    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ base_url: 'https://tools.example', provider_id: SERVER_ID });

    expect(response.statusCode).toBe(400);
    expect(listToolsForAdmin).not.toHaveBeenCalled();
  });

  it('will not use the stored token of a user’s own server', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue(
      makeStoredProvider({
        id: SERVER_ID,
        provider_type: 'mcp_server',
        app_key: 'private-token',
        is_public: false,
      })
    );

    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ base_url: 'https://tools.example', provider_id: SERVER_ID });

    expect(response.statusCode).toBe(400);
    expect(listToolsForAdmin).not.toHaveBeenCalled();
  });

  it('answers 502 with the reason when the server fails', async () => {
    vi.mocked(listToolsForAdmin).mockRejectedValue(
      new McpServerListError('The server did not list its tools: HTTP 401')
    );

    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ base_url: 'https://tools.example' });

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      error: 'The server did not list its tools: HTTP 401',
    });
  });

  it('refuses a request without a server URL', async () => {
    const response = await request(app)
      .post('/admin/external-data-providers/mcp-server/tools')
      .send({ app_key: 'typed' });

    expect(response.statusCode).toBe(400);
    expect(listToolsForAdmin).not.toHaveBeenCalled();
  });
});
