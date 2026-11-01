import {
  attachExerciseEntryGpsTrack,
  attachExerciseEntryWatchTelemetry,
  createExercise,
  createExerciseEntry,
  searchExercises,
} from '../../src/services/api/exerciseApi';
import { findShoeThatReachedLimit } from '../../src/services/shoeWear';
import {
  assignShoeToExerciseEntry,
  fetchShoes,
} from '../../src/services/api/shoesApi';
import {
  getHeartRateSamples,
  markRecordingSaved,
} from '../../src/services/gpsRecordingService';
import {
  resolveRecordingExercise,
  saveRecordedActivity,
} from '../../src/services/gpsRecordingSave';
import {
  learnFromIndoorEntry,
  learnFromOutdoorRecording,
  measureOutdoorForm,
} from '../../src/services/stepDistance';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import type { RecordingSession } from '../../src/services/gpsRecordingService';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/services/api/exerciseApi');
jest.mock('../../src/services/api/shoesApi');
jest.mock('../../src/services/shoeWear');
jest.mock('../../src/services/gpsRecordingService', () => ({
  elapsedSeconds: jest.fn(() => 1500),
  markRecordingSaved: jest.fn(() => Promise.resolve()),
  getHeartRateSamples: jest.fn(() => Promise.resolve([])),
  peekAppleWorkoutZones: jest.fn(() => null),
  clearAppleWorkoutZones: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/stepDistance');

const mockedSearch = jest.mocked(searchExercises);
const mockedCreateExercise = jest.mocked(createExercise);
const mockedCreateEntry = jest.mocked(createExerciseEntry);
const mockedAttach = jest.mocked(attachExerciseEntryGpsTrack);
const mockedTelemetry = jest.mocked(attachExerciseEntryWatchTelemetry);
const mockedHeartRate = jest.mocked(getHeartRateSamples);
const mockedLearnIndoor = jest.mocked(learnFromIndoorEntry);
const mockedLearnOutdoor = jest.mocked(learnFromOutdoorRecording);
const mockedMeasureForm = jest.mocked(measureOutdoorForm);
const mockedFetchShoes = jest.mocked(fetchShoes);
const mockedAssignShoe = jest.mocked(assignShoeToExerciseEntry);
const mockedWornOut = jest.mocked(findShoeThatReachedLimit);

const DEG_PER_METER = 1 / 111_194.9;
const T0 = new Date(2026, 9, 6, 7, 5, 0).getTime();

const points: RecordedPoint[] = Array.from({ length: 11 }, (_, i) => ({
  t: T0 + i * 100_000,
  lat: 51.5 + i * 250 * DEG_PER_METER,
  lon: -0.12,
  alt: 10,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const session: RecordingSession = {
  id: 'rec-1',
  activity: 'run',
  status: 'finished',
  startedAt: T0,
  finishedAt: T0 + 1_000_000,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
};

const exercise = (overrides: Partial<Exercise>): Exercise =>
  ({
    id: 'ex-1',
    name: 'Running',
    modality: 'duration_distance',
    ...overrides,
  }) as Exercise;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSearch.mockResolvedValue([exercise({})]);
  mockedCreateEntry.mockResolvedValue({ id: 'entry-1' } as never);
  mockedAttach.mockResolvedValue(undefined);
  mockedFetchShoes.mockResolvedValue([]);
  mockedWornOut.mockResolvedValue(null);
  mockedAssignShoe.mockResolvedValue({
    exercise_entry_id: 'entry-1',
    shoe_id: null,
  });
});

describe('resolveRecordingExercise', () => {
  it('prefers an exact-name cardio match from the library', async () => {
    mockedSearch.mockResolvedValue([
      exercise({ id: 'a', name: 'Running Lunges', modality: 'reps_only' }),
      exercise({ id: 'b', name: 'running', modality: 'duration' }),
      exercise({ id: 'c', name: 'Running' }),
    ]);
    expect((await resolveRecordingExercise('run')).id).toBe('c');
    expect(mockedCreateExercise).not.toHaveBeenCalled();
  });

  it('ignores an existing jump rope saved with distance and creates a duration one', async () => {
    mockedSearch.mockResolvedValue([
      exercise({ id: 'old', name: 'Jump Rope', modality: 'duration_distance' }),
    ]);
    mockedCreateExercise.mockResolvedValue(
      exercise({ id: 'new', name: 'Jump Rope', modality: 'duration' })
    );

    await resolveRecordingExercise('jumpRope');

    expect(mockedCreateExercise).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jump Rope', modality: 'duration' })
    );
  });

  it('creates a cardio exercise when the library has none', async () => {
    mockedSearch.mockResolvedValue([]);
    mockedCreateExercise.mockResolvedValue(
      exercise({ id: 'new', name: 'Cycling' })
    );

    await resolveRecordingExercise('ride');

    expect(mockedCreateExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cycling',
        category: 'cardio',
        modality: 'duration_distance',
      })
    );
  });
});

describe('saveRecordedActivity', () => {
  it('logs the entry, then attaches the route and per-km splits', async () => {
    const saved = await saveRecordedActivity(session, points, 'km');

    expect(saved).toMatchObject({
      entryId: 'entry-1',
      entryDate: '2026-10-06',
    });
    const entry = mockedCreateEntry.mock.calls[0][0];
    expect(entry).toMatchObject({
      exercise_id: 'ex-1',
      entry_date: '2026-10-06',
      entry_time: '07:05',
      duration_minutes: 25,
    });
    expect(entry.distance).toBeCloseTo(2.5, 2);
    // No calories sent: the server estimates them from the exercise.
    expect(entry).not.toHaveProperty('calories_burned');
    expect(entry.sets?.[0]).toMatchObject({ duration: 1500 });

    expect(markRecordingSaved).toHaveBeenCalledWith('entry-1', null);
    const [entryId, track] = mockedAttach.mock.calls[0];
    expect(entryId).toBe('entry-1');
    expect(track.points).toHaveLength(11);
    // 2.5 km: two full km and a partial.
    expect(track.laps).toHaveLength(3);
  });

  it('cuts splits per mile when the app is in miles', async () => {
    await saveRecordedActivity(session, points, 'miles');
    // 2.5 km is ~1.55 mi: one full mile and a partial.
    expect(mockedAttach.mock.calls[0][1].laps).toHaveLength(2);
  });

  it('uploads the laps the person marked instead of automatic splits', async () => {
    // Points run 62.5 s apart; one mark halfway makes two laps.
    await saveRecordedActivity(
      { ...session, laps: [points[5].t] },
      points,
      'km'
    );
    const { laps } = mockedAttach.mock.calls[0][1];
    expect(laps).toHaveLength(2);
    expect(laps?.[0].end_time).toBe(new Date(points[5].t).toISOString());
  });

  it('does not log the activity twice when only the track upload failed', async () => {
    await saveRecordedActivity(
      { ...session, savedEntryId: 'entry-9' },
      points,
      'km'
    );

    expect(mockedCreateEntry).not.toHaveBeenCalled();
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(mockedAttach.mock.calls[0][0]).toBe('entry-9');
  });

  it('returns the form saved with the first attempt when retrying', async () => {
    const savedForm = { avgCadence: 160, strideLengthCm: 105 };
    const saved = await saveRecordedActivity(
      { ...session, savedEntryId: 'entry-9', savedForm },
      points,
      'km'
    );

    expect(saved.form).toEqual(savedForm);
    expect(mockedCreateEntry).not.toHaveBeenCalled();
  });

  it('keeps the entry id for a retry when the track upload fails', async () => {
    mockedAttach.mockRejectedValueOnce(new Error('offline'));

    await expect(saveRecordedActivity(session, points, 'km')).rejects.toThrow(
      'offline'
    );
    expect(markRecordingSaved).toHaveBeenCalledWith('entry-1', null);
  });

  it('attaches watch heart rate to the saved entry', async () => {
    mockedHeartRate.mockResolvedValueOnce([
      { t: T0, bpm: 120 },
      { t: T0 + 30_000, bpm: 130 },
    ]);

    await saveRecordedActivity(session, points, 'km');

    expect(mockedTelemetry).toHaveBeenCalledWith('entry-1', {
      hrSamples: [
        { t: new Date(T0).toISOString(), bpm: 120 },
        { t: new Date(T0 + 30_000).toISOString(), bpm: 130 },
      ],
    });
  });

  it('skips heart rate with fewer than two readings', async () => {
    mockedHeartRate.mockResolvedValueOnce([{ t: T0, bpm: 120 }]);
    await saveRecordedActivity(session, points, 'km');
    expect(mockedTelemetry).not.toHaveBeenCalled();
  });

  it('still saves when the heart-rate upload fails', async () => {
    mockedHeartRate.mockResolvedValueOnce([
      { t: T0, bpm: 120 },
      { t: T0 + 30_000, bpm: 130 },
    ]);
    mockedTelemetry.mockRejectedValueOnce(new Error('offline'));

    await expect(
      saveRecordedActivity(session, points, 'km')
    ).resolves.toMatchObject({
      entryId: 'entry-1',
      entryDate: '2026-10-06',
    });
  });
});

describe('saveRecordedActivity for an indoor session', () => {
  const indoor: RecordingSession = { ...session, indoor: true };

  it('logs the entered distance and sends no route', async () => {
    const saved = await saveRecordedActivity(indoor, [], 'km', 5.2);

    expect(saved).toMatchObject({
      entryId: 'entry-1',
      entryDate: '2026-10-06',
    });
    expect(mockedCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_name: 'Indoor Running',
        distance: 5.2,
        sets: [expect.objectContaining({ distance: 5.2, duration: 1500 })],
      })
    );
    expect(mockedAttach).not.toHaveBeenCalled();
  });

  it('leaves the distance out when none was entered', async () => {
    await saveRecordedActivity(indoor, [], 'km', null);
    await saveRecordedActivity(indoor, [], 'km', 0);

    for (const [payload] of mockedCreateEntry.mock.calls) {
      expect(payload.distance).toBeNull();
      expect(payload.sets?.[0].distance).toBeNull();
    }
  });

  it('names each activity so sport detection reads it as one sport', async () => {
    await saveRecordedActivity({ ...indoor, activity: 'walk' }, [], 'km');
    await saveRecordedActivity({ ...indoor, activity: 'ride' }, [], 'km');

    expect(mockedCreateEntry.mock.calls.map(([p]) => p.exercise_name)).toEqual([
      'Indoor Walking',
      'Indoor Cycling',
    ]);
  });

  it('still attaches the watch heart rate', async () => {
    mockedHeartRate.mockResolvedValue([
      { t: T0, bpm: 120 },
      { t: T0 + 5000, bpm: 124 },
    ]);
    await saveRecordedActivity(indoor, [], 'km', 3);

    expect(mockedTelemetry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ hrSamples: expect.any(Array) })
    );
  });
});

