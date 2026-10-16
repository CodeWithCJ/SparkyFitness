import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RecordActivityScreen from '../../src/screens/RecordActivityScreen';
import {
  RecordingPermissionError,
  discardRecording,
  finishRecording,
  getRecordingPreferences,
  hydrate,
  pauseRecording,
  startRecording,
  markLap,
  setRecordingAudioCues,
  setHeartRateBandPreference,
  setPaceBandPreference,
  setRecordingPaceBand,
  setRecordingAutoPause,
  useGpsRecording,
  type RecordingSession,
  type RecordingSnapshot,
} from '../../src/services/gpsRecordingService';
import { useWatchConnectivity } from '../../src/hooks/useWatchConnectivity';
import { startRunOnWatch } from '../../src/services/watchRunControl';
import { useRunProgram } from '../../src/services/runProgramService';
import { programStatus } from '@workspace/shared';
import { saveRecordedActivity } from '../../src/services/gpsRecordingSave';
import { useIndoorDistanceEstimate } from '../../src/hooks/useIndoorDistanceEstimate';
import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';
import { initializeI18n } from '../../src/localization/i18n';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import type { RootStackScreenProps } from '../../src/types/navigation';

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
    elapsedSeconds: jest.fn(() => 754),
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
jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
  stopRecordingCues: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
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
const mockSuggestedRanges = jest.fn(() => ({ pace: null, heartRate: null }));
jest.mock('../../src/hooks/useSuggestedRanges', () => ({
  useSuggestedRanges: () => mockSuggestedRanges(),
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

const mockedState = jest.mocked(useGpsRecording);
const mockedProgram = jest.mocked(useRunProgram);
const DEG_PER_METER = 1 / 111_194.9;

const session = (
  overrides: Partial<RecordingSession> = {}
): RecordingSession => ({
  id: 'rec-1',
  activity: 'run',
  status: 'recording',
  startedAt: Date.now() - 754_000,
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  ...overrides,
});

// 2.5 km at 4 m/s.
const track: RecordedPoint[] = Array.from({ length: 11 }, (_, i) => ({
  t: 1_000_000 + i * 62_500,
  lat: 51.5 + i * 250 * DEG_PER_METER,
  lon: -0.12,
  alt: null,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const state = (s: RecordingSession | null, points: RecordedPoint[] = []) =>
  mockedState.mockReturnValue({ session: s, points } as RecordingSnapshot);

const navigation = {
  goBack: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};
const props = {
  navigation,
  route: { key: 'RecordActivity', name: 'RecordActivity' },
} as unknown as RootStackScreenProps<'RecordActivity'>;

const renderUi = () => (
  <QueryClientProvider client={new QueryClient()}>
    <RecordActivityScreen {...props} />
  </QueryClientProvider>
);

// The screen shows a spinner until the saved-session check finishes.
const renderScreen = async () => {
  const screen = render(renderUi());
  await waitFor(() =>
    expect(screen.queryByTestId('record-activity-loading')).toBeNull()
  );
  return screen;
};

describe('RecordActivityScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuggestedRanges.mockReturnValue({ pace: null, heartRate: null });
    jest.mocked(useIndoorDistanceEstimate).mockReturnValue(null);
    useLiveHeartRateStore.setState({ reading: null });
    mockedProgram.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
      refetch: jest.fn(() => Promise.resolve()),
    });
  });

  describe('with a training program on', () => {
    const onProgram = () =>
      mockedProgram.mockReturnValue({
        status: programStatus({ programId: 'beginner5k', next: 0 })!,
        enabled: true,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        loaded: true,
        refetch: jest.fn(() => Promise.resolve()),
      });

    it('does not choose the workout for someone who just wants to record', async () => {
      state(null);
      onProgram();
      const screen = await renderScreen();
      // Offered on its own card, but no plan is chosen.
      expect(screen.getByText('Do this workout')).toBeTruthy();
      expect(screen.queryByText('Using this workout')).toBeNull();
    });

    it('chooses it when opened to do the workout', async () => {
      state(null);
      onProgram();
      const screen = render(
        <QueryClientProvider client={new QueryClient()}>
          <RecordActivityScreen
            {...props}
            route={
              {
                key: 'RecordActivity',
                name: 'RecordActivity',
                params: { programWorkout: true },
              } as never
            }
          />
        </QueryClientProvider>
      );
      await waitFor(() =>
        expect(screen.getByText('Using this workout')).toBeTruthy()
      );
    });

    describe('suggested ranges', () => {
      const openProgramWorkout = () =>
        render(
          <QueryClientProvider client={new QueryClient()}>
            <RecordActivityScreen
              {...props}
              route={
                {
                  key: 'RecordActivity',
                  name: 'RecordActivity',
                  params: { programWorkout: true },
                } as never
              }
            />
          </QueryClientProvider>
        );
      const suggestion = {
        pace: {
          work: { minSecondsPerKm: 285, maxSecondsPerKm: 320 },
          easy: { minSecondsPerKm: 360, maxSecondsPerKm: 420 },
          warm: { minSecondsPerKm: 380, maxSecondsPerKm: 840 },
          sessions: 5,
        },
        heartRate: {
          work: { minBpm: 155, maxBpm: 170 },
          easy: { minBpm: 110, maxBpm: 130 },
          warm: { minBpm: 95, maxBpm: 120 },
          maxHeartRate: 185,
        },
      };

      it('offers them for a plan and puts them on every fast, easy and warm-up stretch when used', async () => {
        state(null);
        onProgram();
        jest.mocked(useWatchConnectivity).mockReturnValue({
          isSupported: true,
          isPaired: true,
          isReachable: true,
        } as ReturnType<typeof useWatchConnectivity>);
        mockSuggestedRanges.mockReturnValue(suggestion as never);
        const screen = openProgramWorkout();
        await waitFor(() =>
          expect(screen.getByTestId('suggested-ranges-card')).toBeTruthy()
        );
        expect(screen.getByText('Based on your last 5 sessions.')).toBeTruthy();
        expect(
          screen.getByText(
            'Pace: fast 4:45–5:20/km, easy 6:00–7:00/km, warm-up and cool-down 6:20–14:00/km'
          )
        ).toBeTruthy();

        fireEvent.press(screen.getByTestId('suggested-ranges-use'));
        fireEvent.press(screen.getByText('Start'));
        await waitFor(() => expect(startRecording).toHaveBeenCalled());
        const { intervals } = jest.mocked(startRecording).mock.calls[0][0];
        const work = intervals?.steps.find((step) => step.kind === 'work');
        const easy = intervals?.steps.find((step) => step.kind === 'recovery');
        expect(work?.pace).toEqual({
          minSecondsPerKm: 285,
          maxSecondsPerKm: 320,
        });
        expect(work?.heartRate).toEqual({ minBpm: 155, maxBpm: 170 });
        expect(easy?.pace).toEqual({
          minSecondsPerKm: 360,
          maxSecondsPerKm: 420,
        });
        expect(easy?.heartRate).toEqual({ minBpm: 110, maxBpm: 130 });
        const warmSteps =
          intervals?.steps.filter(
            (step) => step.kind === 'warmup' || step.kind === 'cooldown'
          ) ?? [];
        expect(warmSteps.length).toBeGreaterThan(0);
        for (const step of warmSteps) {
          expect(step.pace).toEqual({
            minSecondsPerKm: 380,
            maxSecondsPerKm: 840,
          });
          expect(step.heartRate).toEqual({ minBpm: 95, maxBpm: 120 });
        }
      });

      it('from a recent race, gives the runs of a run/walk plan the easy-running range', async () => {
        state(null);
        onProgram();
        mockSuggestedRanges.mockReturnValue({
          ...suggestion,
          pace: {
            ...suggestion.pace,
            sessions: 0,
            race: { distanceKm: 5, seconds: 1500 },
          },
          byEffort: {
            easy: { minSecondsPerKm: 365, maxSecondsPerKm: 410 },
            tempo: { minSecondsPerKm: 320, maxSecondsPerKm: 335 },
          },
        } as never);
        const screen = openProgramWorkout();
        await waitFor(() =>
          expect(screen.getByTestId('suggested-ranges-card')).toBeTruthy()
        );
        expect(
          screen.getByText('Based on your recent race: 5K in 25:00.')
        ).toBeTruthy();

        fireEvent.press(screen.getByTestId('suggested-ranges-use'));
        fireEvent.press(screen.getByText('Start'));
        await waitFor(() => expect(startRecording).toHaveBeenCalled());
        const { intervals } = jest.mocked(startRecording).mock.calls[0][0];
        const runs = intervals?.steps.filter((step) => step.kind === 'work');
        expect(runs?.length).toBeGreaterThan(0);
        // Beginner runs are easy running, so they get the easy-effort range,
        // not the interval range the fast stretches get.
        for (const step of runs ?? []) {
          expect(step.pace).toEqual({
            minSecondsPerKm: 365,
            maxSecondsPerKm: 410,
          });
        }
      });

      it('shows nothing without a suggestion, and applies nothing until tapped', async () => {
        state(null);
        onProgram();
        mockSuggestedRanges.mockReturnValue({ pace: null, heartRate: null });
        const screen = openProgramWorkout();
        await waitFor(() =>
          expect(screen.getByText('Using this workout')).toBeTruthy()
        );
        expect(screen.queryByTestId('suggested-ranges-card')).toBeNull();

        mockSuggestedRanges.mockReturnValue(suggestion as never);
        screen.rerender(
          <QueryClientProvider client={new QueryClient()}>
            <RecordActivityScreen
              {...props}
              route={
                {
                  key: 'RecordActivity',
                  name: 'RecordActivity',
                  params: { programWorkout: true },
                } as never
              }
            />
          </QueryClientProvider>
        );
        fireEvent.press(screen.getByText('Start'));
        await waitFor(() => expect(startRecording).toHaveBeenCalled());
        const { intervals } = jest.mocked(startRecording).mock.calls[0][0];
        expect(
          intervals?.steps.some((step) => step.pace || step.heartRate)
        ).toBe(false);
      });
    });
  });

  describe('with a paired watch', () => {
    beforeEach(() =>
      jest.mocked(useWatchConnectivity).mockReturnValue({
        isSupported: true,
        isPaired: true,
        isReachable: true,
      })
    );
    afterEach(() =>
      jest.mocked(useWatchConnectivity).mockReturnValue({
        isSupported: false,
        isPaired: false,
        isReachable: false,
      })
    );

    it('records with the phone unless the watch is chosen', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRunOnWatch).not.toHaveBeenCalled();
    });

    it('starts an outdoor run on the watch', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Watch GPS'));
      // The watch has auto-pause and voice cues of its own, set from here.
      fireEvent(screen.getByTestId('auto-pause-switch'), 'valueChange', false);
      fireEvent(screen.getByTestId('audio-cues-switch'), 'valueChange', true);
      fireEvent.press(screen.getByText('Start'));
      await waitFor(() =>
        expect(startRunOnWatch).toHaveBeenCalledWith({
          kind: 'run',
          place: 'outdoor',
          plan: undefined,
          autoPause: false,
          voiceCues: true,
        })
      );
      expect(startRecording).not.toHaveBeenCalled();
    });

    it('sends the pace range with a watch run when the alert is on', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Watch GPS'));
      fireEvent(screen.getByTestId('pace-alert-switch'), 'valueChange', true);
      fireEvent.press(screen.getByText('Start'));
      await waitFor(() =>
        expect(startRunOnWatch).toHaveBeenCalledWith(
          expect.objectContaining({
            paceBand: {
              minSecondsPerKm: expect.any(Number),
              maxSecondsPerKm: expect.any(Number),
            },
          })
        )
      );
    });

    it('starts a treadmill run on the watch and opens the live screen', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Indoor'));
      fireEvent.press(screen.getByText('Watch'));
      // The watch judges indoor stops by its step counter.
      expect(screen.getByTestId('auto-pause-switch')).toBeTruthy();
      fireEvent.press(screen.getByText('Start'));
      await waitFor(() =>
        expect(startRunOnWatch).toHaveBeenCalledWith({
          kind: 'run',
          place: 'indoor',
          plan: undefined,
          autoPause: true,
          voiceCues: false,
        })
      );
      expect(startRecording).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith('WatchRunLive');
    });

    it('names the choice after the place: GPS outdoors, the device indoors', async () => {
      state(null);
      const screen = await renderScreen();
      expect(screen.getByText('Phone GPS')).toBeTruthy();
      expect(screen.getByText('Watch GPS')).toBeTruthy();
      fireEvent.press(screen.getByText('Indoor'));
      expect(screen.queryByText('Phone GPS')).toBeNull();
      expect(screen.getByText('Phone')).toBeTruthy();
      expect(screen.getByText('Watch')).toBeTruthy();
    });

    it('records indoors on the phone by default', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Indoor'));
      fireEvent.press(screen.getByText('Start'));
      await waitFor(() =>
        expect(startRecording).toHaveBeenCalledWith(
          expect.objectContaining({ indoor: true })
        )
      );
      expect(startRunOnWatch).not.toHaveBeenCalled();
    });

    it('offers the watch for a walk but not a ride', async () => {
      state(null);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Ride'));
      expect(screen.queryByText('Watch GPS')).toBeNull();
      fireEvent.press(screen.getByText('Walk'));
      expect(screen.getByText('Watch GPS')).toBeTruthy();
    });
  });

  it('starts a recording of the chosen activity', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Ride'));
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({ activity: 'ride' })
      )
    );
  });

  it('starts with auto-pause on and passes the toggle through', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent(screen.getByTestId('auto-pause-switch'), 'valueChange', false);
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({ autoPause: false })
      )
    );
  });

  it('passes voice cues in the distance unit once switched on', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent(screen.getByTestId('audio-cues-switch'), 'valueChange', true);
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          audioCues: expect.stringMatching(/^(km|miles)$/),
        })
      )
    );
  });

  it('starts with a pace band in seconds per kilometre when the alert is on', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent(screen.getByTestId('pace-alert-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('pace-fastest-down'));
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          paceBand: {
            minSecondsPerKm: expect.any(Number),
            maxSecondsPerKm: expect.any(Number),
          },
        })
      )
    );
  });

  it("keeps the chosen pace range as the next run's starting point", async () => {
    state(null);
    const screen = await renderScreen();
    fireEvent(screen.getByTestId('pace-alert-switch'), 'valueChange', true);
    expect(setPaceBandPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        minSecondsPerKm: expect.any(Number),
        maxSecondsPerKm: expect.any(Number),
      })
    );
    fireEvent.press(screen.getByTestId('pace-slowest-up'));
    expect(setPaceBandPreference).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxSecondsPerKm: expect.any(Number) })
    );
  });

  it('keeps the heart-rate range for the next run and passes it on', async () => {
    jest.mocked(useWatchConnectivity).mockReturnValue({
      isSupported: true,
      isPaired: true,
      isReachable: true,
    } as ReturnType<typeof useWatchConnectivity>);
    state(null);
    const screen = await renderScreen();
    fireEvent(screen.getByTestId('hr-alert-switch'), 'valueChange', true);
    expect(setHeartRateBandPreference).toHaveBeenCalledWith(
      expect.objectContaining({ minBpm: expect.any(Number) })
    );
    fireEvent.press(screen.getByText('Start'));
    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          heartRateBand: {
            minBpm: expect.any(Number),
            maxBpm: expect.any(Number),
          },
        })
      )
    );
  });

  it('starts with the alerts off even after a range was saved', async () => {
    jest.mocked(getRecordingPreferences).mockResolvedValueOnce({
      autoPause: true,
      audioCues: false,
      paceBand: { minSecondsPerKm: 280, maxSecondsPerKm: 300 },
      heartRateBand: { minBpm: 150, maxBpm: 170 },
      countdownSeconds: 0,
    });
    state(null);
    const screen = await renderScreen();
    expect(screen.getByTestId('pace-alert-switch').props.value).toBe(false);
    fireEvent(screen.getByTestId('pace-alert-switch'), 'valueChange', true);
    // The saved range is the starting point.
    expect(screen.getByTestId('pace-fastest-value').props.children).toContain(
      '4:40'
    );
  });

  it('sends no pace band unless the alert is switched on', async () => {
    state(null);
    const screen = await renderScreen();
    fireEvent.press(screen.getByText('Start'));
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({ paceBand: undefined })
    );
  });

  it('marks a lap while recording, but not while paused', async () => {
    state(session(), track);
    const screen = await renderScreen();
    fireEvent.press(screen.getByText('Lap'));
    expect(markLap).toHaveBeenCalledTimes(1);

    state(session({ status: 'paused', pausedAt: Date.now() }), track);
    screen.rerender(renderUi());
    expect(screen.queryByText('Lap')).toBeNull();
  });

  it('changes the pace range for the recording while it runs', async () => {
    state(
      session({ paceBand: { minSecondsPerKm: 300, maxSecondsPerKm: 330 } }),
      track
    );
    const screen = await renderScreen();
    fireEvent.press(screen.getByTestId('live-pace-slowest-up'));
    expect(setRecordingPaceBand).toHaveBeenCalledWith({
      minSecondsPerKm: 300,
      maxSecondsPerKm: 335,
    });
    fireEvent(
      screen.getByTestId('live-pace-alert-switch'),
      'valueChange',
      false
    );
    expect(setRecordingPaceBand).toHaveBeenLastCalledWith(undefined);
  });

  it('changes auto-pause and voice cues for the recording while it runs', async () => {
    state(session({ autoPause: true }), track);
    const screen = await renderScreen();

    fireEvent(
      screen.getByTestId('live-auto-pause-switch'),
      'valueChange',
      false
    );
    await waitFor(() =>
      expect(setRecordingAutoPause).toHaveBeenCalledWith(
        false,
        expect.anything()
      )
    );
    fireEvent(
      screen.getByTestId('live-audio-cues-switch'),
      'valueChange',
      true
    );
    expect(setRecordingAudioCues).toHaveBeenCalledWith(
      expect.stringMatching(/^(km|miles)$/)
    );
  });

  it('offers no auto-pause switch during an indoor recording', async () => {
    state(session({ indoor: true }));
    const screen = await renderScreen();
    expect(screen.queryByTestId('live-auto-pause-switch')).toBeNull();
    expect(screen.getByTestId('live-audio-cues-switch')).toBeTruthy();
  });

  it('lists marked laps and flags the fastest after finishing', async () => {
    state(
      session({
        status: 'finished',
        finishedAt: Date.now(),
        laps: [1_000_000 + 250_000],
      }),
      track
    );
    const screen = await renderScreen();
    expect(screen.getByText('Laps')).toBeTruthy();
    expect(screen.getByText('Lap 1 · 1.00 km · 4:10')).toBeTruthy();
    expect(screen.getAllByText(/Fastest/).length).toBeGreaterThan(0);
  });

  it('counts down before it starts recording, and Cancel stops it', async () => {
    state(null);
    const screen = await renderScreen();
    jest.useFakeTimers();
    try {
      fireEvent.press(screen.getByText('3 s'));
      fireEvent.press(screen.getByText('Start'));
      expect(screen.getByText('3')).toBeTruthy();
      expect(startRecording).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('2')).toBeTruthy();

      fireEvent.press(screen.getByText('Cancel'));
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(startRecording).not.toHaveBeenCalled();
      expect(screen.getByText('Start')).toBeTruthy();

      fireEvent.press(screen.getByText('Start'));
      // Each tick re-renders and arms the next, so step a second at a time.
      for (let tick = 0; tick < 4; tick++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(startRecording).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('explains a denied location permission and offers Settings', async () => {
    state(null);
    jest
      .mocked(startRecording)
      .mockRejectedValueOnce(new RecordingPermissionError('denied', 'no'));
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Start'));

    expect(await screen.findByText('Open Settings')).toBeTruthy();
  });

  it('shows the clock, distance and pace while recording, and pauses', async () => {
    state(session(), track);
    const screen = await renderScreen();

    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('2.50')).toBeTruthy();
    // 2.5 km in 625 s of fixes: 4 m/s => 4:10 per km.
    expect(screen.getAllByText('4:10').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByText('Pause'));
    await waitFor(() => expect(pauseRecording).toHaveBeenCalled());
  });

  it('names the activity in the header and shows the GPS signal', async () => {
    state(session(), track);
    const screen = await renderScreen();
    const { useScreenHeader } = jest.requireMock(
      '../../src/hooks/useScreenHeader'
    );
    expect(useScreenHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Outdoor run',
        nativeTitle: 'Outdoor run',
      })
    );
    expect(screen.getByLabelText('GPS good')).toBeTruthy();
  });

  it('finishes from the live screen', async () => {
    state(session(), track);
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Finish'));
    await waitFor(() => expect(finishRecording).toHaveBeenCalled());
  });

  it('lists per-km splits once finished and saves to the diary', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    jest
      .mocked(saveRecordedActivity)
      .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-06' });
    const screen = await renderScreen();

    expect(screen.getByText('Splits')).toBeTruthy();
    expect(screen.getByText('1 km')).toBeTruthy();
    expect(screen.getByText('2 km')).toBeTruthy();

    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() =>
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'finished' }),
        track,
        'km',
        null,
        null,
        false
      )
    );
    await waitFor(() => expect(discardRecording).toHaveBeenCalled());
    expect(navigation.replace).toHaveBeenCalledWith(
      'RunSummary',
      expect.objectContaining({
        activity: 'run',
        distanceUnit: 'km',
        distanceMeters: expect.any(Number),
        program: null,
      })
    );
  });

  it('keeps the recording when the save fails', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    jest.mocked(saveRecordedActivity).mockRejectedValue(new Error('offline'));
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() => expect(saveRecordedActivity).toHaveBeenCalled());
    expect(discardRecording).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('still opens the summary when clearing the saved recording fails', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    jest
      .mocked(saveRecordedActivity)
      .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-06' });
    jest.mocked(discardRecording).mockRejectedValueOnce(new Error('disk'));
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Save activity'));

    // The activity is filed, so the person is not told the save failed.
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        'RunSummary',
        expect.anything()
      )
    );
  });

  it('shows a spinner, not Start, until the saved-session check finishes', async () => {
    state(null);
    let finishCheck: () => void = () => {};
    jest.mocked(hydrate).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishCheck = resolve;
      })
    );
    const screen = render(renderUi());

    expect(screen.getByTestId('record-activity-loading')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();

    finishCheck();
    expect(await screen.findByText('Start')).toBeTruthy();
  });

  it('says when a recording that was already running began', async () => {
    state(
      session({ startedAt: new Date(2026, 9, 8, 13, 10).getTime() }),
      track
    );
    const screen = await renderScreen();

    expect(
      screen.getByText(
        /This recording started at .*1:10.* and was still running/
      )
    ).toBeTruthy();
  });

  it('shows the watch heart rate while recording, and nothing without one', async () => {
    state(session(), track);
    const screen = await renderScreen();
    expect(screen.queryByText('Heart rate')).toBeNull();

    act(() => {
      useLiveHeartRateStore.getState().record({
        sessionId: 'rec-1',
        exerciseEntryId: '',
        bpm: 148,
        at: Date.now(),
      });
    });

    expect(screen.getByText('Heart rate')).toBeTruthy();
    expect(screen.getByText('148')).toBeTruthy();
    expect(screen.getByText('bpm')).toBeTruthy();
  });

  it('does not show a heart rate once the recording is finished', async () => {
    useLiveHeartRateStore.getState().record({
      sessionId: 'rec-1',
      exerciseEntryId: '',
      bpm: 148,
      at: Date.now(),
    });
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    const screen = await renderScreen();

    expect(screen.queryByText('Heart rate')).toBeNull();
  });

  it('starts an indoor recording when Indoor is chosen', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Indoor'));
    expect(screen.getByText(/No GPS is used/)).toBeTruthy();
    // No location fixes indoors, so auto-pause is neither offered nor sent.
    expect(screen.queryByTestId('auto-pause-switch')).toBeNull();
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'run',
          indoor: true,
          autoPause: false,
        })
      )
    );
  });

  it('starts outdoors by default', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({ indoor: false })
      )
    );
  });

  it('shows just the clock for a live indoor session, with no map or GPS wait', async () => {
    state(session({ indoor: true }));
    const screen = await renderScreen();

    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.queryByText('Waiting for a GPS fix…')).toBeNull();
    expect(screen.queryByText('Distance')).toBeNull();
    expect(screen.queryByText('Avg pace')).toBeNull();
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it('saves a finished indoor session with the distance typed in, converted to km', async () => {
    state(
      session({ indoor: true, status: 'finished', finishedAt: Date.now() })
    );
    jest
      .mocked(saveRecordedActivity)
      .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-08' });
    const screen = await renderScreen();

    expect(screen.queryByText('Splits')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Distance'), '5,2');
    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() =>
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.objectContaining({ indoor: true }),
        [],
        'km',
        5.2,
        null,
        false
      )
    );
  });

  it('saves an indoor session with no distance when the field is left empty', async () => {
    state(
      session({ indoor: true, status: 'finished', finishedAt: Date.now() })
    );
    jest
      .mocked(saveRecordedActivity)
      .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-08' });
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() =>
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.objectContaining({ indoor: true }),
        [],
        'km',
        null,
        null,
        true
      )
    );
  });

  describe('with a step-based estimate', () => {
    const finishedIndoor = () =>
      state(
        session({ indoor: true, status: 'finished', finishedAt: Date.now() })
      );
    const rough = { steps: 3900, distanceKm: 3.12, calibrated: false };

    it('fills the distance in and says it is only a rough estimate', async () => {
      finishedIndoor();
      jest.mocked(useIndoorDistanceEstimate).mockReturnValue(rough);
      const screen = await renderScreen();

      expect(screen.getByLabelText('Distance').props.value).toBe('3.12');
      expect(
        screen.getByText(
          /rough estimate from 3,900 steps with a typical stride/
        )
      ).toBeTruthy();
    });

    it('says the estimate uses their stride once it has been learned', async () => {
      finishedIndoor();
      jest
        .mocked(useIndoorDistanceEstimate)
        .mockReturnValue({ ...rough, calibrated: true });
      const screen = await renderScreen();

      expect(screen.getByText(/using your stride/)).toBeTruthy();
    });

    it('uses the singular for a single step', async () => {
      finishedIndoor();
      jest
        .mocked(useIndoorDistanceEstimate)
        .mockReturnValue({ steps: 1, distanceKm: 0.0008, calibrated: true });
      const screen = await renderScreen();

      expect(screen.getByText(/from 1 step using your stride/)).toBeTruthy();
    });

    it('saves the estimate as it is when it is left alone', async () => {
      finishedIndoor();
      jest.mocked(useIndoorDistanceEstimate).mockReturnValue(rough);
      jest
        .mocked(saveRecordedActivity)
        .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-08' });
      const screen = await renderScreen();

      fireEvent.press(screen.getByText('Save activity'));

      await waitFor(() =>
        expect(saveRecordedActivity).toHaveBeenCalledWith(
          expect.objectContaining({ indoor: true }),
          [],
          'km',
          3.12,
          rough,
          true
        )
      );
    });

    it('saves what the person typed over it, and passes the estimate so it can learn', async () => {
      finishedIndoor();
      jest.mocked(useIndoorDistanceEstimate).mockReturnValue(rough);
      jest
        .mocked(saveRecordedActivity)
        .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-08' });
      const screen = await renderScreen();

      fireEvent.changeText(screen.getByLabelText('Distance'), '3.5');
      fireEvent.press(screen.getByText('Save activity'));

      await waitFor(() =>
        expect(saveRecordedActivity).toHaveBeenCalledWith(
          expect.objectContaining({ indoor: true }),
          [],
          'km',
          3.5,
          rough,
          false
        )
      );
    });

    it('lets them clear it to log no distance', async () => {
      finishedIndoor();
      jest.mocked(useIndoorDistanceEstimate).mockReturnValue(rough);
      jest
        .mocked(saveRecordedActivity)
        .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-08' });
      const screen = await renderScreen();

      fireEvent.changeText(screen.getByLabelText('Distance'), '');
      expect(screen.getByLabelText('Distance').props.value).toBe('');
      fireEvent.press(screen.getByText('Save activity'));

      await waitFor(() =>
        expect(saveRecordedActivity).toHaveBeenCalledWith(
          expect.objectContaining({ indoor: true }),
          [],
          'km',
          null,
          rough,
          false
        )
      );
    });

    it('forgets a typed distance after discard so the next session uses its own estimate', async () => {
      const first = session({
        id: 'rec-1',
        indoor: true,
        status: 'finished',
        finishedAt: Date.now(),
      });
      const second = session({
        id: 'rec-2',
        indoor: true,
        status: 'finished',
        finishedAt: Date.now(),
      });
      state(first);
      jest.mocked(useIndoorDistanceEstimate).mockImplementation((current) => {
        if (current?.id === 'rec-2') {
          return { steps: 2000, distanceKm: 1.6, calibrated: true };
        }
        return rough;
      });
      jest.mocked(discardRecording).mockImplementation(async () => {
        state(null);
      });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const screen = await renderScreen();

      fireEvent.changeText(screen.getByLabelText('Distance'), '4.00');
      fireEvent.press(screen.getByText('Discard'));
      const confirm = alert.mock.calls[0][2]?.find(
        (button) => button.style === 'destructive'
      );
      confirm?.onPress?.();

      await waitFor(() => expect(discardRecording).toHaveBeenCalled());
      state(second);
      screen.rerender(renderUi());

      expect(screen.getByLabelText('Distance').props.value).toBe('1.60');
    });
  });

  it('does not offer a distance field for an outdoor recording', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    const screen = await renderScreen();

    expect(screen.queryByLabelText('Distance')).toBeNull();
  });

  it('does not offer the notice for a finished recording', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    const screen = await renderScreen();

    expect(screen.queryByText(/was still running on this phone/)).toBeNull();
  });

  it('does not show the notice for a recording started on this screen', async () => {
    state(null);
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Start'));
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    // The service publishes the new session once start resolves.
    state(session(), track);
    screen.rerender(renderUi());

    expect(screen.getByText('Pause')).toBeTruthy();
    expect(screen.queryByText(/was still running on this phone/)).toBeNull();
  });

  it('offers Discard while recording and while paused, and asks first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    for (const status of ['recording', 'paused'] as const) {
      state(
        session({
          status,
          pausedAt: status === 'paused' ? Date.now() : null,
        }),
        track
      );
      const screen = await renderScreen();

      fireEvent.press(screen.getByText('Discard'));

      expect(alert).toHaveBeenCalledTimes(1);
      alert.mockClear();
      screen.unmount();
    }
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('discards a running recording once the person confirms', async () => {
    state(session(), track);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Discard'));
    const confirm = alert.mock.calls[0][2]?.find(
      (button) => button.style === 'destructive'
    );
    confirm?.onPress?.();

    await waitFor(() => expect(discardRecording).toHaveBeenCalled());
  });

  it('keeps the carried-over notice to a note, with a single Discard on the screen', async () => {
    state(session(), track);
    const screen = await renderScreen();

    expect(screen.getByText(/was still running on this phone/)).toBeTruthy();
    expect(screen.getAllByText('Discard')).toHaveLength(1);
  });

  it('asks before discarding a finished recording', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderScreen();

    fireEvent.press(screen.getByText('Discard'));

    expect(alert).toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
  });
});
