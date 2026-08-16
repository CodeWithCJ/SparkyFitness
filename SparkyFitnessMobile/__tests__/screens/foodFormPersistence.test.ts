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
      title: () => spy.mock.calls[0][0],
      message: () => spy.mock.calls[0][1],
      buttons: () => (spy.mock.calls[0][2] ?? []) as AlertButton[],
      options: () => spy.mock.calls[0][3] as { onDismiss?: () => void },
    };
  }

  describe('when the save did not change the food photos', () => {
    it('offers keeping past entries as the safe default', () => {
      // Diary entries record what was eaten. Rewriting them is the destructive
      // choice, so the cancel-styled option must be the one that leaves
      // history alone.
      const { spy, buttons } = captureAlert();
      void confirmSyncPastEntries();

      expect(spy).toHaveBeenCalled();
      expect(buttons().find((b) => b.style === 'cancel')?.text).toBe(
        "Don't Update",
      );
    });

    it('stays a two-way choice', () => {
      // Photos are untouched, so a photo option would only ask the user to
      // decide something this save does not actually change.
      const { buttons, message } = captureAlert();
      void confirmSyncPastEntries();

      expect(buttons()).toHaveLength(2);
      expect(message()).toContain('with the new nutrition?');
      expect(message()).not.toContain('photo');
    });

    it('syncs nutrition only when the user picks update', async () => {
      // Never 'nutrition-and-photos': that path force-replaces custom diary
      // photos, which the user was never asked about here.
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries();

      buttons().find((b) => b.text === 'Update')?.onPress?.();

      await expect(result).resolves.toBe('nutrition');
    });

    it('resolves none when the user keeps past entries', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries();

      buttons().find((b) => b.text === "Don't Update")?.onPress?.();

      await expect(result).resolves.toBe('none');
    });

    it('resolves none when dismissed without choosing', async () => {
      // An Android back-press or outside tap must not be read as consent to
      // rewrite history.
      const { options } = captureAlert();
      const result = confirmSyncPastEntries();

      options().onDismiss?.();

      await expect(result).resolves.toBe('none');
    });

    it('states that entries are left alone unless updated', () => {
      const { title, message } = captureAlert();
      void confirmSyncPastEntries();

      expect(title()).toBe('Update past entries?');
      expect(message()).toContain('keep their original values');
    });
  });

  describe('when the save replaced the food photos', () => {
    it('offers all three outcomes', () => {
      const { buttons } = captureAlert();
      void confirmSyncPastEntries(true);

      expect(buttons().map((b) => b.text)).toEqual([
        "Don't Update",
        'Update nutrition only',
        'Update nutrition & photos',
      ]);
    });

    it('marks only the photo-replacing option as destructive', () => {
      // It is the one path that discards a photo the user chose for a specific
      // diary entry, and the server unlinks the replaced file.
      const { buttons } = captureAlert();
      void confirmSyncPastEntries(true);

      expect(
        buttons()
          .filter((b) => b.style === 'destructive')
          .map((b) => b.text),
      ).toEqual(['Update nutrition & photos']);
    });

    it('keeps the safe choice cancel-styled and default on dismiss', async () => {
      const { buttons, options } = captureAlert();
      const result = confirmSyncPastEntries(true);

      expect(buttons().find((b) => b.style === 'cancel')?.text).toBe(
        "Don't Update",
      );
      options().onDismiss?.();

      await expect(result).resolves.toBe('none');
    });

    it('resolves nutrition when photos are declined', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries(true);

      buttons().find((b) => b.text === 'Update nutrition only')?.onPress?.();

      await expect(result).resolves.toBe('nutrition');
    });

    it('resolves nutrition-and-photos when photos are accepted', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries(true);

      buttons()
        .find((b) => b.text === 'Update nutrition & photos')
        ?.onPress?.();

      await expect(result).resolves.toBe('nutrition-and-photos');
    });
  });
});
