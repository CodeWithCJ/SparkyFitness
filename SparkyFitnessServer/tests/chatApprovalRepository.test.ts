import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import repository from '../models/chatRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
  signedInUserIdOr: (id: string) => id,
}));
vi.mock('../security/encryption', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test',
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

describe('chat approval persistence', () => {
  const query = vi.fn();
  const release = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    vi.mocked(getClient).mockResolvedValue({
      query,
      release,
    } as unknown as PoolClient);
  });
  it('saves the streamed UUID with the original JSONB parts', async () => {
    const parts = [
      {
        type: 'tool-sparky_write',
        state: 'approval-requested',
        input: {},
        approval: { id: 'approval-1' },
      },
    ];
    await repository.saveChatHistory({
      id: 'row-1',
      user_id: 'actor',
      messageType: 'assistant',
      content: '',
      parts,
    });
    expect(query.mock.calls[0][1]).toEqual([
      'actor',
      '',
      'assistant',
      null,
      JSON.stringify(parts),
      'row-1',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
  it('claims by actor and exact previous parts, returning false after a competing response', async () => {
    const pending = [{ state: 'approval-requested' }];
    const responded = [{ state: 'approval-responded' }];
    expect(
      await repository.claimChatApproval('row', 'actor', pending, responded)
    ).toBe(true);
    expect(query.mock.calls[0][0]).toContain('parts = $4::jsonb');
    expect(query.mock.calls[0][1]).toEqual([
      JSON.stringify(responded),
      'row',
      'actor',
      JSON.stringify(pending),
    ]);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(
      await repository.claimChatApproval('row', 'actor', pending, responded)
    ).toBe(false);
  });
  it('cancels only pending calls in the current actor, account and conversation', async () => {
    await repository.cancelChatApprovals('actor', 'account', 'conversation');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['actor', 'account', 'conversation']);
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain("chat_conversation_id' IS NOT DISTINCT FROM $3");
    expect(sql).toContain("part->>'state' = 'approval-requested'");
    expect(sql).toContain("'output-denied'");
  });
});
