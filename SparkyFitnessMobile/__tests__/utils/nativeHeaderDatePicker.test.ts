import {
  createNativeHeaderDatePickerItems,
  setNativeHeaderDatePickerOptions,
} from '../../src/utils/nativeHeaderDatePicker';
import type { TFunction } from 'i18next';

describe('nativeHeaderDatePicker', () => {
  const onPreviousDate = jest.fn();
  const onDatePress = jest.fn();
  const onNextDate = jest.fn();
  const options = {
    selectedDate: '2025-01-15',
    onPreviousDate,
    onDatePress,
    onNextDate,
    tintColor: '#0A84FF',
    accessibilityLabel: 'Choose diary date',
    t: ((key: string, values?: { defaultValue?: string }) =>
      values?.defaultValue ?? key) as TFunction,
    locale: 'en-US',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates tappable accent-colored date controls', () => {
    const items = createNativeHeaderDatePickerItems(options);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.identifier)).toEqual([
      'date-picker-previous',
      'date-picker',
      'date-picker-next',
    ]);
    expect(items.every((item) => item.tintColor === '#0A84FF')).toBe(true);
    expect(items[1]?.label).toContain('Jan 15');

    items[0]?.onPress();
    items[1]?.onPress();
    items[2]?.onPress();

    expect(onPreviousDate).toHaveBeenCalledTimes(1);
    expect(onDatePress).toHaveBeenCalledTimes(1);
    expect(onNextDate).toHaveBeenCalledTimes(1);
  });

  it('writes handlers to screen options instead of route params', () => {
    const setOptions = jest.fn();

    setNativeHeaderDatePickerOptions({ setOptions }, options);

    expect(setOptions).toHaveBeenCalledTimes(1);
    const configuredOptions = setOptions.mock.calls[0]?.[0];
    expect(configuredOptions).toEqual({
      unstable_headerRightItems: expect.any(Function),
      unstable_headerLeftItems: undefined,
    });
    expect(configuredOptions.unstable_headerRightItems()).toHaveLength(3);
  });

  it('adds a leading family diary action when one is supplied', () => {
    const onPress = jest.fn();
    const setOptions = jest.fn();

    setNativeHeaderDatePickerOptions(
      { setOptions },
      {
        ...options,
        leadingAction: {
          sfSymbol: 'person.2.fill',
          onPress,
          accessibilityLabel: 'Open family diaries',
          identifier: 'family-diaries',
        },
      }
    );

    const configuredOptions = setOptions.mock.calls[0]?.[0];
    const leadingItems = configuredOptions.unstable_headerLeftItems();
    expect(leadingItems).toEqual([
      expect.objectContaining({
        icon: { type: 'sfSymbol', name: 'person.2.fill' },
        accessibilityLabel: 'Open family diaries',
        identifier: 'family-diaries',
      }),
    ]);
    leadingItems[0]?.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('clears a previously configured leading action when access disappears', () => {
    let configuredOptions: Record<string, unknown> = {};
    const setOptions = jest.fn((nextOptions: Record<string, unknown>) => {
      configuredOptions = { ...configuredOptions, ...nextOptions };
    });

    setNativeHeaderDatePickerOptions(
      { setOptions },
      {
        ...options,
        leadingAction: {
          sfSymbol: 'person.2.fill',
          onPress: jest.fn(),
          accessibilityLabel: 'Open family diaries',
          identifier: 'family-diaries',
        },
      }
    );
    expect(configuredOptions.unstable_headerLeftItems).toEqual(
      expect.any(Function)
    );

    setNativeHeaderDatePickerOptions({ setOptions }, options);

    expect(configuredOptions.unstable_headerLeftItems).toBeUndefined();
  });
});