describe('learning a stride while saving', () => {
  const estimate = { steps: 3900, distanceKm: 3.12, calibrated: false };

  it('teaches the app from the distance entered for an indoor session', async () => {
    await saveRecordedActivity(
      { ...session, indoor: true, activity: 'walk' },
      [],
      'km',
      3.5,
      estimate
    );

    expect(mockedLearnIndoor).toHaveBeenCalledWith('walk', estimate, 3.5);
    expect(mockedLearnOutdoor).not.toHaveBeenCalled();
  });

  it('teaches from the raw estimate when the prefilled distance was left as shown', async () => {
    const shown = { steps: 3900, distanceKm: 3.126, calibrated: false };

    await saveRecordedActivity(
      { ...session, indoor: true, activity: 'walk' },
      [],
      'km',
      3.12,
      shown,
      true
    );

    expect(mockedLearnIndoor).toHaveBeenCalledWith('walk', shown, 3.126);
    expect(mockedCreateEntry.mock.calls[0][0].distance).toBe(3.12);
  });

  it('does not learn a stride from a recording that paused', async () => {
    await saveRecordedActivity(
      { ...session, activity: 'run', hadPause: true },
      points,
      'km'
    );

    expect(mockedLearnOutdoor).toHaveBeenCalledWith(
      expect.objectContaining({ paused: true }),
      expect.closeTo(2500, -1)
    );
  });

  it('logs cadence and stride measured from the step count', async () => {
    mockedMeasureForm.mockResolvedValueOnce({
      avgCadence: 168,
      strideLengthCm: 104.2,
    });

    const saved = await saveRecordedActivity(
      { ...session, activity: 'run' },
      points,
      'km'
    );

    expect(mockedCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ avg_cadence: 168, stride_length_cm: 104.2 })
    );
    // Handed back so the summary can show the same numbers.
    expect(saved.form).toEqual({ avgCadence: 168, strideLengthCm: 104.2 });
  });

  it('logs the run without form metrics when the phone cannot measure them', async () => {
    mockedMeasureForm.mockRejectedValueOnce(new Error('no pedometer'));

    await saveRecordedActivity({ ...session, activity: 'run' }, points, 'km');

    const payload = mockedCreateEntry.mock.calls[0][0];
    expect(payload).not.toHaveProperty('avg_cadence');
    expect(payload).not.toHaveProperty('stride_length_cm');
  });

  it('teaches the app from the GPS distance of an outdoor recording', async () => {
    await saveRecordedActivity({ ...session, activity: 'run' }, points, 'km');

    expect(mockedLearnOutdoor).toHaveBeenCalledWith(
      {
        activity: 'run',
        startedAt: T0,
        finishedAt: T0 + 1_000_000,
        activeSeconds: 1500,
      },
      // 2.5 km of track.
      expect.closeTo(2500, -1)
    );
    expect(mockedLearnIndoor).not.toHaveBeenCalled();
  });

  it('learns once, not again when a failed track upload is retried', async () => {
    await saveRecordedActivity(
      { ...session, savedEntryId: 'entry-1' },
      points,
      'km'
    );

    expect(mockedLearnOutdoor).not.toHaveBeenCalled();
    expect(mockedLearnIndoor).not.toHaveBeenCalled();
  });

  it('never fails the save', async () => {
    mockedLearnOutdoor.mockRejectedValueOnce(new Error('storage full'));

    await expect(
      saveRecordedActivity(session, points, 'km')
    ).resolves.toMatchObject({
      entryId: 'entry-1',
      entryDate: '2026-10-06',
    });
    expect(mockedAttach).toHaveBeenCalled();
  });
});

