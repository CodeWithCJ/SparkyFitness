import React, { createRef } from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import type { ReactTestInstance } from 'react-test-renderer';
import FastingEditSheet, {
  type FastingEditSheetRef,
} from '../../src/components/FastingEditSheet';
import type { FastingLog } from '../../src/types/fasting';

const mockUpdateFast = jest.fn();
const mockDeleteFast = jest.fn();
let mockSavePending = false;
let mockDeletePending = false;
const mockSheetDismiss = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');

function setTestLocale(locale: 'en' | 'pl'): void {
  (
    globalThis as typeof globalThis & {
      __setTestLocale: (value: 'en' | 'pl') => void;
    }
  ).__setTestLocale(locale);
}

function buildFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-edit-1',
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

function findDisabledAncestor(
  node: ReactTestInstance,
): ReactTestInstance | null {
  let current: ReactTestInstance | null = node;
  while (current) {
    if (current.props.disabled !== undefined) return current;
    current = current.parent;
  }
  return null;
}

jest.mock('../../src/hooks/useFasting', () => ({
  useUpdateFast: () => ({ mutate: mockUpdateFast, isPending: mockSavePending }),
  useDeleteFast: () => ({
    mutate: mockDeleteFast,
    isPending: mockDeletePending,
  }),
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
        present: jest.fn(),
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

describe('FastingEditSheet', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockSavePending = false;
    mockDeletePending = false;
    mockUpdateFast.mockReset();
    mockDeleteFast.mockReset();
    mockSheetDismiss.mockClear();
    mockAlert.mockClear();
    mockAlert.mockImplementation(() => undefined);
    (Toast.show as jest.Mock).mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    [
      'en',
      'Edit fast',
      'Started',
      'Ended',
      'Time',
      'Save changes',
      'Delete fast',
      '4h 30m fasted',
    ],
    [
      'pl',
      'Edytuj post',
      'Rozpoczęto',
      'Zakończono',
      'Czas',
      'Zapisz zmiany',
      'Usuń post',
      'Czas postu: 4 godz. 30 min',
    ],
  ] as const)(
    'renders localized edit flow in %s',
    (locale, title, started, ended, time, save, del, duration) => {
      setTestLocale(locale);
      const ref = createRef<FastingEditSheetRef>();
      const view = render(<FastingEditSheet ref={ref} />);
      act(() => ref.current?.present(buildFast()));
      expect(view.getByText(title)).toBeTruthy();
      expect(view.getByText(started)).toBeTruthy();
      expect(view.getByText(ended)).toBeTruthy();
      expect(view.getByText(duration)).toBeTruthy();
      fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
      expect(view.getByText(time)).toBeTruthy();
      expect(view.getByText(save)).toBeTruthy();
      expect(view.getByText(del)).toBeTruthy();
    },
  );

  it('handles fallback dates and missing end time', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-13T10:30:00.000Z'));
    const ref = createRef<FastingEditSheetRef>();
    const view = render(<FastingEditSheet ref={ref} />);
    act(() =>
      ref.current?.present(buildFast({ start_time: 'bad', end_time: null })),
    );
    expect(view.getAllByText('Fri, Feb 13, 11:30 AM')).toHaveLength(2);
  });

  it('passes locale to both picker types and updates labels on EN to PL rerender', () => {
    const ref = createRef<FastingEditSheetRef>();
    const view = render(<FastingEditSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    setTestLocale('pl');
    view.rerender(<FastingEditSheet ref={ref} />);
    expect(view.getByText('Edytuj post')).toBeTruthy();
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(view.getAllByTestId('date-picker')).toHaveLength(2);
    expect(
      view
        .getAllByTestId('date-picker')
        .every(picker => picker.props.locale === 'pl-PL'),
    ).toBe(true);
  });

  it.each([
    ['en', 'Start time must be before the end time.', 'Save changes'],
    [
      'pl',
      'Czas rozpoczęcia musi być wcześniejszy niż czas zakończenia.',
      'Zapisz zmiany',
    ],
  ] as const)('blocks invalid ranges in %s', (locale, invalidRange, save) => {
    setTestLocale(locale);
    const ref = createRef<FastingEditSheetRef>();
    const view = render(<FastingEditSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
    act(() =>
      view
        .getAllByTestId('date-picker')[0]
        .props.onChange({ date: new Date('2026-02-14T10:30:00.000Z') }),
    );
    expect(view.getByText(invalidRange)).toBeTruthy();
    expect(findDisabledAncestor(view.getByText(save))?.props.disabled).toBe(
      true,
    );
    fireEvent.press(view.getByText(save));
    expect(mockUpdateFast).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'Save changes', 'Fast updated'],
    ['pl', 'Zapisz zmiany', 'Post zaktualizowany'],
  ] as const)(
    'sends exact update payload and handles update success in %s',
    (locale, save, updated) => {
      setTestLocale(locale);
      const onSaved = jest.fn();
      const ref = createRef<FastingEditSheetRef>();
      const view = render(<FastingEditSheet ref={ref} onSaved={onSaved} />);
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
      act(() =>
        view
          .getAllByTestId('date-picker')[0]
          .props.onChange({ date: new Date('2026-02-14T10:30:00.000Z') }),
      );
      fireEvent.press(view.getByText(save));
      expect(mockUpdateFast).not.toHaveBeenCalled();
      fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[0]);
      fireEvent.press(view.UNSAFE_getAllByType(TouchableOpacity)[1]);
      act(() =>
        view
          .getAllByTestId('date-picker')[0]
          .props.onChange({ date: new Date('2026-02-15T12:00:00.000Z') }),
      );
      fireEvent.press(view.getByText(save));
      expect(mockUpdateFast).toHaveBeenCalledWith(
        {
          id: 'fast-edit-1',
          updates: {
            start_time: '2026-02-14T10:30:00.000Z',
            end_time: '2026-02-15T12:00:00.000Z',
          },
        },
        expect.anything(),
      );
      const options = mockUpdateFast.mock.calls[0][1] as {
        onSuccess: () => void;
      };
      act(() => options.onSuccess());
      expect(mockSheetDismiss).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'success',
        text1: updated,
      });
    },
  );

  it.each([
    ['en', 'Failed to update fast', 'Please try again.'],
    ['pl', 'Nie udało się zaktualizować postu', 'Spróbuj ponownie.'],
  ] as const)(
    'handles update error without dismissing in %s',
    (locale, updateFailed, retry) => {
      const onSaved = jest.fn();
      setTestLocale(locale);
      const ref = createRef<FastingEditSheetRef>();
      const view = render(<FastingEditSheet ref={ref} onSaved={onSaved} />);
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(
        view.getByText(locale === 'en' ? 'Save changes' : 'Zapisz zmiany'),
      );
      const updateOptions = mockUpdateFast.mock.calls[0][1] as {
        onSuccess: () => void;
        onError: (error: Error) => void;
      };
      mockSheetDismiss.mockClear();
      onSaved.mockClear();
      act(() => updateOptions.onError(new Error('boom')));
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: updateFailed,
        text2: retry,
      });
      expect(mockSheetDismiss).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['en', 'Delete fast?', 'This cannot be undone.', ['Cancel', 'Delete']],
    [
      'pl',
      'Usunąć post?',
      'Tej operacji nie można cofnąć.',
      ['Anuluj', 'Usuń'],
    ],
  ] as const)(
    'shows the complete delete alert in %s',
    (locale, title, message, buttons) => {
      setTestLocale(locale);
      const ref = createRef<FastingEditSheetRef>();
      const view = render(<FastingEditSheet ref={ref} />);
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(
        view.getByText(locale === 'en' ? 'Delete fast' : 'Usuń post'),
      );
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
      expect(alertButtons.map(button => button.text)).toEqual(buttons);
      alertButtons[0].onPress?.();
      expect(mockDeleteFast).not.toHaveBeenCalled();
      alertButtons[1].onPress?.();
      expect(mockDeleteFast).toHaveBeenCalledWith(
        'fast-edit-1',
        expect.anything(),
      );
    },
  );

  it.each([
    ['en', 'Fast deleted', 'Failed to delete fast', 'Please try again.'],
    ['pl', 'Post usunięty', 'Nie udało się usunąć postu', 'Spróbuj ponownie.'],
  ] as const)(
    'handles delete success and error in %s',
    (locale, deleted, deleteFailed, retry) => {
      setTestLocale(locale);
      const onSaved = jest.fn();
      const ref = createRef<FastingEditSheetRef>();
      const view = render(<FastingEditSheet ref={ref} onSaved={onSaved} />);
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(
        view.getByText(locale === 'en' ? 'Delete fast' : 'Usuń post'),
      );
      let alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        onPress?: () => void;
      }[];
      alertButtons[1].onPress?.();
      const deleteOptions = mockDeleteFast.mock.calls[0][1] as {
        onSuccess: () => void;
        onError: (error: Error) => void;
      };
      act(() => deleteOptions.onSuccess());
      expect(mockSheetDismiss).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'success',
        text1: deleted,
      });

      mockSheetDismiss.mockClear();
      onSaved.mockClear();
      mockDeleteFast.mockReset();
      act(() => ref.current?.present(buildFast()));
      fireEvent.press(
        view.getByText(locale === 'en' ? 'Delete fast' : 'Usuń post'),
      );
      alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        onPress?: () => void;
      }[];
      alertButtons[1].onPress?.();
      const errorOptions = mockDeleteFast.mock.calls[0][1] as {
        onError: (error: Error) => void;
      };
      act(() => errorOptions.onError(new Error('boom')));
      expect(mockSheetDismiss).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(Toast.show).toHaveBeenLastCalledWith({
        type: 'error',
        text1: deleteFailed,
        text2: retry,
      });
    },
  );

  it('blocks both buttons while save is pending and restores them afterward', () => {
    const ref = createRef<FastingEditSheetRef>();
    const view = render(<FastingEditSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    mockSavePending = true;
    mockDeletePending = false;
    view.rerender(<FastingEditSheet ref={ref} />);
    const saveButton = findDisabledAncestor(view.getByText('Saving...'));
    const deleteButton = findDisabledAncestor(view.getByText('Delete fast'));
    expect(saveButton?.props.disabled).toBe(true);
    expect(deleteButton?.props.disabled).toBe(true);
    expect(mockUpdateFast).not.toHaveBeenCalled();
    expect(mockDeleteFast).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    mockSavePending = false;
    view.rerender(<FastingEditSheet ref={ref} />);
    expect(
      findDisabledAncestor(view.getByText('Save changes'))?.props.disabled,
    ).toBe(false);
    expect(
      findDisabledAncestor(view.getByText('Delete fast'))?.props.disabled,
    ).toBe(false);
  });

  it('blocks both buttons while delete is pending and restores them afterward', () => {
    const ref = createRef<FastingEditSheetRef>();
    const view = render(<FastingEditSheet ref={ref} />);
    act(() => ref.current?.present(buildFast()));
    mockDeletePending = true;
    view.rerender(<FastingEditSheet ref={ref} />);
    const saveButton = findDisabledAncestor(view.getByText('Save changes'));
    const deleteButton = findDisabledAncestor(view.getByText('Deleting...'));
    expect(saveButton?.props.disabled).toBe(true);
    expect(deleteButton?.props.disabled).toBe(true);
    expect(mockUpdateFast).not.toHaveBeenCalled();
    expect(mockDeleteFast).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    mockDeletePending = false;
    view.rerender(<FastingEditSheet ref={ref} />);
    expect(
      findDisabledAncestor(view.getByText('Save changes'))?.props.disabled,
    ).toBe(false);
    expect(
      findDisabledAncestor(view.getByText('Delete fast'))?.props.disabled,
    ).toBe(false);
  });
});
