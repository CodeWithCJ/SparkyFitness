import { fetchWorkoutSessionFeedback } from '../../../src/services/api/workoutCoachingApi';
import { ApiError } from '../../../src/services/api/errors';
import { isSessionAwaitingServer } from '../../../src/offline/sessionAwaitingServer';

const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('../../../src/offline/sessionAwaitingServer', () => ({
  isSessionAwaitingServer: jest.fn(),
}));

const mockAwaiting = isSessionAwaitingServer as jest.MockedFunction<
  typeof isSessionAwaitingServer
>;

const SESSION = '22222222-2222-4222-8222-222222222222';

describe('fetchWorkoutSessionFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns what the server holds', async () => {
    const stored = {
      exercise_preset_entry_id: SESSION,
      session: { difficulty: 'easy' },
      exercises: [],
    };
    mockApiFetch.mockResolvedValue(stored);

    await expect(fetchWorkoutSessionFeedback(SESSION)).resolves.toEqual(stored);
  });

  it('starts empty on a 404 while the workout is still waiting to be created', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('not found', 404));
    mockAwaiting.mockResolvedValue(true);

    await expect(fetchWorkoutSessionFeedback(SESSION)).resolves.toEqual({
      exercise_preset_entry_id: SESSION,
      session: null,
      exercises: [],
    });
  });

  it('still fails on any other 404', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('not found', 404));
    mockAwaiting.mockResolvedValue(false);

    await expect(fetchWorkoutSessionFeedback(SESSION)).rejects.toThrow(
      'not found'
    );
  });
});
