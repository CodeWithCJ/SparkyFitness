import {
  accountGeneration,
  beginAccountChange,
  savedCopyReadable,
} from '../../src/offline/accountGeneration';

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
});
