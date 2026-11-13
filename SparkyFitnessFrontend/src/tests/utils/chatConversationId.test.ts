import { webcrypto } from 'node:crypto';
import { warn } from '@/utils/logging';
import {
  getChatConversationId,
  rotateAllChatConversationIds,
  rotateChatConversationId,
} from '@/utils/chatConversationId';

jest.mock('@/utils/logging', () => ({ warn: jest.fn() }));

describe('chatConversationId', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  });

  beforeEach(async () => {
    localStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await rotateChatConversationId('user-a');
    await rotateChatConversationId('user-b');
    jest.clearAllMocks();
  });

  it('keeps one ID per acting user across calls', async () => {
    const first = await getChatConversationId('user-a');
    expect(await getChatConversationId('user-a')).toBe(first);
    expect(await getChatConversationId('user-b')).not.toBe(first);
  });

  it('rotates only the given user ID', async () => {
    const a = await getChatConversationId('user-a');
    const b = await getChatConversationId('user-b');
    await rotateChatConversationId('user-a');
    expect(await getChatConversationId('user-a')).not.toBe(a);
    expect(await getChatConversationId('user-b')).toBe(b);
  });

  it('rotates every stored ID and leaves other stored values alone', async () => {
    const a = await getChatConversationId('user-a');
    const b = await getChatConversationId('user-b');
    localStorage.setItem('unrelated-key', 'keep');
    rotateAllChatConversationIds();
    expect(await getChatConversationId('user-a')).not.toBe(a);
    expect(await getChatConversationId('user-b')).not.toBe(b);
    expect(localStorage.getItem('unrelated-key')).toBe('keep');
  });

  it('never stores the raw user ID in the storage key', async () => {
    await getChatConversationId('user-a');
    const keys = Object.keys(localStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('user-a');
    expect(keys[0]).toMatch(/^sparky\.chat\.conversationId:[0-9a-f]{64}$/);
  });

  it('keeps a stable ID for the page session when storage throws', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const id = await getChatConversationId('user-a');
    expect(await getChatConversationId('user-a')).toBe(id);
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(rotateChatConversationId('user-a')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(await getChatConversationId('user-a')).not.toBe(id);
  });

  it('falls back to an in-memory ID when crypto.subtle is unavailable', async () => {
    const original = crypto.subtle;
    Object.defineProperty(crypto, 'subtle', {
      value: undefined,
      configurable: true,
    });
    try {
      const id = await getChatConversationId('user-a');
      expect(await getChatConversationId('user-a')).toBe(id);
      expect(Object.keys(localStorage)).toHaveLength(0);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(crypto, 'subtle', {
        value: original,
        configurable: true,
      });
    }
  });
});
