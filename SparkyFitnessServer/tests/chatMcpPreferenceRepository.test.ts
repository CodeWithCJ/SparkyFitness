import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import { saveChatMcpServerChoice } from '../models/chatMcpPreferenceRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const choice = {
  server_id: '00000000-0000-4000-8000-000000000002',
  enabled: true,
  send_user_id: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as Awaited<ReturnType<typeof getClient>>);
  query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('single-server opt-in persistence', () => {
  it('updates only one ID in the user-scoped row and guards consent in the same update', async () => {
    expect(await saveChatMcpServerChoice('owner', choice)).toBe(true);
    expect(getClient).toHaveBeenCalledExactlyOnceWith('owner', 'owner');
    const [sql, values] = query.mock.calls[1] as [string, unknown[]];
    expect(values).toEqual(['owner', choice.server_id, true, false]);
    expect(sql).toContain(
      'array_append(array_remove(chat_mcp_server_ids, $2::uuid), $2::uuid)'
    );
    expect(sql).toContain('NOT $3::boolean OR EXISTS');
    expect(sql).toContain(
      "provider_type = 'mcp_server' AND is_public = TRUE AND is_active = TRUE"
    );
    expect(sql).toContain("base_url IS NOT NULL AND base_url <> ''");
    expect(sql).toContain(
      "jsonb_typeof(provider_options->'allowed_tools') = 'array'"
    );
    expect(sql).toContain("provider_options->'allowed_tools' <> '[]'::jsonb");
    expect(sql).toContain(
      "COALESCE(provider_options->'send_user_id' = 'true'::jsonb, FALSE) = $4::boolean"
    );
    expect(release).toHaveBeenCalledOnce();
  });
  it('reports an unavailable server or changed consent without retrying a write', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });
    expect(await saveChatMcpServerChoice('owner', choice)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('removes one ID without consulting stale enabled lists', async () => {
    await saveChatMcpServerChoice('owner', { ...choice, enabled: false });
    expect(query.mock.calls[1][1]).toEqual([
      'owner',
      choice.server_id,
      false,
      false,
    ]);
    expect(query.mock.calls[1][0]).toContain(
      'ELSE array_remove(chat_mcp_server_ids, $2::uuid) END'
    );
  });
  it('releases the user client on write failures', async () => {
    query.mockRejectedValueOnce(new Error('offline'));
    await expect(saveChatMcpServerChoice('owner', choice)).rejects.toThrow(
      'offline'
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
