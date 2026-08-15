import { Alert } from 'react-native';
import { confirmSyncPastEntries } from '../../src/screens/foodForm/persistence';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

describe('confirmSyncPastEntries', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function captureAlert() {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    return {
      spy,
      buttons: () => (spy.mock.calls[0][2] ?? []) as AlertButton[],
      options: () => spy.mock.calls[0][3] as { onDismiss?: () => void },
    };
  }

  it('offers keeping past entries as the safe default', () => {
    // Diary entries record what was eaten. Rewriting them is the destructive
    // choice, so the cancel-styled option must be the one that leaves history
    // alone.
    const { spy, buttons } = captureAlert();
    void confirmSyncPastEntries();

    expect(spy).toHaveBeenCalled();
    const keep = buttons().find((b) => b.style === 'cancel');
    expect(keep?.text).toBe('Keep past entries');
  });

  it('resolves true only when the user picks update', async () => {
    const { buttons } = captureAlert();
    const result = confirmSyncPastEntries();

    buttons().find((b) => b.text === 'Update past entries')?.onPress?.();

    await expect(result).resolves.toBe(true);
  });

  it('resolves false when the user keeps past entries', async () => {
    const { buttons } = captureAlert();
    const result = confirmSyncPastEntries();

    buttons().find((b) => b.text === 'Keep past entries')?.onPress?.();

    await expect(result).resolves.toBe(false);
  });

  it('resolves false when dismissed without choosing', async () => {
    // An Android back-press or outside tap must not be read as consent to
    // rewrite history.
    const { options } = captureAlert();
    const result = confirmSyncPastEntries();

    options().onDismiss?.();

    await expect(result).resolves.toBe(false);
  });

  it('states that entries are left alone unless updated', () => {
    const { spy } = captureAlert();
    void confirmSyncPastEntries();

    const [title, message] = spy.mock.calls[0];
    expect(title).toBe('Update past entries?');
    expect(message).toContain('keep their original values');
  });
});
