import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const lookup = (obj: any, path: string): string => {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return path;
    value = value[part];
  }
  return typeof value === 'string' ? value : path;
};

globalThis.__MockTestLang = 'en';

jest.mock('react-i18next', () => ({
  useTranslation: () => {
    const lang = globalThis.__MockTestLang || 'en';
    const en = require('../../src/localization/locales/en/translation.json');
    const pl = require('../../src/localization/locales/pl/translation.json');
    const dict = lang === 'pl' ? pl : en;
    return {
      t: (key: string) => lookup(dict, key),
      i18n: { language: lang, resolvedLanguage: lang },
      ready: true,
    };
  },
}));

const mockSetOptions = jest.fn((opts) => { globalThis.__TEST_SET_OPTIONS = opts; });
const mockGoBack = jest.fn();

const mockNavigation = {
  setOptions: mockSetOptions,
  goBack: mockGoBack,
};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
  };
});

jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: () => ({ defaultColor: '#000000', saveColor: '#007AFF' }),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

import { useNativeIOSHeadersActive } from '../../src/services/nativeTabBarPreference';
import FormScreenChrome from '../../src/components/FormScreenChrome';

const mockUseNativeIOSHeadersActive = useNativeIOSHeadersActive as jest.MockedFunction<typeof useNativeIOSHeadersActive>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { width: 375, height: 812, x: 0, y: 0 };

function renderWithSafeArea(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      {ui}
    </SafeAreaProvider>,
  );
}

describe('FormScreenChrome header fallbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__MockTestLang = 'en';
    globalThis.__TEST_SET_OPTIONS = null;
    mockUseNativeIOSHeadersActive.mockReturnValue(false);
  });

  describe('custom path (fallback bar)', () => {
    it('shows Save for primary with label: undefined and busyLabel: undefined', () => {
      const { getByText } = renderWithSafeArea(
        <FormScreenChrome
          title="Test"
          saveLabel={undefined}
          savingLabel={undefined}
          isSaving={false}
          onSave={jest.fn()}
          onCancel={jest.fn()}
        >
          <View />
        </FormScreenChrome>,
      );
      expect(getByText('Save')).toBeTruthy();
    });

    it('shows Zapisz on language change EN → PL (same instance, rerender)', () => {
      const { getByText, rerender } = renderWithSafeArea(
        <FormScreenChrome
          title="Test"
          saveLabel={undefined}
          savingLabel={undefined}
          isSaving={false}
          onSave={jest.fn()}
          onCancel={jest.fn()}
        >
          <View />
        </FormScreenChrome>,
      );
      expect(getByText('Save')).toBeTruthy();

      globalThis.__MockTestLang = 'pl';
      rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FormScreenChrome
            title="Test"
            saveLabel={undefined}
            savingLabel={undefined}
            isSaving={false}
            onSave={jest.fn()}
            onCancel={jest.fn()}
          >
            <View />
          </FormScreenChrome>
        </SafeAreaProvider>,
      );
      expect(getByText('Zapisz')).toBeTruthy();
    });
  });

  describe('native path', () => {
    it('shows Saving… for busy=true with label: undefined, busyLabel: undefined (EN)', () => {
      globalThis.__MockTestLang = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      renderWithSafeArea(
        <FormScreenChrome
          title="Test"
          saveLabel={undefined}
          savingLabel={undefined}
          isSaving={true}
          onSave={jest.fn()}
          onCancel={jest.fn()}
        >
          <View />
        </FormScreenChrome>,
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const opts = mockSetOptions.mock.calls[0][0];
      const nativeItems = opts!.unstable_headerRightItems();
      expect(nativeItems[0].label).toBe('Saving…');
    });

    it('shows Zapisywanie… for busy=true on language change EN → PL (same instance)', () => {
      globalThis.__MockTestLang = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      renderWithSafeArea(
        <FormScreenChrome
          title="Test"
          saveLabel={undefined}
          savingLabel={undefined}
          isSaving={true}
          onSave={jest.fn()}
          onCancel={jest.fn()}
        >
          <View />
        </FormScreenChrome>,
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstItems = firstOpts!.unstable_headerRightItems();
      expect(firstItems[0].label).toBe('Saving…');

      globalThis.__MockTestLang = 'pl';

      renderWithSafeArea(
        <FormScreenChrome
          title="Test"
          saveLabel={undefined}
          savingLabel={undefined}
          isSaving={true}
          onSave={jest.fn()}
          onCancel={jest.fn()}
        >
          <View />
        </FormScreenChrome>,
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondItems = secondOpts!.unstable_headerRightItems();
      expect(secondItems[0].label).toBe('Zapisywanie…');
    });
  });
});
