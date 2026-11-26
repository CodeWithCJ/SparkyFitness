import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';
import {
  fetchChallenge,
  fetchChallengeStandings,
  fetchChallenges,
  fetchChallengesStatus,
  joinChallenge,
  leaveChallenge,
} from '../../../src/services/api/challengesApi';

jest.mock('../../../src/services/api/apiClient');

const mockedApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue(undefined as never);
});

describe('challengesApi', () => {
  it('reads the status, and a server without Challenges as off', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: true } as never);
    await expect(fetchChallengesStatus()).resolves.toEqual({ enabled: true });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/challenges/status' })
    );

    mockedApiFetch.mockRejectedValueOnce(new ApiError('Not found', 404));
    await expect(fetchChallengesStatus()).resolves.toEqual({ enabled: false });

    mockedApiFetch.mockRejectedValueOnce(new ApiError('Boom', 500));
    await expect(fetchChallengesStatus()).rejects.toThrow('Boom');
  });

  it('lists challenges and reads one with its standings', async () => {
    await fetchChallenges();
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/challenges' })
    );
    await fetchChallenge('c 1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/challenges/c%201' })
    );
    await fetchChallengeStandings('c1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/challenges/c1/standings' })
    );
    await fetchChallengeStandings('c1', '2026-11-08');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/challenges/c1/standings?date=2026-11-08',
      })
    );
  });

  it('joins with a code and leaves', async () => {
    const body = { code: 'abcdefghijklmnopqrstuv', display_name: 'Sam' };
    await joinChallenge(body);
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/challenges/join',
        method: 'POST',
        body,
      })
    );
    await leaveChallenge('c1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/challenges/c1/leave',
        method: 'POST',
      })
    );
  });
});
