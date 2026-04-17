import {
  CHUNK_RECOVERY_TTL_MS,
  chunkRecoveryRuntime,
  isStaleChunkLoadError,
  triggerChunkRecoveryReload,
} from '@/utils/chunkRecovery';

const mockReload = jest.fn();

describe('chunkRecovery', () => {
  beforeAll(() => {
    jest
      .spyOn(chunkRecoveryRuntime, 'reloadWindowLocation')
      .mockImplementation(mockReload);
  });

  beforeEach(() => {
    sessionStorage.clear();
    mockReload.mockClear();
    jest.restoreAllMocks();
    jest
      .spyOn(chunkRecoveryRuntime, 'reloadWindowLocation')
      .mockImplementation(mockReload);
  });

  it.each([
    new TypeError('Failed to fetch dynamically imported module'),
    new Error('Importing a module script failed.'),
    Object.assign(new Error('Chunk failed to load'), {
      name: 'ChunkLoadError',
    }),
  ])('detects stale chunk load failures', (error) => {
    expect(isStaleChunkLoadError(error)).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleChunkLoadError(new Error('Something else broke'))).toBe(
      false
    );
  });

  it('only reloads once per url within the ttl window', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    expect(triggerChunkRecoveryReload()).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);

    expect(triggerChunkRecoveryReload()).toBe(false);
    expect(mockReload).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000 + CHUNK_RECOVERY_TTL_MS + 1);

    expect(triggerChunkRecoveryReload()).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('does not reload if persisting the guard fails', () => {
    const setItemSpy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

    expect(triggerChunkRecoveryReload()).toBe(false);
    expect(mockReload).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
  });
});
