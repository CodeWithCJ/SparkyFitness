import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  confirmDiscardEquivalents,
  confirmSyncPastEntries,
  confirmVariantOverwrite,
  validateFoodForm,
} from '../../src/screens/foodForm/persistence';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

describe('Polish runtime localization', () => {
  beforeAll(async () => {
    await initializeI18n('pl');
  });

  beforeEach(async () => {
    await i18n.changeLanguage('pl');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
    jest.restoreAllMocks();
  });

  it('renders Polish alert actions and interpolates the literal unit label', async () => {
    const alertMock = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const result = confirmVariantOverwrite('kubek użytkownika');
    const [title, message, rawButtons] = alertMock.mock.calls[0];
    const buttons = rawButtons as AlertButton[];

    expect(title).toBe('Zapisz wartości odżywcze');
    expect(message).toContain('Wariant „kubek użytkownika” jest już zapisany.');
    expect(message).not.toContain('unitLabel');
    expect(buttons.map(button => button.text)).toEqual([
      'Anuluj',
      'Zapisz jako nowy',
      'Zaktualizuj istniejący',
    ]);

    buttons[1].onPress?.();
    await expect(result).resolves.toBe('new');
  });

  it('renders Polish validation toasts', () => {
    const toastMock = jest.spyOn(Toast, 'show').mockImplementation(() => {});

    expect(validateFoodForm({ name: '   ', servingSize: '100' } as never)).toBe(
      false,
    );
    expect(toastMock).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Brak nazwy',
      text2: 'Wpisz nazwę produktu.',
    });
  });
});

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
      const { spy, buttons } = captureAlert();
      void confirmSyncPastEntries();

      expect(spy).toHaveBeenCalled();
      expect(buttons().find(b => b.style === 'cancel')?.text).toBe(
        "Don't Update",
      );
    });

    it('stays a two-way choice', () => {
      const { buttons, message } = captureAlert();
      void confirmSyncPastEntries();

      expect(buttons()).toHaveLength(2);
      expect(message()).toContain('with the new nutrition?');
      expect(message()).not.toContain('photo');
    });

    it('syncs nutrition only when the user picks update', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries();

      buttons()
        .find(b => b.text === 'Update')
        ?.onPress?.();
      await expect(result).resolves.toBe('nutrition');
    });

    it('resolves none when the user keeps past entries', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries();

      buttons()
        .find(b => b.text === "Don't Update")
        ?.onPress?.();
      await expect(result).resolves.toBe('none');
    });

    it('resolves none when dismissed without choosing', async () => {
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

      expect(buttons().map(b => b.text)).toEqual([
        "Don't Update",
        'Update nutrition only',
        'Update nutrition & photos',
      ]);
    });

    it('marks only the photo-replacing option as destructive', () => {
      const { buttons } = captureAlert();
      void confirmSyncPastEntries(true);

      expect(
        buttons()
          .filter(b => b.style === 'destructive')
          .map(b => b.text),
      ).toEqual(['Update nutrition & photos']);
    });

    it('keeps the safe choice cancel-styled and default on dismiss', async () => {
      const { buttons, options } = captureAlert();
      const result = confirmSyncPastEntries(true);

      expect(buttons().find(b => b.style === 'cancel')?.text).toBe(
        "Don't Update",
      );
      options().onDismiss?.();
      await expect(result).resolves.toBe('none');
    });

    it('resolves nutrition when photos are declined', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries(true);

      buttons()
        .find(b => b.text === 'Update nutrition only')
        ?.onPress?.();
      await expect(result).resolves.toBe('nutrition');
    });

    it('resolves nutrition-and-photos when photos are accepted', async () => {
      const { buttons } = captureAlert();
      const result = confirmSyncPastEntries(true);

      buttons()
        .find(b => b.text === 'Update nutrition & photos')
        ?.onPress?.();
      await expect(result).resolves.toBe('nutrition-and-photos');
    });
  });
});

describe('confirmDiscardEquivalents', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('localizes the alert and preserves the discard result actions', async () => {
    const alertMock = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const result = confirmDiscardEquivalents();
    const buttons = alertMock.mock.calls[0][2] as AlertButton[];

    expect(alertMock.mock.calls[0][0]).toBe('Discard unsaved equivalents?');
    expect(alertMock.mock.calls[0][1]).toContain('Discard them to continue?');
    expect(buttons.map(button => button.text)).toEqual(['Cancel', 'Discard']);

    buttons[1].onPress?.();
    await expect(result).resolves.toBe(true);
  });
});

describe('confirmVariantOverwrite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('interpolates a literal unit label without treating it as a translation key', async () => {
    const alertMock = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const result = confirmVariantOverwrite('custom cup');
    const [title, message, rawButtons] = alertMock.mock.calls[0];
    const buttons = rawButtons as AlertButton[];

    expect(title).toBe('Save nutrition');
    expect(message).toContain('"custom cup" is already a saved variant.');
    expect(message).not.toContain('unitLabel');
    expect(buttons.map(button => button.text)).toEqual([
      'Cancel',
      'Save as new',
      'Update existing',
    ]);

    buttons[1].onPress?.();
    await expect(result).resolves.toBe('new');
  });
});

describe('validateFoodForm localization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('localizes the missing-name validation toast', () => {
    const toastMock = jest.spyOn(Toast, 'show').mockImplementation(() => {});

    expect(validateFoodForm({ name: '   ', servingSize: '100' } as never)).toBe(
      false,
    );
    expect(toastMock).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Missing name',
      text2: 'Please enter a food name.',
    });
  });

  it('localizes the invalid-serving-size validation toast', () => {
    const toastMock = jest.spyOn(Toast, 'show').mockImplementation(() => {});

    expect(validateFoodForm({ name: 'Apple', servingSize: '0' } as never)).toBe(
      false,
    );
    expect(toastMock).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Invalid serving size',
      text2: 'Serving size must be greater than zero.',
    });
  });
});

describe('foodFormPersistence catalog coverage', () => {
  it('provides readable English and Polish text for every persistence key', async () => {
    await initializeI18n('en');
    const keys = [
      'discardTitle', 'discardMessage', 'discard', 'updateTitle', 'updateMessage',
      'dontUpdate', 'update', 'updatePhotosMessage', 'updateNutrition',
      'updateNutritionPhotos', 'saveNutritionTitle', 'overwriteMessage', 'saveAsNew',
      'updateExisting', 'missingName', 'nameRequired', 'invalidServingSize',
      'servingSizeRequired',
    ];

    for (const key of keys) {
      const english = i18n.t(`foodFormPersistence.${key}`, { defaultValue: `fallback:${key}` });
      expect(english).not.toBe(`fallback:${key}`);
      expect(english).not.toMatch(/^foodFormPersistence\./);
    }

    await i18n.changeLanguage('pl');
    for (const key of keys) {
      const polish = i18n.t(`foodFormPersistence.${key}`, { defaultValue: `fallback:${key}` });
      expect(polish).not.toBe(`fallback:${key}`);
      expect(polish).not.toMatch(/^foodFormPersistence\./);
    }

    expect(i18n.t('foodFormPersistence.overwriteMessage', {
      unitLabel: 'kubek użytkownika',
      defaultValue: '"{{unitLabel}}" is already a saved variant.',
    })).toContain('kubek użytkownika');
  });
});
