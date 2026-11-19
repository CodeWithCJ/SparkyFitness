import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  accountGeneration,
  beginAccountChange,
  savedCopyReadable,
} from '../../src/offline/accountGeneration';

const PENDING_KEY = 'offline.accountCleanupPending';

describe('account change', () => {
  afterEach(async () => {
    // Leave the module in its normal state for the next test.
    await beginAccountChange(async () => true);
  });

  it('counts each change', async () => {
    const before = accountGeneration();

    await beginAccountChange(async () => true);

    expect(accountGeneration()).toBe(before + 1);
  });

  it('holds a read of the saved copy until the clean-up has finished', async () => {
    let finish!: () => void;
    const clearing = new Promise<boolean>((resolve) => {
      finish = () => resolve(true);
    });
    void beginAccountChange(() => clearing);

    let answered = false;
    const readable = savedCopyReadable().then((value) => {
      answered = true;
      return value;
    });
    await Promise.resolve();
    expect(answered).toBe(false);

    finish();
    expect(await readable).toBe(true);
  });

  it('keeps the saved copy closed after a clean-up that failed, until the next one works', async () => {
    await beginAccountChange(async () => false);
    expect(await savedCopyReadable()).toBe(false);

    await beginAccountChange(async () => {
      throw new Error('disk full');
    });
    expect(await savedCopyReadable()).toBe(false);

    await beginAccountChange(async () => true);
    expect(await savedCopyReadable()).toBe(true);
  });

  it('lets only the latest change decide when two overlap', async () => {
    let finishFirst!: () => void;
    const first = new Promise<boolean>((resolve) => {
      finishFirst = () => resolve(true);
    });
    const older = beginAccountChange(() => first);
    const newer = beginAccountChange(async () => false);

    // The older clean-up finishes last, and worked: that must not reopen the
    // copy after the newer one failed.
    await newer;
    finishFirst();
    await older;

    expect(await savedCopyReadable()).toBe(false);
  });

  it('keeps a note of an unfinished clean-up until it has worked', async () => {
    await beginAccountChange(async () => false);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBe('1');

    await beginAccountChange(async () => true);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe('the next start after a clean-up that did not finish', () => {
  const start = async (clearWorks: boolean) => {
    await AsyncStorage.setItem(PENDING_KEY, '1');
    const clearAllCache = jest.fn(async () => {
      if (!clearWorks) throw new Error('disk full');
    });
    let module!: typeof import('../../src/offline/accountGeneration');
    jest.isolateModules(() => {
      jest.doMock('../../src/offline/cacheStore', () => ({ clearAllCache }));
      jest.doMock('../../src/offline/db', () => ({
        getOfflineDb: jest.fn(async () => ({})),
      }));
      jest.doMock('../../src/services/LogService', () => ({
        addLog: jest.fn(),
      }));
      module = require('../../src/offline/accountGeneration');
    });
    return { module, clearAllCache };
  };

  afterEach(async () => {
    await AsyncStorage.removeItem(PENDING_KEY);
    jest.dontMock('../../src/offline/cacheStore');
    jest.dontMock('../../src/offline/db');
    jest.dontMock('../../src/services/LogService');
  });

  it('clears the saved copy before anything is read from it', async () => {
    const { module, clearAllCache } = await start(true);

    expect(await module.savedCopyReadable()).toBe(true);
    expect(clearAllCache).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('keeps the saved copy closed when it still cannot be cleared', async () => {
    const { module } = await start(false);

    expect(await module.savedCopyReadable()).toBe(false);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBe('1');
  });
});
