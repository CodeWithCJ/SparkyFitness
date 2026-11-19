import type {
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';
import { serverSessionMatchesSent } from '../../src/offline/sessionsEqual';

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

const sent: PresetSessionExerciseRequest[] = [
  {
    exercise_id: EXERCISE_ID,
    sets: [{ set_number: 1, reps: 5, weight: 100 }],
  } as PresetSessionExerciseRequest,
];

function server(
  overrides: Partial<PresetSessionResponse> = {}
): PresetSessionResponse {
  return {
    type: 'preset',
    id: 's-1',
    entry_date: '2026-11-16',
    name: 'Push',
    description: null,
    notes: null,
    location: null,
    finished_at: '2026-11-16T11:00:00.000Z',
    revision: 3,
    exercises: [
      {
        id: 'entry-1',
        exercise_id: EXERCISE_ID,
        sets: [
          {
            id: 1,
            set_number: 1,
            reps: 5,
            weight: 100,
            duration: null,
            distance: null,
            completed_at: null,
            set_type: null,
          },
        ],
      },
    ],
    ...overrides,
  } as unknown as PresetSessionResponse;
}

describe('serverSessionMatchesSent', () => {
  it('matches when the sets and every field that was sent are the same', () => {
    expect(
      serverSessionMatchesSent(server(), sent, {
        name: 'Push',
        notes: null,
        entry_date: '2026-11-16',
        location: null,
        finished_at: '2026-11-16T11:00:00.000Z',
      })
    ).toBe(true);
  });

  it('does not match when another device changed the location', () => {
    expect(
      serverSessionMatchesSent(server({ location: 'Home gym' }), sent, {
        location: null,
      })
    ).toBe(false);
    expect(
      serverSessionMatchesSent(server({ location: 'Home gym' }), sent, {
        location: 'Home gym',
      })
    ).toBe(true);
  });

  it('does not match when another device resumed or re-finished the workout', () => {
    // Resumed elsewhere: the server holds no finish time, the phone sent one.
    expect(
      serverSessionMatchesSent(server({ finished_at: null }), sent, {
        finished_at: '2026-11-16T11:00:00.000Z',
      })
    ).toBe(false);
    // The phone resumed it (explicit null) but the server holds a finish.
    expect(
      serverSessionMatchesSent(server(), sent, { finished_at: null })
    ).toBe(false);
    // The same instant written differently is still the same finish.
    expect(
      serverSessionMatchesSent(server(), sent, {
        finished_at: '2026-11-16T11:00:00Z',
      })
    ).toBe(true);
  });

  it('does not match when the name changed elsewhere, though the sets match', () => {
    expect(
      serverSessionMatchesSent(server({ name: 'Renamed' }), sent, {
        name: 'Push',
      })
    ).toBe(false);
  });
});
