jest.mock('@kingstinct/react-native-healthkit', () => ({
  queryQuantitySamples: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import {
  matchWorkoutEffort,
  readWorkoutEffortSamples,
} from '../../../src/services/healthkit/workoutEffort';

const START = '2026-10-19T07:00:00.000Z';
const END = '2026-10-19T07:45:00.000Z';
const sample = (
  start: string,
  end: string,
  score: number
): { startMs: number; endMs: number; score: number } => ({
  startMs: new Date(start).getTime(),
  endMs: new Date(end).getTime(),
  score,
});

describe('matchWorkoutEffort', () => {
  it('matches the rating stamped with the workout start and end', () => {
    expect(
      matchWorkoutEffort([sample(START, END, 7)], {
        startDate: START,
        endDate: END,
      })
    ).toBe(7);
  });

  it('allows a few seconds of drift', () => {
    expect(
      matchWorkoutEffort([sample('2026-10-19T07:00:03.000Z', END, 6)], {
        startDate: new Date(START),
        endDate: new Date(END),
      })
    ).toBe(6);
  });

  it('ignores a rating for a different workout', () => {
    expect(
      matchWorkoutEffort(
        [sample('2026-10-19T12:00:00.000Z', '2026-10-19T12:30:00.000Z', 9)],
        { startDate: START, endDate: END }
      )
    ).toBeNull();
  });

  it('takes the newest when a rating was changed', () => {
    expect(
      matchWorkoutEffort([sample(START, END, 5), sample(START, END, 8)], {
        startDate: START,
        endDate: END,
      })
    ).toBe(8);
  });

  it('is null with no ratings or an unreadable workout', () => {
    expect(matchWorkoutEffort([], { startDate: START, endDate: END })).toBe(
      null
    );
    expect(
      matchWorkoutEffort([sample(START, END, 5)], {
        startDate: 'nope',
        endDate: END,
      })
    ).toBeNull();
  });
});

describe('readWorkoutEffortSamples', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the rating type in Apple effort units and keeps only 1-10', async () => {
    (queryQuantitySamples as jest.Mock).mockResolvedValue([
      { startDate: new Date(START), endDate: new Date(END), quantity: 7 },
      { startDate: new Date(START), endDate: new Date(END), quantity: 0 },
      { startDate: new Date(START), endDate: new Date(END), quantity: 11 },
      { startDate: 'bad', endDate: new Date(END), quantity: 5 },
    ]);

    const samples = await readWorkoutEffortSamples(
      new Date(START),
      new Date(END)
    );

    expect(samples).toEqual([sample(START, END, 7)]);
    expect(queryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierWorkoutEffortScore',
      expect.objectContaining({ unit: 'appleEffortScore', limit: 0 })
    );
  });

  it('returns nothing, not an error, when the type cannot be read', async () => {
    (queryQuantitySamples as jest.Mock).mockRejectedValue(
      new Error('Authorization not determined')
    );

    await expect(
      readWorkoutEffortSamples(new Date(START), new Date(END))
    ).resolves.toEqual([]);
  });
});