describe('saveRecordedActivity default shoe', () => {
  const shoe = (id: string, isDefault: boolean) =>
    ({
      id,
      is_default: isDefault,
      is_worn_out: false,
      status: 'active',
    }) as Awaited<ReturnType<typeof fetchShoes>>[number];

  it('links a new run to the default pair', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('a', false), shoe('b', true)]);
    await saveRecordedActivity(session, points, 'km');
    expect(mockedFetchShoes).toHaveBeenCalledWith('active');
    expect(mockedAssignShoe).toHaveBeenCalledWith('entry-1', 'b');
  });

  it('reports the default pair when the run took it over its limit', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('b', true)]);
    const worn = { id: 'b', is_worn_out: true } as Awaited<
      ReturnType<typeof fetchShoes>
    >[number];
    mockedWornOut.mockResolvedValue(worn);
    const saved = await saveRecordedActivity(session, points, 'km');
    expect(mockedWornOut).toHaveBeenCalledWith('b', false);
    expect(saved.wornOutShoe).toBe(worn);
  });

  it('leaves wornOutShoe off when the mileage check fails', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('b', true)]);
    mockedWornOut.mockRejectedValue(new Error('offline'));
    const saved = await saveRecordedActivity(session, points, 'km');
    expect(saved).not.toHaveProperty('wornOutShoe');
    expect(mockedAssignShoe).toHaveBeenCalledWith('entry-1', 'b');
  });

  it('leaves the run unlinked when there is no default pair', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('a', false)]);
    await saveRecordedActivity(session, points, 'km');
    expect(mockedAssignShoe).not.toHaveBeenCalled();
  });

  it('links an indoor run to the default pair', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('b', true)]);
    await saveRecordedActivity({ ...session, indoor: true }, [], 'km', 5);
    expect(mockedAssignShoe).toHaveBeenCalledWith('entry-1', 'b');
  });

  it('does not link walks or rides', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('b', true)]);
    await saveRecordedActivity({ ...session, activity: 'ride' }, points, 'km');
    await saveRecordedActivity({ ...session, activity: 'walk' }, points, 'km');
    expect(mockedFetchShoes).not.toHaveBeenCalled();
    expect(mockedAssignShoe).not.toHaveBeenCalled();
  });

  it('still saves when the shoe lookup fails', async () => {
    mockedFetchShoes.mockRejectedValue(new Error('offline'));
    await expect(saveRecordedActivity(session, points, 'km')).resolves.toEqual(
      expect.objectContaining({ entryId: 'entry-1' })
    );
    expect(mockedAttach).toHaveBeenCalled();
  });

  it('does not touch the shoe again when retrying the route upload', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('b', true)]);
    await saveRecordedActivity(
      { ...session, savedEntryId: 'entry-1' },
      points,
      'km'
    );
    expect(mockedFetchShoes).not.toHaveBeenCalled();
    expect(mockedAssignShoe).not.toHaveBeenCalled();
  });
});
