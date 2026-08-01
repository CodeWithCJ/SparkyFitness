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
        i18n: { language: lang },
        ready: true,
      };
    },
  };
});

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: (opts) => { globalThis.__TEST_SET_OPTIONS = opts; },
      goBack: jest.fn(),
    }),
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

const mockUseNativeIOSHeadersActive = useNativeIOSHeadersActive as jest.MockedFunction<typeof useNativeIOSHeadersActive>;

function HeaderRenderer({ config }) {
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
      expect(opts.unstable_headerRightItems).toEqual(expect.any(Function));
      const nativeItems = opts.unstable_headerRightItems();
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
      renderHook(() =>
        useScreenHeader({
          right: { kind: 'primary', onPress: jest.fn() },
        }),
      );

      const opts = globalThis.__TEST_SET_OPTIONS;
      const nativeItems = opts.unstable_headerRightItems();
      expect(nativeItems[0].label).toBe(customLabel);
    });
  });
});
