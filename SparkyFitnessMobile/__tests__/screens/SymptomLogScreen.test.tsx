import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SymptomLogScreen from '../../src/screens/SymptomLogScreen';
import {
  useSymptomActions,
  useSymptomDefinitions,
  useSymptomEntriesDetailed,
  useSymptomEntry,
} from '../../src/hooks/useSymptoms';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'SymptomLog'>;

jest.mock('../../src/hooks/useSymptoms', () => ({
  useSymptomActions: jest.fn(),
  useSymptomDefinitions: jest.fn(),
  useSymptomEntriesDetailed: jest.fn(),
  useSymptomEntry: jest.fn(),
}));

jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (
        props: { onSelectDate: (day: string) => void },
        ref: React.Ref<unknown>
      ) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        mockCalendarProps = props;
        return <View testID="calendar-sheet" />;
      }
    ),
  };
});

jest.mock('../../src/components/TimeSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    dateToTimeString: (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    default: ReactModule.forwardRef(
      (
        props: { onSelectTime: (time: string) => void },
        ref: React.Ref<unknown>
      ) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        mockTimeProps = props;
        return <View testID="time-sheet" />;
      }
    ),
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
  useNativeIOSTabsActive: () => false,
}));

let mockCalendarProps: { onSelectDate: (day: string) => void } | undefined;
let mockTimeProps: { onSelectTime: (time: string) => void } | undefined;

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const logMutateAsync = jest.fn().mockResolvedValue(undefined);

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <SymptomLogScreen
        navigation={mockNavigation}
        route={{ key: 'SymptomLog', name: 'SymptomLog', params: undefined }}
      />
    </SafeAreaProvider>
  );

// Names the symptom, turns on episode tracking and saves.
const logEpisode = async (screen: ReturnType<typeof renderScreen>) => {
  fireEvent.changeText(
    screen.getByPlaceholderText('Or type custom symptom...'),
    'Headache'
  );
  fireEvent(screen.getByRole('switch'), 'valueChange', true);
};

const save = async (screen: ReturnType<typeof renderScreen>) => {
  await act(async () => {
    // The header title shares the label; the footer button comes last.
    fireEvent.press(screen.getAllByText('Log Symptom').slice(-1)[0]);
  });
};

describe('SymptomLogScreen back-dating', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useSymptomDefinitions as jest.Mock).mockReturnValue({ definitions: [] });
    (useSymptomEntriesDetailed as jest.Mock).mockReturnValue({ entries: [] });
    (useSymptomEntry as jest.Mock).mockReturnValue({
      entry: null,
      isLoading: false,
    });
    (useSymptomActions as jest.Mock).mockReturnValue({
      logEntry: { mutateAsync: logMutateAsync, isPending: false },
      updateEntry: { mutateAsync: jest.fn(), isPending: false },
      endEpisode: { mutateAsync: jest.fn(), isPending: false },
      removeEntry: { mutateAsync: jest.fn(), isPending: false },
    });
  });

  it('offers a -1d chip that starts the episode a day ago and lets the server pick the day', async () => {
    const screen = renderScreen();
    await logEpisode(screen);

    const before = Date.now();
    fireEvent.press(screen.getByText('-1d'));
    await save(screen);

    const body = logMutateAsync.mock.calls[0][0];
    const startedMs = new Date(body.started_at).getTime();
    expect(startedMs).toBeGreaterThanOrEqual(
      before - 24 * 60 * 60 * 1000 - 5000
    );
    expect(startedMs).toBeLessThanOrEqual(
      Date.now() - 24 * 60 * 60 * 1000 + 5000
    );
    expect(body.entry_date).toBeUndefined();
  });

  it('starts the episode on a picked date and time', async () => {
    const screen = renderScreen();
    await logEpisode(screen);

    act(() => mockCalendarProps?.onSelectDate('2020-03-05'));
    act(() => mockTimeProps?.onSelectTime('08:30'));
    await save(screen);

    const started = new Date(logMutateAsync.mock.calls[0][0].started_at);
    expect(started.getFullYear()).toBe(2020);
    expect(started.getMonth()).toBe(2);
    expect(started.getDate()).toBe(5);
    expect(started.getHours()).toBe(8);
    expect(started.getMinutes()).toBe(30);
  });

  it('clamps a picked start in the future to now', async () => {
    const screen = renderScreen();
    await logEpisode(screen);

    const before = Date.now();
    act(() => mockCalendarProps?.onSelectDate('2999-01-01'));
    await save(screen);

    const startedMs = new Date(
      logMutateAsync.mock.calls[0][0].started_at
    ).getTime();
    // Clamped to now, which is the minute the form already showed.
    expect(startedMs).toBeGreaterThanOrEqual(before - 60 * 1000);
    expect(startedMs).toBeLessThanOrEqual(Date.now());
  });

  it('keeps the diary day when the start was not moved', async () => {
    // Freeze only Date so a midnight rollover cannot split the expected day
    // from the day the screen computes while rendering.
    jest.useFakeTimers({
      now: new Date(2024, 5, 15, 12, 0, 0),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      const screen = renderScreen();
      await logEpisode(screen);
      await save(screen);

      expect(logMutateAsync.mock.calls[0][0].entry_date).toBe('2024-06-15');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the diary day when the time sheet is confirmed unchanged', async () => {
    jest.useFakeTimers({
      now: new Date(2024, 5, 15, 12, 0, 0),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      const screen = renderScreen();
      await logEpisode(screen);
      // Done on the sheet with the time it already showed.
      act(() => mockTimeProps?.onSelectTime('12:00'));
      await save(screen);

      expect(logMutateAsync.mock.calls[0][0].entry_date).toBe('2024-06-15');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the diary day when a changed start is put back', async () => {
    jest.useFakeTimers({
      now: new Date(2024, 5, 15, 12, 0, 0),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      const screen = renderScreen();
      await logEpisode(screen);
      act(() => mockCalendarProps?.onSelectDate('2024-06-10'));
      act(() => mockCalendarProps?.onSelectDate('2024-06-15'));
      await save(screen);

      expect(logMutateAsync.mock.calls[0][0].entry_date).toBe('2024-06-15');
    } finally {
      jest.useRealTimers();
    }
  });
});
