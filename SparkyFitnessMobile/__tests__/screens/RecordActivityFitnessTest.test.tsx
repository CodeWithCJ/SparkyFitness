import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RecordActivityScreen from '../../src/screens/RecordActivityScreen';
import {
  discardRecording,
  elapsedSeconds,
  startRecording,
  useGpsRecording,
  type RecordingSession,
  type RecordingSnapshot,
} from '../../src/services/gpsRecordingService';
import { useWatchConnectivity } from '../../src/hooks/useWatchConnectivity';
import { startRunOnWatch } from '../../src/services/watchRunControl';
import { useRunProgram } from '../../src/services/runProgramService';
import { saveRecordedActivity } from '../../src/services/gpsRecordingSave';
import { saveFitnessTest } from '../../src/services/fitnessTestService';
import { speakRecordingCue } from '../../src/services/recordingCues';
import { fireSuccessHaptic } from '../../src/services/haptics';
import { initializeI18n } from '../../src/localization/i18n';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { FitnessTestType } from '@workspace/shared';
import { fitnessTest } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/gpsRecordingService', () => {
  class RecordingPermissionError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  }
  return {
    RecordingPermissionError,
    useGpsRecording: jest.fn(),
    useLatestGpsFix: jest.fn(() => ({ hacc: 6, t: Date.now() })),
    hydrate: jest.fn(() => Promise.resolve()),
    markLap: jest.fn(() => Promise.resolve(1)),
    startRecording: jest.fn(() => Promise.resolve()),
    pauseRecording: jest.fn(() => Promise.resolve()),
    resumeRecording: jest.fn(() => Promise.resolve()),
    setRecordingAutoPause: jest.fn(() => Promise.resolve()),
    setRecordingAudioCues: jest.fn(() => Promise.resolve()),
    finishRecording: jest.fn(() => Promise.resolve()),
    discardRecording: jest.fn(() => Promise.resolve()),
    getHeartRateSamples: jest.fn(() => Promise.resolve([])),
    elapsedSeconds: jest.fn(() => 300),
    getRecordingPreferences: jest.fn(() =>
      Promise.resolve({
        autoPause: true,
        audioCues: false,
        paceBand: null,
        heartRateBand: null,
        countdownSeconds: 0,
      })
    ),
    setRecordingPreference: jest.fn(() => Promise.resolve()),
    setCountdownPreference: jest.fn(() => Promise.resolve()),
    setPaceBandPreference: jest.fn(() => Promise.resolve()),
    setRecordingPaceBand: jest.fn(() => Promise.resolve()),
    setHeartRateBandPreference: jest.fn(() => Promise.resolve()),
    setRecordingHeartRateBand: jest.fn(() => Promise.resolve()),
    COUNTDOWN_CHOICES: [0, 3, 5, 10],
  };
});
jest.mock('../../src/hooks/useWatchConnectivity', () => ({
  useWatchConnectivity: jest.fn(() => ({
    isSupported: false,
    isPaired: false,
    isReachable: false,
  })),
}));
jest.mock('../../src/services/watchRunControl', () => ({
  startRunOnWatch: jest.fn(() => Promise.resolve('q1')),
}));
jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  completeProgramWorkout: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/fitnessTestService', () => ({
  saveFitnessTest: jest.fn(),
}));
jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
  stopRecordingCues: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('../../src/services/gpsRecordingSave', () => ({
  saveRecordedActivity: jest.fn(),
}));
jest.mock('../../src/hooks/useIndoorDistanceEstimate', () => ({
  useIndoorDistanceEstimate: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useHeartRateZones', () => ({
  useHeartRateZones: () => ({ zones: undefined }),
}));
jest.mock('../../src/hooks/useSuggestedRanges', () => ({
  useSuggestedRanges: () => ({ pace: null, heartRate: null, byEffort: null }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const DEG_PER_METER = 1 / 111_194.9;
const START = new Date(2026, 9, 18, 8, 0, 0).getTime();

const session = (
  overrides: Partial<RecordingSession> = {}
): RecordingSession => ({
  id: 'rec-1',
  activity: 'run',
  status: 'recording',
  startedAt: START,
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  ...overrides,
});

/** A fix every 10 s going north at `mps` for `seconds`. */
const track = (seconds: number, mps: number): RecordedPoint[] =>
  Array.from({ length: seconds / 10 + 1 }, (_, i) => ({
    t: START + i * 10_000,
    lat: 51.5 + i * 10 * mps * DEG_PER_METER,
    lon: -0.12,
    alt: null,
    hacc: 5,
    vacc: null,
    speed: null,
    course: null,
    seg: 0,
  }));

const state = (s: RecordingSession | null, points: RecordedPoint[] = []) =>
  jest
    .mocked(useGpsRecording)
    .mockReturnValue({ session: s, points } as RecordingSnapshot);

const navigation = {
  goBack: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};

const renderScreen = async (
  fitnessTestParam?: FitnessTestType,
  indoorParam?: boolean
) => {
  const props = {
    navigation,
    route: {
      key: 'RecordActivity',
      name: 'RecordActivity',
      params: fitnessTestParam
        ? {
            fitnessTest: fitnessTestParam,
            ...(indoorParam !== undefined ? { indoor: indoorParam } : {}),
          }
        : undefined,
    },
  } as unknown as RootStackScreenProps<'RecordActivity'>;
  const screen = render(
    <QueryClientProvider client={new QueryClient()}>
      <RecordActivityScreen {...props} />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.queryByTestId('record-activity-loading')).toBeNull()
  );
  return screen;
};

describe('RecordActivityScreen fitness test', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(elapsedSeconds).mockReturnValue(300);
    jest.mocked(useRunProgram).mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
      refetch: jest.fn(() => Promise.resolve()),
    } as never);
  });

  describe('before Start', () => {
    it('shows the guided test instead of the ordinary setup', async () => {
      state(null);
      const screen = await renderScreen('cooper');
      expect(screen.getByTestId('fitness-test-setup')).toBeTruthy();
      expect(screen.getByText('12-minute Cooper test')).toBeTruthy();
      // None of the ordinary choices apply to a test.
      expect(screen.queryByText('Outdoor')).toBeNull();
      expect(screen.queryByTestId('auto-pause-switch')).toBeNull();
      expect(screen.queryByText('Intervals')).toBeNull();
    });

    it('records a plain outdoor run marked as the chosen test', async () => {
      state(null);
      const screen = await renderScreen('30min');
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'run',
          fitnessTest: '30min',
          indoor: false,
          // Pauses would take time out of a timed test.
          autoPause: false,
        })
      );
      // No plan, pace alert or program comes with a test.
      const options = jest.mocked(startRecording).mock.calls[0][0];
      expect(options).not.toHaveProperty('intervals');
      expect(options).not.toHaveProperty('program');
      expect(options).not.toHaveProperty('paceBand');
    });

    it('records on the phone even with a watch paired', async () => {
      jest.mocked(useWatchConnectivity).mockReturnValue({
        isSupported: true,
        isPaired: true,
        isReachable: true,
      } as never);
      state(null);
      const screen = await renderScreen('5k');
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRunOnWatch).not.toHaveBeenCalled();
    });

    it('is the ordinary screen when opened without a test', async () => {
      state(null);
      const screen = await renderScreen();
      expect(screen.queryByTestId('fitness-test-setup')).toBeNull();
      expect(screen.getByText('Outdoor')).toBeTruthy();
    });
  });

  describe('while recording', () => {
    it('guides the test being run', async () => {
      state(session({ fitnessTest: '5k' }), track(300, 5));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-card')).toBeTruthy();
      expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
        'Run evenly and hard. 3.50 km to go until 5 km.'
      );
    });

    it('shows no test card for an ordinary run', async () => {
      state(session(), track(300, 5));
      const screen = await renderScreen();
      expect(screen.queryByTestId('fitness-test-card')).toBeNull();
    });

    it('buzzes and speaks when the test reaches its mark', async () => {
      // 12 minutes of active time on the clock: the Cooper test is done.
      jest.mocked(elapsedSeconds).mockReturnValue(720);
      state(session({ fitnessTest: 'cooper', audioCues: 'km' }), track(720, 4));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
        'Test complete. Slow down and tap Finish.'
      );
      expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(speakRecordingCue).toHaveBeenCalledWith(
        'Test complete. Slow down and finish.'
      );
    });

    it('buzzes without speaking when voice cues are off', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(720);
      state(session({ fitnessTest: 'cooper' }), track(720, 4));
      await renderScreen();
      expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(speakRecordingCue).not.toHaveBeenCalled();
    });

    it('stays quiet before the mark', async () => {
      state(session({ fitnessTest: 'cooper' }), track(300, 4));
      await renderScreen();
      expect(fireSuccessHaptic).not.toHaveBeenCalled();
    });
  });

  describe('after Finish', () => {
    const finished = (type: FitnessTestType) =>
      session({
        status: 'finished',
        finishedAt: START + 1_100_000,
        fitnessTest: type,
      });

    it('files the test against the saved activity and opens the result', async () => {
      // 5 m/s: 5 km at 1000 s, then a minute and a half of cooling down.
      state(finished('5k'), track(1090, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest
        .mocked(saveFitnessTest)
        .mockResolvedValue(fitnessTest({ id: 'saved-test' }));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-finished')).toBeTruthy();
      expect(
        screen.getByText(/Threshold pace .*Saving sets your training paces/)
      ).toBeTruthy();

      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith('FitnessTestResult', {
          id: 'saved-test',
        })
      );
      expect(saveFitnessTest).toHaveBeenCalledWith({
        test_type: '5k',
        test_date: '2026-10-18',
        distance_meters: 5000,
        duration_seconds: 1000,
        split_distance_meters: null,
        exercise_entry_id: 'entry-1',
        surface: 'outdoor',
        incline_percent: null,
        incline_adjusted: false,
      });
      // The activity is saved first, so the test can name it.
      expect(
        jest.mocked(saveRecordedActivity).mock.invocationCallOrder[0]
      ).toBeLessThan(jest.mocked(saveFitnessTest).mock.invocationCallOrder[0]);
      expect(discardRecording).toHaveBeenCalled();
    });

    it('sends the 10-minute split of a 30-minute run', async () => {
      state(finished('30min'), track(1800, 4));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({
          test_type: '30min',
          distance_meters: 7200,
          split_distance_meters: 2400,
          duration_seconds: 1800,
        })
      );
    });

    it('saves a test stopped early as an ordinary run', async () => {
      state(finished('5k'), track(600, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      const screen = await renderScreen();
      expect(screen.getByText(/saved as an ordinary run/)).toBeTruthy();

      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          'RunSummary',
          expect.anything()
        )
      );
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });

    it('keeps the recording when the test cannot be saved', async () => {
      state(finished('5k'), track(1090, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest.mocked(saveFitnessTest).mockRejectedValue(new Error('offline'));
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(discardRecording).not.toHaveBeenCalled();
      expect(navigation.replace).not.toHaveBeenCalled();
    });

    it('files no test for an ordinary run', async () => {
      state(
        session({ status: 'finished', finishedAt: START + 600_000 }),
        track(600, 4)
      );
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });
  });

  describe('on a treadmill', () => {
    const treadmill = (
      type: FitnessTestType,
      overrides: Partial<RecordingSession> = {}
    ) =>
      session({
        status: 'finished',
        finishedAt: START + 1_900_000,
        fitnessTest: type,
        indoor: true,
        ...overrides,
      });
    const saved = () =>
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
    const typeDistance = (
      screen: Awaited<ReturnType<typeof renderScreen>>,
      text: string
    ) => fireEvent.changeText(screen.getByLabelText('Distance'), text);

    it('starts a treadmill test when Treadmill is chosen', async () => {
      state(null);
      const screen = await renderScreen('30min');
      fireEvent.press(screen.getByText('Treadmill'));
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'run',
          indoor: true,
          fitnessTest: '30min',
          autoPause: false,
        })
      );
    });

    it('opens on the surface the last test used', async () => {
      state(null);
      const screen = await renderScreen('5k', true);
      expect(
        screen.getByText(/On a treadmill nothing is tracked by GPS/)
      ).toBeTruthy();
      expect(screen.getByText(/Suggested because your last test/)).toBeTruthy();
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({ indoor: true })
      );
    });

    it('opens outdoors with no earlier test, and says nothing about a suggestion', async () => {
      state(null);
      const screen = await renderScreen('5k');
      expect(screen.getByText(/Outdoors the test is recorded/)).toBeTruthy();
      expect(screen.queryByText(/Suggested because your last test/)).toBeNull();
    });

    it('guides a treadmill 5K by the clock', async () => {
      state(session({ fitnessTest: '5k', indoor: true }));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
        'Run evenly and hard. Tap Finish when your treadmill reaches 5 km. Time 5:00.'
      );
    });

    it('ends a treadmill Cooper test on the clock', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(720);
      state(session({ fitnessTest: 'cooper', indoor: true }));
      await renderScreen();
      expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('asks for the distance and the incline, with the correction on by default', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      const screen = await renderScreen();
      expect(screen.getByTestId('indoor-test-fields')).toBeTruthy();
      expect(screen.getByTestId('indoor-test-incline').props.value).toBe('1');
      expect(
        screen.getByText(/Enter the distance your treadmill shows/)
      ).toBeTruthy();
    });

    it('files a Cooper test with the typed distance, incline and surface', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      jest
        .mocked(saveFitnessTest)
        .mockResolvedValue(fitnessTest({ id: 'tm-1' }));
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith('FitnessTestResult', {
          id: 'tm-1',
        })
      );
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.objectContaining({ indoor: true }),
        expect.anything(),
        'km',
        2.8,
        null,
        false
      );
      expect(saveFitnessTest).toHaveBeenCalledWith({
        test_type: 'cooper',
        test_date: '2026-10-18',
        distance_meters: 2800,
        duration_seconds: 720,
        split_distance_meters: null,
        exercise_entry_id: 'entry-1',
        surface: 'indoor',
        incline_percent: 1,
        incline_adjusted: true,
      });
    });

    it('shows the raw and adjusted numbers for a steeper incline', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      expect(screen.queryByTestId('fitness-test-adjustment')).toBeNull();
      fireEvent.changeText(screen.getByTestId('indoor-test-incline'), '3');
      expect(screen.getByTestId('fitness-test-adjustment').props.children).toBe(
        'Adjusted for 3% incline: 2,800 m in 12 minutes counts as 3,041 m in 12 minutes.'
      );
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({
          incline_percent: 3,
          incline_adjusted: true,
        })
      );
    });

    it('uses the numbers as they are when the correction is switched off', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      fireEvent.changeText(screen.getByTestId('indoor-test-incline'), '3');
      fireEvent(screen.getByTestId('indoor-test-adjust'), 'valueChange', false);
      expect(screen.queryByTestId('fitness-test-adjustment')).toBeNull();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({ incline_percent: 3, incline_adjusted: false })
      );
    });

    it('files no incline when the field is left empty', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      fireEvent.changeText(screen.getByTestId('indoor-test-incline'), '');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({
          incline_percent: null,
          incline_adjusted: false,
        })
      );
    });

    it('will not save with an incline outside 0 to 15', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      fireEvent.changeText(screen.getByTestId('indoor-test-incline'), '20');
      expect(screen.getByText('Enter an incline from 0 to 15.')).toBeTruthy();
      fireEvent.press(screen.getByText('Save activity'));
      expect(saveRecordedActivity).not.toHaveBeenCalled();
    });

    it('saves a treadmill test with no distance as an ordinary run', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          'RunSummary',
          expect.anything()
        )
      );
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });

    it('does not count a Cooper test that stopped before 12 minutes', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(500);
      state(treadmill('cooper'));
      saved();
      const screen = await renderScreen();
      typeDistance(screen, '2.0');
      expect(screen.getByText(/stopped before its mark/)).toBeTruthy();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });

    it('takes a 5K time from the clock, and logs the run as 5 km', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(1503);
      state(treadmill('5k'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      expect(screen.getByTestId('indoor-test-time').props.value).toBe('25:03');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'km',
        5,
        null,
        // Nothing was typed in the distance box.
        true
      );
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({
          test_type: '5k',
          distance_meters: 5000,
          duration_seconds: 1503,
          surface: 'indoor',
        })
      );
    });

    it('takes the 5K time the person typed', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(1503);
      state(treadmill('5k'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      fireEvent.changeText(screen.getByTestId('indoor-test-time'), '24:55');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({ duration_seconds: 1495 })
      );
    });

    it('saves an unreadable 5K time as an ordinary run, and says why', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(1503);
      state(treadmill('5k'));
      saved();
      const screen = await renderScreen();
      fireEvent.changeText(screen.getByTestId('indoor-test-time'), 'fast');
      expect(screen.getByText(/minutes and seconds, like 24:30/)).toBeTruthy();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });

    it('sends the distance at 10:00 for a 30-minute run, or assumes a steady pace', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(1805);
      state(treadmill('30min'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      typeDistance(screen, '6.6');
      fireEvent.changeText(screen.getByTestId('indoor-test-split'), '2');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          test_type: '30min',
          distance_meters: 6600,
          split_distance_meters: 2000,
          duration_seconds: 1800,
        })
      );
    });

    it('assumes a steady pace for the 30-minute run when the split is empty', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(1805);
      state(treadmill('30min'));
      saved();
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      typeDistance(screen, '6.6');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({ split_distance_meters: 2200 })
      );
    });

    it('keeps the recording when the treadmill test cannot be saved', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(725);
      state(treadmill('cooper'));
      saved();
      jest.mocked(saveFitnessTest).mockRejectedValue(new Error('offline'));
      const screen = await renderScreen();
      typeDistance(screen, '2.8');
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(discardRecording).not.toHaveBeenCalled();
      expect(navigation.replace).not.toHaveBeenCalled();
    });
  });
});
