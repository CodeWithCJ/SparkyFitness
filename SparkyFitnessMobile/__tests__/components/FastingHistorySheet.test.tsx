import React, { createRef } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import FastingHistorySheet from '../../src/components/FastingHistorySheet';
import type { FastingLog } from '../../src/types/fasting';

let mockHistory: FastingLog[] | undefined = [];
let mockIsLoading = false;
const mockHistoryCalls: { limit: number; offset: number }[] = [];
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
      },
      _ref: React.Ref<unknown>,
    ) =>
      ReactNative.createElement(
        RN.View,
        null,
        props.children,
        props.renderRightActions ? props.renderRightActions() : null,
      ),
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
        buildFast('active', { status: 'ACTIVE' }),
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
      expect(view.queryByText('ACTIVE')).toBeNull();
      expect(view.getByText('—')).toBeTruthy();
      expect(mockHistoryCalls[0]).toEqual({ limit: 25, offset: 0 });
    },
  );

  it('opens edit with the exact row object and deletes the exact id after confirmation', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
    const fast = buildFast('edit-me', { end_time: '2026-02-15T10:30:00.000Z' });
    mockHistory = [fast];
    const view = render(<FastingHistorySheet ref={createRef()} />);
    fireEvent.press(view.getByText('Today'));
    expect(mockEditPresent).toHaveBeenCalledWith(fast);
    fireEvent.press(view.getByText('Delete'));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    expect(buttons.map(button => button.text)).toEqual(['Cancel', 'Delete']);
    buttons[0].onPress?.();
    expect(mockDeleteFast).not.toHaveBeenCalled();
    buttons[1].onPress?.();
    expect(mockDeleteFast).toHaveBeenCalledWith('edit-me', expect.anything());
    const options = mockDeleteFast.mock.calls[0][1] as {
      onSuccess: () => void;
      onError: (error: Error) => void;
    };
    act(() => options.onSuccess());
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Fast deleted',
    });
    mockDeleteFast.mockReset();
    fireEvent.press(view.getByText('Delete'));
    const errorButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
      onPress?: () => void;
    }[];
    errorButtons[1].onPress?.();
    const errorOptions = mockDeleteFast.mock.calls[0][1] as {
      onError: (error: Error) => void;
    };
    act(() => errorOptions.onError(new Error('boom')));
    expect(Toast.show).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Failed to delete fast',
      text2: 'Please try again.',
    });
  });

  it('paginates 25 to 50 while keeping offset zero', () => {
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
      buildFast('locale-row', { end_time: '2026-02-15T10:30:00.000Z' }),
    ];
    const view = render(<FastingHistorySheet ref={createRef()} />);
    expect(view.getByText('Today')).toBeTruthy();
    setTestLocale('pl');
    view.rerender(<FastingHistorySheet ref={createRef()} />);
    expect(view.getByText('Dzisiaj')).toBeTruthy();
    expect(view.getByText('7:00 → 11:30')).toBeTruthy();
    expect(view.getByText('4 godz. 30 min')).toBeTruthy();
  });
});
