import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/externalProviderService.js', () => ({
  default: {
    getExternalDataProviders: vi.fn(),
    getExternalProviderTypes: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import externalProviderService from '../services/externalProviderService.js';
import { buildIntegrationsTools } from '../ai/tools/integrationsTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = externalProviderService as unknown as {
  getExternalDataProviders: ReturnType<typeof vi.fn>;
  getExternalProviderTypes: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildIntegrationsTools('user-1', 'UTC');
  return tools.sparky_get_integrations;
}

describe('sparky_get_integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists connected providers (inferred default action from {})', async () => {
    svc.getExternalDataProviders.mockResolvedValue([
      {
        id: 'p1',
        provider_name: 'Garmin',
        provider_type: 'garmin',
        is_active: true,
        visibility: 'private',
        has_token: true,
        sync_frequency: 'hourly',
      },
      {
        id: 'p2',
        provider_name: 'Yazio',
        provider_type: 'yazio',
        is_active: false,
        visibility: 'private',
        has_token: false,
        sync_frequency: null,
        availability_error: 'Provider is not configured on this server.',
      },
    ]);

    const result = await getTool().execute!({}, opts);

    expect(svc.getExternalDataProviders).toHaveBeenCalledWith('user-1');
    expect(result).toBe(
      '# Connected Integrations\n\n' +
        '**Garmin** (garmin) — active, private, token stored — sync: hourly\n  ID: p1\n\n' +
        '**Yazio** (yazio) — inactive, private\n  ⚠ Provider is not configured on this server.\n  ID: p2'
    );
  });

  it('renders no providers found', async () => {
    svc.getExternalDataProviders.mockResolvedValue([]);
    const result = await getTool().execute!({ action: 'list_providers' }, opts);
    expect(result).toBe('# Connected Integrations\n\nNo results found.');
  });

  it('lists available provider types', async () => {
    svc.getExternalProviderTypes.mockResolvedValue([
      {
        id: 'garmin',
        display_name: 'Garmin Connect',
        description: 'Sync activities and health data.',
        categories: ['fitness', 'health'],
        supports_barcode: false,
      },
      {
        id: 'openfoodfacts',
        display_name: 'Open Food Facts',
        supports_barcode: true,
      },
    ]);

    const result = await getTool().execute!(
      { action: 'list_provider_types' },
      opts
    );

    expect(svc.getExternalProviderTypes).toHaveBeenCalled();
    expect(result).toBe(
      '# Available Integration Types\n\n' +
        '**Garmin Connect** (garmin) — Sync activities and health data. — categories: fitness, health\n\n' +
        '**Open Food Facts** (openfoodfacts) — supports barcode'
    );
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getExternalDataProviders.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!({ action: 'list_providers' }, opts);
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
