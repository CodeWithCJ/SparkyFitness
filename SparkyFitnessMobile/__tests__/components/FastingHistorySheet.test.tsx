import React, { createRef } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import FastingHistorySheet from '../../src/components/FastingHistorySheet';
import type { FastingLog } from '../../src/types/fasting';

let mockHistory: FastingLog[] | undefined = [];
let mockIsLoading = false;
const mockHistoryCalls: { limit: number; offset: number }[] = [];
const mockSwipeableProps: {
  overshootRight?: boolean;
  rightThreshold?: number;
}[] = [];
const mockRightActionProps: { style?: { width?: number } }[] = [];
const mockDeleteFast = jest.fn();
const mockEditPresent = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');

function setTestLocale(locale: 'en' | 'pl'): void {
  (
    globalThis as typeof globalThis & {
      __setTestLocale: (value: 'en' | 'pl') => void;
    }
  ).__setTestLocale(locale);
}

function buildFast(
  id: string,
  overrides: Partial<FastingLog> = {},
): FastingLog {
  return {
    id,
    user_id: 'user-1',
    start_time: '2026-02-13T06:00:00.000Z',
    end_time: '2026-02-13T10:30:00.000Z',
    target_end_time: null,
    duration_minutes: 270,
    fasting_type: '16:8 Leangains',
    status: 'COMPLETED',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

jest.mock('../../src/hooks/useFasting', () => ({
  useFastingHistory: (limit: number, offset: number) => {
    mockHistoryCalls.push({ limit, offset });
    return { data: mockHistory, isLoading: mockIsLoading };
  },
  useDeleteFast: () => ({ mutate: mockDeleteFast, isPending: false }),
}));
jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  getAppLocale: () =>
    globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US',
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('../../src/components/FastingEditSheet', () => {
  const ReactNative = require('react');
  return {
    __esModule: true,
    default: ReactNative.forwardRef(
      (_props: unknown, ref: React.Ref<unknown>) => {
        ReactNative.useImperativeHandle(ref, () => ({
          present: mockEditPresent,
          dismiss: jest.fn(),
        }));
        return null;
      },
    ),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactNative = require('react');
  const RN = require('react-native');
  return ReactNative.forwardRef(
    (
      props: {
        children: React.ReactNode;
        renderRightActions?: () => React.ReactNode;
        overshootRight?: boolean;
        rightThreshold?: number;
      },
      _ref: React.Ref<unknown>,
    ) => {
      mockSwipeableProps.push(props);
      const rightActions = props.renderRightActions?.();
      if (ReactNative.isValidElement(rightActions)) {
        mockRightActionProps.push(
          rightActions.props as { style?: { width?: number } },
        );
      }
      return ReactNative.createElement(
        RN.View,
        null,
        props.children,
        rightActions,
      );
    },
  );
});
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactNative = require('react');
  const RN = require('react-native');
  const BottomSheetModal = ReactNative.forwardRef(
    (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactNative.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return ReactNative.createElement(RN.View, null, props.children);
    },
  );
  return {
    BottomSheetModal,
    BottomSheetScrollView: (props: { children: React.ReactNode }) =>
      ReactNative.createElement(RN.View, null, props.children),
    BottomSheetBackdrop: () => null,
  };
});

describe('FastingHistorySheet', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockHistory = [];
    mockIsLoading = false;
    mockHistoryCalls.length = 0;
    mockSwipeableProps.length = 0;
    mockRightActionProps.length = 0;
    mockDeleteFast.mockReset();
    mockEditPresent.mockReset();
    mockAlert.mockClear();
    mockAlert.mockImplementation(() => undefined);
    (Toast.show as jest.Mock).mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    [
      'en',
      'Fasting history',
      'Tap to edit · swipe left to delete',
      'No past fasts yet.',
    ],
    [
      'pl',
      'Historia postów',
      'Dotknij, aby edytować · przesuń w lewo, aby usunąć',
      'Brak zakończonych postów.',
    ],
  ] as const)(
    'renders loading and empty state in %s',
    (locale, title, hint, empty) => {
      setTestLocale(locale);
      mockIsLoading = true;
      const view = render(<FastingHistorySheet ref={createRef()} />);
      expect(view.getByText(title)).toBeTruthy();
      expect(view.getByText(hint)).toBeTruthy();
      mockIsLoading = false;
      view.rerender(<FastingHistorySheet ref={createRef()} />);
      expect(view.getByText(empty)).toBeTruthy();
    },
  );

  it.each([
    [
      'en',
      'Today',
      'Yesterday',
      'Fri, Feb 13',
      '7:00 AM → 11:30 AM',
      '4h 30m',
      'Circadian Rhythm',
      'Server Special',
    ],
    [
      'pl',
      'Dzisiaj',
      'Wczoraj',
      'pt., 13 lut',
      '7:00 → 11:30',
      '4 godz. 30 min',
      'Rytm dobowy',
      'Server Special',
    ],
  ] as const)(
    'renders localized rows and filters active fasts in %s',
    (locale, today, yesterday, date, range, duration, circadian, unknown) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
      setTestLocale(locale);
      mockHistory = [
        buildFast('today', { end_time: '2026-02-15T10:30:00.000Z' }),
        buildFast('yesterday', {
          end_time: '2026-02-14T10:30:00.000Z',
          fasting_type: 'Circadian Rhythm',
        }),
        buildFast('date', { fasting_type: 'Server Special' }),
        buildFast('active-only', {
          status: 'ACTIVE',
          fasting_type: 'Active Only Protocol',
          start_time: '2026-02-10T01:23:00.000Z',
          end_time: null,
          duration_minutes: 999,
        }),
        buildFast('start-only', {
          end_time: null,
          duration_minutes: null,
          fasting_type: 'Custom Fast',
        }),
      ];
      const view = render(<FastingHistorySheet ref={createRef()} />);
      expect(view.getByText(today)).toBeTruthy();
      expect(view.getByText(yesterday)).toBeTruthy();
      expect(view.getAllByText(date).length).toBeGreaterThan(0);
      expect(view.getAllByText(range).length).toBeGreaterThan(0);
      expect(view.getAllByText(duration).length).toBeGreaterThan(0);
      expect(view.getByText(circadian)).toBeTruthy();
      expect(view.getByText(unknown)).toBeTruthy();
      expect(view.queryByText('Active Only Protocol')).toBeNull();
      expect(view.getByText('16:8')).toBeTruthy();
      expect(view.getByText('—')).toBeTruthy();
      expect(mockHistoryCalls[0]).toEqual({ limit: 25, offset: 0 });
      expect(mockSwipeableProps[0]).toMatchObject({
        overshootRight: false,
        rightThreshold: 40,
      });
      expect(mockRightActionProps.at(-1)?.style?.width).toBe(80);
    },
  );

  it.each([
    ['en', '2:23 AM', '2:23 AM →'],
    ['pl', '2:23', '2:23 →'],
  ] as const)(
    'renders a start-only fast as one time in %s',
    (locale, startTime, range) => {
      setTestLocale(locale);
      mockHistory = [
        buildFast('start-only', {
          start_time: '2026-02-10T01:23:00.000Z',
          end_time: null,
          duration_minutes: null,
        }),
      ];
      const view = render(<FastingHistorySheet ref={createRef()} />);
      expect(view.getByText(startTime)).toBeTruthy();
      expect(view.queryByText(range)).toBeNull();
      expect(view.getByText('—')).toBeTruthy();
    },
  );

  it.each([
    [
      'en',
      'Today',
      'Delete fast?',
      'This cannot be undone.',
      ['Cancel', 'Delete'],
      'Fast deleted',
      'Failed to delete fast',
      'Please try again.',
    ],
    [
      'pl',
      'Dzisiaj',
      'Usunąć post?',
      'Tej operacji nie można cofnąć.',
      ['Anuluj', 'Usuń'],
      'Post usunięty',
      'Nie udało się usunąć postu',
      'Spróbuj ponownie.',
    ],
  ] as const)(
    'opens edit and handles delete in %s',
    (
      locale,
      rowLabel,
      title,
      message,
      expectedButtons,
      success,
      failure,
      retry,
    ) => {
      setTestLocale(locale);
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
      const fast = buildFast('edit-me', {
        end_time: '2026-02-15T10:30:00.000Z',
      });
      mockHistory = [fast];
      const view = render(<FastingHistorySheet ref={createRef()} />);
      fireEvent.press(view.getByText(rowLabel));
      expect(mockEditPresent).toHaveBeenCalledWith(fast);
      fireEvent.press(view.getByText(locale === 'en' ? 'Delete' : 'Usuń'));
      expect(Alert.alert).toHaveBeenCalledWith(
        title,
        message,
        expect.any(Array),
      );
      const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(
        -1,
      )?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      expect(alertButtons.map(button => button.text)).toEqual(expectedButtons);
      alertButtons[0].onPress?.();
      expect(mockDeleteFast).not.toHaveBeenCalled();
      alertButtons[1].onPress?.();
      expect(mockDeleteFast).toHaveBeenCalledWith('edit-me', expect.anything());
      const options = mockDeleteFast.mock.calls[0][1] as {
        onSuccess: () => void;
        onError: (error: Error) => void;
      };
      act(() => options.onSuccess());
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'success',
        text1: success,
      });
      mockDeleteFast.mockReset();
      fireEvent.press(view.getByText(locale === 'en' ? 'Delete' : 'Usuń'));
      const errorButtons = (Alert.alert as jest.Mock).mock.calls.at(
        -1,
      )?.[2] as {
        onPress?: () => void;
      }[];
      errorButtons[1].onPress?.();
      const errorOptions = mockDeleteFast.mock.calls[0][1] as {
        onError: (error: Error) => void;
      };
      act(() => errorOptions.onError(new Error('boom')));
      expect(Toast.show).toHaveBeenLastCalledWith({
        type: 'error',
        text1: failure,
        text2: retry,
      });
    },
  );

  it('does not show Load more for 24 records', () => {
    mockHistory = Array.from({ length: 24 }, (_, index) =>
      buildFast(`fast-${index}`),
    );
    const view = render(<FastingHistorySheet ref={createRef()} />);
    expect(view.queryByText('Load more')).toBeNull();
  });

  it('shows Load more for 25 records and paginates to 50 with offset zero', () => {
    mockHistory = Array.from({ length: 25 }, (_, index) =>
      buildFast(`fast-${index}`),
    );
    const view = render(<FastingHistorySheet ref={createRef()} />);
    expect(view.getByText('Load more')).toBeTruthy();
    fireEvent.press(view.getByText('Load more'));
    expect(mockHistoryCalls.at(-1)).toEqual({ limit: 50, offset: 0 });
  });

  it('updates row labels and times after EN to PL without changing data', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
    mockHistory = [
      buildFast('locale-row', {
        end_time: '2026-02-15T10:30:00.000Z',
        fasting_type: 'Circadian Rhythm',
      }),
    ];
    const view = render(<FastingHistorySheet ref={createRef()} />);
    expect(view.getByText('Today')).toBeTruthy();
    expect(view.getByText('Circadian Rhythm')).toBeTruthy();
    expect(view.getAllByText('Delete').length).toBeGreaterThan(0);
    setTestLocale('pl');
    view.rerender(<FastingHistorySheet ref={createRef()} />);
    expect(view.getByText('Dzisiaj')).toBeTruthy();
    expect(view.getByText('7:00 → 11:30')).toBeTruthy();
    expect(view.getByText('4 godz. 30 min')).toBeTruthy();
    expect(view.getByText('Rytm dobowy')).toBeTruthy();
    expect(view.getAllByText('Usuń').length).toBeGreaterThan(0);
  });
});
