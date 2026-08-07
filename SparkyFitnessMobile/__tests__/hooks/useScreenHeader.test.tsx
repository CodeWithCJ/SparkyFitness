import React, { useEffect } from 'react';
import { View } from 'react-native';
import { render, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('react-i18next', () => {
  const en = require('../../src/localization/locales/en/translation.json');
  const pl = require('../../src/localization/locales/pl/translation.json');

  const lookup = (obj, path) => {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return path;
      value = value[part];
    }
    return typeof value === 'string' ? value : path;
  };

  return {
    useTranslation: () => {
      const lang = globalThis.__TEST_LANG || 'en';
      const dict = lang === 'pl' ? pl : en;
      return {
        t: (key) => lookup(dict, key),
        i18n: { language: lang, resolvedLanguage: lang },
        ready: true,
      };
    },
  };
});

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

import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../../src/services/nativeTabBarPreference';
import { useTranslation } from 'react-i18next';

const mockUseNativeIOSHeadersActive = useNativeIOSHeadersActive as jest.MockedFunction<typeof useNativeIOSHeadersActive>;

function HeaderRenderer({ config }: { config: Parameters<typeof useScreenHeader>[0] }) {
  const header = useScreenHeader(config);
  return <>{header ?? <View testID="null-header" />}</>;
}

