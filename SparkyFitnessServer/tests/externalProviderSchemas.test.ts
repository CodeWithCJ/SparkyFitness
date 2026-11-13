import { MCP_SERVER_MAX_TOOLS } from '@workspace/shared';
import { describe, expect, it } from 'vitest';
import {
  CreateGlobalExternalDataProviderBodySchema,
  UpdateGlobalExternalDataProviderBodySchema,
} from '../schemas/externalProviderSchemas.js';

describe('CreateGlobalExternalDataProviderBodySchema', () => {
  it('accepts a valid payload and trims string fields', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: '  OpenFoodFacts  ',
      provider_type: '  openfoodfacts  ',
      app_id: 'abc',
      base_url: 'https://example.com',
      is_active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider_name).toBe('OpenFoodFacts');
      expect(result.data.provider_type).toBe('openfoodfacts');
      expect(result.data.is_active).toBe(true);
    }
  });

  it('rejects a missing provider_name', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_type: 'openfoodfacts',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.provider_name).toBeDefined();
    }
  });

  it('rejects an empty/whitespace provider_type', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: 'Test',
      provider_type: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.provider_type).toBeDefined();
    }
  });

  it('rejects a non-boolean is_active', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: 'Test',
      provider_type: 'openfoodfacts',
      is_active: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects provider-row Open Food Facts contribution settings', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: 'Test',
      provider_type: 'openfoodfacts',
      auto_contribute_openfoodfacts: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateGlobalExternalDataProviderBodySchema', () => {
  it('accepts a partial payload (all fields optional)', () => {
    const result = UpdateGlobalExternalDataProviderBodySchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty provider_type when it is provided', () => {
    const result = UpdateGlobalExternalDataProviderBodySchema.safeParse({
      provider_type: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('provider_options on global provider bodies', () => {
  const base = { provider_name: 'Tools', provider_type: 'mcp_server' };

  it('accepts allowed tools and trims their names', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      ...base,
      provider_options: {
        allowed_tools: [{ name: ' solve_shake ', fingerprint: 'a'.repeat(64) }],
        send_user_id: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider_options?.allowed_tools).toEqual([
        { name: 'solve_shake', fingerprint: 'a'.repeat(64) },
      ]);
    }
  });

  it.each([
    ['accepts as many tools as the cap', MCP_SERVER_MAX_TOOLS, true],
    ['refuses one tool more than the cap', MCP_SERVER_MAX_TOOLS + 1, false],
  ])('%s', (_name, count, accepted) => {
    const result = UpdateGlobalExternalDataProviderBodySchema.safeParse({
      provider_options: {
        allowed_tools: Array.from({ length: count }, (_, index) => ({
          name: `tool_${index}`,
          fingerprint: 'a'.repeat(64),
        })),
        send_user_id: false,
      },
    });
    expect(result.success).toBe(accepted);
  });

  it('refuses an unknown option, so a typo cannot pass as a setting', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      ...base,
      provider_options: {
        allowed_tools: [],
        send_user_id: false,
        allow_everything: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it('needs both options, so nothing is on by omission', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      ...base,
      provider_options: {
        allowed_tools: [{ name: 'solve_shake', fingerprint: 'a'.repeat(64) }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('MCP tool fingerprint validation', () => {
  const entry = { name: 'search', fingerprint: 'a'.repeat(64) };
  it.each(['', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)])(
    'rejects invalid fingerprints (%s)',
    (fingerprint) => {
      expect(
        UpdateGlobalExternalDataProviderBodySchema.safeParse({
          provider_options: {
            allowed_tools: [{ ...entry, fingerprint }],
            send_user_id: false,
          },
        }).success
      ).toBe(false);
    }
  );
  it('rejects duplicate names after trimming and unknown item fields', () => {
    for (const tools of [
      [entry, { ...entry, name: ' search ' }],
      [{ ...entry, extra: true }],
    ]) {
      expect(
        UpdateGlobalExternalDataProviderBodySchema.safeParse({
          provider_options: { allowed_tools: tools, send_user_id: false },
        }).success
      ).toBe(false);
    }
  });
});
