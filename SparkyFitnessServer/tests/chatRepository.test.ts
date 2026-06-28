import { vi, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { getClient } from '../db/poolManager.js';
import { decrypt } from '../security/encryption.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../security/encryption', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test-key',
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

describe('chatRepository.upsertAiServiceSetting', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  it('omitting model_name/custom_url/system_prompt sends undefined to SQL (documents why callers must send full payload)', async () => {
    // upsertAiServiceSetting has no COALESCE for model_name, custom_url, or system_prompt.
    // Sending a partial update (e.g. only is_active) will pass undefined for those params,
    // which PostgreSQL coerces to NULL — overwriting stored values.
    // This is why handleToggleActive in AIServiceSettings.tsx must send the full payload.
    mockClient.query.mockResolvedValue({ rows: [{ id: 'service-1' }] });

    await chatRepository.upsertAiServiceSetting({
      id: 'service-1',
      user_id: 'user-1',
      is_active: false,
    });

    const [, params] = mockClient.query.mock.calls[0];
    expect(params[2]).toBeUndefined(); // $3 → custom_url → becomes NULL without COALESCE
    expect(params[3]).toBeUndefined(); // $4 → system_prompt → becomes NULL without COALESCE
    expect(params[5]).toBeUndefined(); // $6 → model_name → becomes NULL without COALESCE
  });

  it('explicit null clears fields — intentional clearing still works via direct API', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: 'service-1', model_name: null }],
    });

    await chatRepository.upsertAiServiceSetting({
      id: 'service-1',
      user_id: 'user-1',
      service_name: 'My Service',
      service_type: 'openai',
      model_name: null,
      custom_url: null,
      system_prompt: null,
      is_active: true,
    });

    const [, params] = mockClient.query.mock.calls[0];
    expect(params[2]).toBeNull(); // $3 → custom_url explicitly cleared
    expect(params[3]).toBeNull(); // $4 → system_prompt explicitly cleared
    expect(params[5]).toBeNull(); // $6 → model_name explicitly cleared
  });
});

describe('chatRepository.getDecryptedAiServiceSettingById', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  it('selects by id WITHOUT the is_active filter so inactive services can be tested', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          service_type: 'openai',
          encrypted_api_key: 'enc',
          api_key_iv: 'iv',
          api_key_tag: 'tag',
          custom_url: null,
          model_name: 'gpt-4o',
          is_public: false,
          is_active: false,
        },
      ],
    });
    vi.mocked(decrypt).mockResolvedValue('decrypted-key');

    const result = await chatRepository.getDecryptedAiServiceSettingById(
      'svc-1',
      'user-1'
    );

    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).not.toContain('is_active');
    expect(params).toEqual(['svc-1']);
    // RLS scoping comes from the user-specific client.
    expect(getClient).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      service_type: 'openai',
      api_key: 'decrypted-key',
      custom_url: null,
      model_name: 'gpt-4o',
      is_public: false,
    });
  });

  it('returns null when no row is visible to the user', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await chatRepository.getDecryptedAiServiceSettingById(
      'missing',
      'user-1'
    );

    expect(result).toBeNull();
  });
});

describe('chatRepository.getChatHistoryByUserId', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  it('queries the most recent 50 messages and returns them chronologically', async () => {
    const mockRows = [
      {
        id: '1',
        content: 'hello',
        message_type: 'user',
        created_at: '2026-06-19T10:00:00Z',
      },
      {
        id: '2',
        content: 'hi',
        message_type: 'assistant',
        created_at: '2026-06-19T10:01:00Z',
      },
    ];
    mockClient.query.mockResolvedValue({ rows: mockRows });

    const result = await chatRepository.getChatHistoryByUserId('user-1');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT id, content, message_type, created_at, metadata, parts FROM (SELECT id, content, message_type, created_at, metadata, parts FROM sparky_chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50) sub ORDER BY created_at ASC',
      ['user-1']
    );
    expect(result).toEqual(mockRows);
  });
});

