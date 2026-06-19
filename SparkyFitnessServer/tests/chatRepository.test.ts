import { vi, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { getClient } from '../db/poolManager.js';

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
