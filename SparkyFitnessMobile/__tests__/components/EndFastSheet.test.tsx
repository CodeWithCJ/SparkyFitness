import React, { createRef } from 'react';
import { TouchableOpacity } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import EndFastSheet, {
  type EndFastSheetRef,
} from '../../src/components/EndFastSheet';
import type { FastingLog } from '../../src/types/fasting';

const mockEndFast = jest.fn();
let mockPending = false;
const mockSheetPresent = jest.fn();
const mockSheetDismiss = jest.fn();

function setTestLocale(locale: 'en' | 'pl'): void {
  (
    globalThis as typeof globalThis & {
      __setTestLocale: (value: 'en' | 'pl') => void;
    }
  ).__setTestLocale(locale);
}

function buildFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1',
    user_id: 'user-1',
    start_time: '2026-02-13T06:00:00.000Z',
    end_time: null,
    target_end_time: null,
    duration_minutes: null,
    fasting_type: '16:8 Leangains',
    status: 'ACTIVE',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

jest.mock('../../src/hooks/useFasting', () => ({
  useEndFast: () => ({ mutate: mockEndFast, isPending: mockPending }),
}));
jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  getAppLocale: () =>
    globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US',
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactNative = require('react');
  const RN = require('react-native');
  const BottomSheetModal = ReactNative.forwardRef(
    (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactNative.useImperativeHandle(ref, () => ({
        present: mockSheetPresent,
        dismiss: mockSheetDismiss,
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

describe('EndFastSheet', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockPending = false;
    mockEndFast.mockReset();
    mockSheetPresent.mockClear();
    mockSheetDismiss.mockClear();
    (Toast.show as jest.Mock).mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['en', 'End fast', 'Started', 'Ended', 'Time', 'End Fast', '4h 30m fasted'],
    [
      'pl',
      'Zakończ post',
      'Rozpoczęto',
      'Zakończono',
      'Czas',
      'Zakończ post',
      'Czas postu: 4 godz. 30 min',
    ],
  ] as const)(
    'renders localized end flow in %s',
    (locale, title, started, ended, time, action, duration) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-13T10:30:00.000Z'));
      setTestLocale(locale);
      const ref = createRef<EndFastSheetRef>();
      const view = render(<EndFastSheet ref={ref} />);
      act(() => ref.current?.present(buildFast()));
      expect(view.getAllByText(title).length).toBeGreaterThan(0);
      expect(view.getByText(started)).toBeTruthy();
      expect(view.getByText(ended)).toBeTruthy();
      expect(view.getByText(duration)).toBeTruthy();
      fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
      expect(view.getByText(time)).toBeTruthy();
      expect(view.getAllByText(action).length).toBeGreaterThan(0);
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };
      const formatLocale = locale === 'en' ? 'en-US' : 'pl-PL';
      expect(
        view.getByText(
          new Date('2026-02-13T06:00:00.000Z').toLocaleString(
            formatLocale,
            dateOptions,
          ),
        ),
      ).toBeTruthy();
      expect(
        view.getByText(
          new Date('2026-02-13T10:30:00.000Z').toLocaleString(
            formatLocale,
            dateOptions,
          ),
        ),
      ).toBeTruthy();
    },
  );

  it('uses current time for end, falls back invalid start, and delegates dismiss', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-13T10:30:00.000Z'));
    const ref = createRef<EndFastSheetRef>();
    const view = render(<EndFastSheet ref={ref} />);
    act(() => ref.current?.present(buildFast({ start_time: 'not-a-date' })));
    expect(view.getAllByText('Fri, Feb 13, 11:30 AM')).toHaveLength(2);
    fireEvent.press(view.getByText('End Fast'));
    expect(mockEndFast).not.toHaveBeenCalled();
    act(() => ref.current?.dismiss());
    expect(mockSheetDismiss).toHaveBeenCalledTimes(1);
  });

  it('opens both picker types and passes the current locale', () => {
    setTestLocale('pl');
    const ref = createRef<EndFastSheetRef>();
    const view = render(<EndFastSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    const rows = view.UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(rows[0]);
    expect(view.getAllByTestId('date-picker')).toHaveLength(2);
    expect(
      view
        .getAllByTestId('date-picker')
        .every(picker => picker.props.locale === 'pl-PL'),
    ).toBe(true);
    fireEvent.press(rows[0]);
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[1]);
    expect(view.getAllByTestId('date-picker')).toHaveLength(2);
  });

  it('rejects invalid ranges and sends exact ISO payload for valid picker changes', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-13T10:30:00.000Z'));
    const ref = createRef<EndFastSheetRef>();
    const view = render(<EndFastSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    const rows = view.UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(rows[0]);
    const startPicker = view.getAllByTestId('date-picker')[0];
    act(() =>
      startPicker.props.onChange({
        date: new Date('2026-02-14T10:30:00.000Z'),
      }),
    );
    fireEvent.press(view.getByText('End Fast'));
    expect(mockEndFast).not.toHaveBeenCalled();
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[1]);
    const endPickers = view.getAllByTestId('date-picker');
    act(() =>
      endPickers[0].props.onChange({
        date: new Date('2026-02-15T12:00:00.000Z'),
      }),
    );
    fireEvent.press(view.getByText('End Fast'));
    expect(mockEndFast).toHaveBeenCalledWith(
      {
        id: 'fast-1',
        startTime: '2026-02-14T10:30:00.000Z',
        endTime: '2026-02-15T12:00:00.000Z',
      },
      expect.anything(),
    );
  });

  it.each([
    [
      'en',
      'Ending...',
      'Fast ended',
      'Failed to end fast',
      'Please try again.',
    ],
    [
      'pl',
      'Kończenie...',
      'Post zakończony',
      'Nie udało się zakończyć postu',
      'Spróbuj ponownie.',
    ],
  ] as const)(
    'handles pending, success and error in %s',
    (locale, pending, success, failure, retry) => {
      setTestLocale(locale);
      const onEnded = jest.fn();
      const ref = createRef<EndFastSheetRef>();
      const view = render(<EndFastSheet ref={ref} onEnded={onEnded} />);
      act(() => ref.current?.present(buildFast()));
      mockPending = true;
      view.rerender(<EndFastSheet ref={ref} onEnded={onEnded} />);
      expect(view.getByText(pending)).toBeTruthy();
      mockPending = false;
      view.rerender(<EndFastSheet ref={ref} onEnded={onEnded} />);
      fireEvent.press(
        view
          .getAllByText(locale === 'en' ? 'End Fast' : 'Zakończ post')
          .at(-1)!,
      );
      const options = mockEndFast.mock.calls[0][1] as {
        onSuccess: () => void;
        onError: (error: Error) => void;
      };
      act(() => options.onSuccess());
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'success',
        text1: success,
      });
      expect(onEnded).toHaveBeenCalledTimes(1);
      mockEndFast.mockReset();
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(
        view
          .getAllByText(locale === 'en' ? 'End Fast' : 'Zakończ post')
          .at(-1)!,
      );
      const errorOptions = mockEndFast.mock.calls[0][1] as {
        onError: (error: Error) => void;
      };
      act(() => errorOptions.onError(new Error('boom')));
      expect(Toast.show).toHaveBeenLastCalledWith({
        type: 'error',
        text1: failure,
        text2: retry,
      });
      expect(onEnded).toHaveBeenCalledTimes(1);
    },
  );

  it('updates visible labels and picker locales after EN to PL without changing dates', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-13T10:30:00.000Z'));
    const ref = createRef<EndFastSheetRef>();
    const view = render(<EndFastSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    expect(view.getByText('End fast')).toBeTruthy();
    setTestLocale('pl');
    view.rerender(<EndFastSheet ref={ref} />);
    expect(view.getAllByText('Zakończ post').length).toBeGreaterThan(0);
    expect(view.getByText('Rozpoczęto')).toBeTruthy();
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(view.getByText('Czas')).toBeTruthy();
    expect(
      view
        .getAllByTestId('date-picker')
        .every(picker => picker.props.locale === 'pl-PL'),
    ).toBe(true);
  });
});