describe('chatRepository.getActiveVisionAiServiceSetting', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  const visionOverrideRow = () => ({
    id: 'vision-1',
    service_name: 'My Vision',
    service_type: 'google',
    custom_url: null,
    is_active: true,
    model_name: 'gemini-2.5-flash',
    is_public: false,
    system_prompt: null,
    user_id: 'user-1',
    creator_name: 'me',
  });
  const globalTextRow = () => ({
    id: 'global-text-1',
    service_name: 'Global Text',
    service_type: 'openai',
    custom_url: null,
    is_active: true,
    model_name: 'gpt-4o',
    is_public: true,
    system_prompt: null,
    user_id: null,
  });
  const globalVisionRow = () => ({
    id: 'global-vision-1',
    service_name: 'Global Vision',
    service_type: 'google',
    custom_url: null,
    is_active: true,
    model_name: 'gemini-2.5-flash',
    is_public: true,
    system_prompt: null,
    user_id: null,
  });

  const consultedGlobalVisionDefault = () =>
    mockClient.query.mock.calls.some(([sql]: [string]) =>
      sql.includes('default_vision_ai_service_id FROM global_settings')
    );

  it('returns the per-user vision override when its service is active', async () => {
    mockClient.query
      // outer combined-pointer read
      .mockResolvedValueOnce({
        rows: [
          {
            active_ai_service_id: null,
            active_vision_ai_service_id: 'vision-1',
          },
        ],
      })
      // step 1: the override service is active
      .mockResolvedValueOnce({ rows: [visionOverrideRow()] });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    expect(result.id).toBe('vision-1');
    expect(result.source).toBe('user');
    // The text resolver and global default are never consulted.
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('keeps the explicit text service and never applies the global vision default', async () => {
    mockClient.query
      // outer read: explicit text pointer, no vision override
      .mockResolvedValueOnce({
        rows: [
          {
            active_ai_service_id: 'global-text-1',
            active_vision_ai_service_id: null,
          },
        ],
      })
      // getActiveAiServiceSetting → Priority-0 prefs read
      .mockResolvedValueOnce({
        rows: [{ active_ai_service_id: 'global-text-1' }],
      })
      // getActiveAiServiceSetting → Priority-0 settings lookup (a global service)
      .mockResolvedValueOnce({ rows: [globalTextRow()] });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    expect(result.id).toBe('global-text-1');
    expect(result.source).toBe('global');
    // Even though the base resolved as a global service, the admin global
    // vision default must NOT override an explicit user pick.
    expect(consultedGlobalVisionDefault()).toBe(false);
  });

  it('applies the global vision default when the explicit text pick was deactivated and fell through', async () => {
    mockClient.query
      // outer read: explicit text pointer set, no vision override
      .mockResolvedValueOnce({
        rows: [
          {
            active_ai_service_id: 'dead-text-1',
            active_vision_ai_service_id: null,
          },
        ],
      })
      // getActiveAiServiceSetting → Priority-0 prefs read
      .mockResolvedValueOnce({
        rows: [{ active_ai_service_id: 'dead-text-1' }],
      })
      // Priority-0 settings lookup → the pointed service is inactive, no row
      .mockResolvedValueOnce({ rows: [] })
      // Priority-1 user-specific → none
      .mockResolvedValueOnce({ rows: [] })
      // Priority-2 global text default (the user has fallen through to it)
      .mockResolvedValueOnce({ rows: [globalTextRow()] })
      // step 3: the global default-vision pointer
      .mockResolvedValueOnce({
        rows: [{ default_vision_ai_service_id: 'global-vision-1' }],
      })
      // step 3: resolve the global vision service
      .mockResolvedValueOnce({ rows: [globalVisionRow()] });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    // The stale active_ai_service_id no longer resolved, so this user is now on
    // the global default and must get the configured global vision default —
    // not the text fallback.
    expect(result.id).toBe('global-vision-1');
    expect(result.source).toBe('global');
    expect(consultedGlobalVisionDefault()).toBe(true);
  });

  it('applies the admin global vision default for a user on the global default', async () => {
    mockClient.query
      // outer read: no pointers
      .mockResolvedValueOnce({
        rows: [
          { active_ai_service_id: null, active_vision_ai_service_id: null },
        ],
      })
      // getActiveAiServiceSetting → Priority-0 prefs read (no active id)
      .mockResolvedValueOnce({ rows: [{ active_ai_service_id: null }] })
      // Priority-1 user-specific → none
      .mockResolvedValueOnce({ rows: [] })
      // Priority-2 global text default
      .mockResolvedValueOnce({ rows: [globalTextRow()] })
      // step 3: the global default-vision pointer
      .mockResolvedValueOnce({
        rows: [{ default_vision_ai_service_id: 'global-vision-1' }],
      })
      // step 3: resolve the global vision service (is_active AND is_public)
      .mockResolvedValueOnce({ rows: [globalVisionRow()] });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    expect(result.id).toBe('global-vision-1');
    expect(result.source).toBe('global');
    expect(consultedGlobalVisionDefault()).toBe(true);
  });

  it('falls back to the text/default service unchanged when no vision pointers exist', async () => {
    mockClient.query
      // outer read: no pointers
      .mockResolvedValueOnce({
        rows: [
          { active_ai_service_id: null, active_vision_ai_service_id: null },
        ],
      })
      // getActiveAiServiceSetting → Priority-0 prefs read (no active id)
      .mockResolvedValueOnce({ rows: [{ active_ai_service_id: null }] })
      // Priority-1 user-specific → none
      .mockResolvedValueOnce({ rows: [] })
      // Priority-2 global text default
      .mockResolvedValueOnce({ rows: [globalTextRow()] })
      // step 3: no global default-vision pointer configured
      .mockResolvedValueOnce({
        rows: [{ default_vision_ai_service_id: null }],
      });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    // Identical to today's getActiveAiServiceSetting result.
    expect(result.id).toBe('global-text-1');
    expect(result.source).toBe('global');
  });

  it('returns null when there is no text/default service to fall back to', async () => {
    mockClient.query
      // outer read: no pointers
      .mockResolvedValueOnce({
        rows: [
          { active_ai_service_id: null, active_vision_ai_service_id: null },
        ],
      })
      // getActiveAiServiceSetting → Priority-0 prefs read (no active id)
      .mockResolvedValueOnce({ rows: [{ active_ai_service_id: null }] })
      // Priority-1 user-specific → none
      .mockResolvedValueOnce({ rows: [] })
      // Priority-2 global → none
      .mockResolvedValueOnce({ rows: [] });

    const result =
      await chatRepository.getActiveVisionAiServiceSetting('user-1');

    expect(result).toBeNull();
  });
});