describe('useScreenHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__TEST_LANG = 'en';
    globalThis.__TEST_SET_OPTIONS = null;
    mockUseNativeIOSHeadersActive.mockReturnValue(false);
  });

  describe('back label', () => {
    it('uses common.back ("Back") in English', () => {
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'back' }, right: null }} />,
      );
      expect(getByLabelText('Back')).toBeTruthy();
    });

    it('uses common.back ("Cofnij") in Polish', () => {
      globalThis.__TEST_LANG = 'pl';
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'back' }, right: null }} />,
      );
      expect(getByLabelText('Cofnij')).toBeTruthy();
    });
  });

  describe('close label', () => {
    it('uses common.close ("Close") in English for dismiss', () => {
      const onPress = jest.fn();
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'dismiss', onPress }, right: null }} />,
      );
      expect(getByLabelText('Close')).toBeTruthy();
    });

    it('uses common.close ("Zamknij") in Polish for dismiss', () => {
      globalThis.__TEST_LANG = 'pl';
      const onPress = jest.fn();
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'dismiss', onPress }, right: null }} />,
      );
      expect(getByLabelText('Zamknij')).toBeTruthy();
    });
  });

  describe('save label', () => {
    it('defaults to common.save ("Save") in English for primary without label', () => {
      const { getByText } = render(
        <HeaderRenderer config={{ right: { kind: 'primary', onPress: jest.fn() } }} />,
      );
      expect(getByText('Save')).toBeTruthy();
    });

    it('defaults to common.save ("Zapisz") in Polish', () => {
      globalThis.__TEST_LANG = 'pl';
      const { getByText } = render(
        <HeaderRenderer config={{ right: { kind: 'primary', onPress: jest.fn() } }} />,
      );
      expect(getByText('Zapisz')).toBeTruthy();
    });
  });

  describe('saving label', () => {
    it('common.saving resolves to "Saving…" in English', () => {
      const en = require('../../src/localization/locales/en/translation.json');
      let val = en;
      for (const part of 'common.saving'.split('.')) {
        if (val == null || typeof val !== 'object') break;
        val = val[part];
      }
      expect(val).toBe('Saving…');
    });

    it('common.saving resolves to "Zapisywanie…" in Polish', () => {
      const pl = require('../../src/localization/locales/pl/translation.json');
      let val = pl;
      for (const part of 'common.saving'.split('.')) {
        if (val == null || typeof val !== 'object') break;
        val = val[part];
      }
      expect(val).toBe('Zapisywanie…');
    });
  });

  describe('explicit label precedence', () => {
    it('explicit label overrides default common.save', () => {
      const { getByText } = render(
        <HeaderRenderer config={{ right: { kind: 'primary', label: 'Done', onPress: jest.fn() } }} />,
      );
      expect(getByText('Done')).toBeTruthy();
      expect(() => getByText('Save')).toThrow();
    });
  });

  describe('dynamic content not passed to t()', () => {
    it('renders dynamic titles literally without translating them', () => {
      const dynamicTitle = 'My Custom Meal Type';
      const { getByText } = render(
        <HeaderRenderer config={{ title: dynamicTitle, right: null }} />,
      );
      expect(getByText(dynamicTitle)).toBeTruthy();
    });
  });

  describe('accessibility labels', () => {
    it('back accessibility label matches current language (EN)', () => {
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'back' }, right: null }} />,
      );
      expect(getByLabelText('Back')).toBeTruthy();
    });

    it('back accessibility label matches current language (PL)', () => {
      globalThis.__TEST_LANG = 'pl';
      const { getByLabelText } = render(
        <HeaderRenderer config={{ left: { kind: 'back' }, right: null }} />,
      );
      expect(getByLabelText('Cofnij')).toBeTruthy();
    });
  });

  describe('language change without remount', () => {
    it('updates header text on language change without remounting the screen', async () => {
      let mountCount = 0;

      function ScreenWithHeader() {
        const header = useScreenHeader({
          right: { kind: 'primary', onPress: jest.fn() },
        });
        useEffect(() => {
          mountCount++;
        }, []);
        return <>{header}</>;
      }

      const { getByText, rerender } = render(<ScreenWithHeader />);
      await waitFor(() => expect(getByText('Save')).toBeTruthy());
      expect(mountCount).toBe(1);

      globalThis.__TEST_LANG = 'pl';
      rerender(<ScreenWithHeader />);
      await waitFor(() => expect(getByText('Zapisz')).toBeTruthy());
      expect(mountCount).toBe(1);

      globalThis.__TEST_LANG = 'en';
      rerender(<ScreenWithHeader />);
      await waitFor(() => expect(getByText('Save')).toBeTruthy());
      expect(mountCount).toBe(1);
    });
  });

  describe('native header items', () => {
    it('passes translated labels to native header via setOptions (EN)', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      renderHook(() =>
        useScreenHeader({
          title: 'Test',
          right: { kind: 'primary', onPress: jest.fn() },
        }),
      );

      const opts = globalThis.__TEST_SET_OPTIONS;
      expect(opts!.unstable_headerRightItems).toEqual(expect.any(Function));
      const nativeItems = opts!.unstable_headerRightItems();
      expect(nativeItems[0].label).toBe('Save');
    });

    it('native and custom paths produce the same save label', () => {
      globalThis.__TEST_LANG = 'en';

      mockUseNativeIOSHeadersActive.mockReturnValue(false);
      const customResult = render(
        <HeaderRenderer config={{ right: { kind: 'primary', onPress: jest.fn() } }} />,
      );
      const customLabel = customResult.getByText('Save').props.children;
      customResult.unmount();

      mockUseNativeIOSHeadersActive.mockReturnValue(true);
      globalThis.__TEST_SET_OPTIONS = null;
      jest.clearAllMocks();
      renderHook(() =>
        useScreenHeader({
          right: { kind: 'primary', onPress: jest.fn() },
        }),
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const opts = mockSetOptions.mock.calls[0][0];
      const nativeItems = opts!.unstable_headerRightItems();
      expect(nativeItems[0].label).toBe(customLabel);
    });
  });

  describe('native language refresh on same instance', () => {
    it('native dismiss refreshes on language change EN → PL', () => {
      const onPress = jest.fn();
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      const { rerender } = renderHook(() =>
        useScreenHeader({
          left: { kind: 'dismiss', onPress },
          right: null,
        }),
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstLeftItems = firstOpts!.unstable_headerLeftItems();
      expect(firstLeftItems[0].accessibilityLabel).toBe('Close');

      globalThis.__TEST_LANG = 'pl';
      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondLeftItems = secondOpts!.unstable_headerLeftItems();
      expect(secondLeftItems[0].accessibilityLabel).toBe('Zamknij');
    });

    it('native primary label switches Save → Zapisz on language change (same instance)', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      const { rerender } = renderHook(() =>
        useScreenHeader({
          right: { kind: 'primary', onPress: jest.fn() },
        }),
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstItems = firstOpts!.unstable_headerRightItems();
      expect(firstItems[0].label).toBe('Save');

      globalThis.__TEST_LANG = 'pl';
      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondItems = secondOpts!.unstable_headerRightItems();
      expect(secondItems[0].label).toBe('Zapisz');
    });

    it('native busy label shows Saving… → Zapisywanie… (same instance)', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      const { rerender } = renderHook(() =>
        useScreenHeader({
          right: { kind: 'primary', label: 'Save', busy: true, onPress: jest.fn() },
        }),
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstItems = firstOpts!.unstable_headerRightItems();
      expect(firstItems[0].label).toBe('Saving…');

      globalThis.__TEST_LANG = 'pl';
      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondItems = secondOpts!.unstable_headerRightItems();
      expect(secondItems[0].label).toBe('Zapisywanie…');
    });

    it('updates explicitly translated accessibility label EN → PL (same instance)', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      function IconWithDynamicLabel() {
        const { t } = useTranslation();
        useScreenHeader({
          right: {
            kind: 'icon',
            sfSymbol: 'star',
            ionicon: 'star',
            onPress: jest.fn(),
            accessibilityLabel: t('common.edit'),
          },
        });
        return <View />;
      }

      const { rerender } = renderHook(() => IconWithDynamicLabel());

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstItems = firstOpts!.unstable_headerRightItems();
      expect(firstItems[0].accessibilityLabel).toBe('Edit');

      globalThis.__TEST_LANG = 'pl';
      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondItems = secondOpts!.unstable_headerRightItems();
      expect(secondItems[0].accessibilityLabel).toBe('Edytuj');
    });

    it('icon with translated accessibility label EN → PL (same instance)', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      function DualItemScreen() {
        const { t } = useTranslation();
        useScreenHeader({
          left: { kind: 'dismiss', onPress: jest.fn() },
          right: {
            kind: 'icon',
            sfSymbol: 'star',
            ionicon: 'star',
            onPress: jest.fn(),
            accessibilityLabel: t('common.edit'),
          },
        });
        return <View />;
      }

      const { rerender } = renderHook(() => DualItemScreen());

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
      const firstOpts = mockSetOptions.mock.calls[0][0];
      const firstLeftItems = firstOpts!.unstable_headerLeftItems();
      expect(firstLeftItems![0].accessibilityLabel).toBe('Close');
      const firstRightItems = firstOpts!.unstable_headerRightItems();
      expect(firstRightItems[0].accessibilityLabel).toBe('Edit');

      globalThis.__TEST_LANG = 'pl';
      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(2);
      const secondOpts = mockSetOptions.mock.calls[1][0];
      const secondLeftItems = secondOpts!.unstable_headerLeftItems();
      expect(secondLeftItems![0].accessibilityLabel).toBe('Zamknij');
      const secondRightItems = secondOpts!.unstable_headerRightItems();
      expect(secondRightItems![0].accessibilityLabel).toBe('Edytuj');
    });
  });

  describe('signature stability', () => {
    it('does not re-run setOptions on a rerender with unchanged inputs', () => {
      globalThis.__TEST_LANG = 'en';
      mockUseNativeIOSHeadersActive.mockReturnValue(true);

      const { rerender } = renderHook(() =>
        useScreenHeader({
          right: { kind: 'primary', label: 'Save', onPress: jest.fn() },
        }),
      );

      expect(mockSetOptions).toHaveBeenCalledTimes(1);

      rerender();

      expect(mockSetOptions).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useScreenHeader - label: undefined fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__TEST_LANG = 'en';
    globalThis.__TEST_SET_OPTIONS = null;
    mockUseNativeIOSHeadersActive.mockReturnValue(false);
  });

  it('custom path shows Save for primary with label: undefined and busyLabel: undefined', () => {
    const { getByText } = render(
      <HeaderRenderer config={{ right: { kind: 'primary', label: undefined, busyLabel: undefined, onPress: jest.fn() } }} />,
    );
    expect(getByText('Save')).toBeTruthy();
    expect(() => getByText('undefined')).toThrow();
  });

  it('native path shows Saving… for primary with label: undefined, busyLabel: undefined, busy: true', () => {
    globalThis.__TEST_LANG = 'en';
    mockUseNativeIOSHeadersActive.mockReturnValue(true);

    renderHook(() =>
      useScreenHeader({
        right: { kind: 'primary', label: undefined, busyLabel: undefined, busy: true, onPress: jest.fn() },
      }),
    );

    const opts = mockSetOptions.mock.calls[0][0];
    const nativeItems = opts!.unstable_headerRightItems();
    expect(nativeItems[0].label).toBe('Saving…');
  });

  it('icon does not get a text Save label', () => {
    globalThis.__TEST_LANG = 'en';
    mockUseNativeIOSHeadersActive.mockReturnValue(true);

    renderHook(() =>
      useScreenHeader({
        right: {
          kind: 'icon',
          sfSymbol: 'star',
          ionicon: 'star',
          onPress: jest.fn(),
          accessibilityLabel: 'Favorite',
        },
      }),
    );

    const opts = mockSetOptions.mock.calls[0][0];
    const nativeItems = opts!.unstable_headerRightItems();
    expect(nativeItems[0].label).toBe('');
  });
});
