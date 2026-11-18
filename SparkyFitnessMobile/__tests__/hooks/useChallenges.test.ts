import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useChallenges } from '../../src/hooks/useChallenges';
import {
  fetchChallenges,
  fetchChallengesStatus,
} from '../../src/services/api/challengesApi';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';
import { makeChallenge } from '../helpers/challengeFixtures';

jest.mock('../../src/services/api/challengesApi', () => ({
  fetchChallengesStatus: jest.fn(),
  fetchChallenges: jest.fn(),
  fetchChallenge: jest.fn(),
  fetchChallengeStandings: jest.fn(),
  joinChallenge: jest.fn(),
  leaveChallenge: jest.fn(),
}));

const mockStatus = fetchChallengesStatus as jest.Mock;
const mockList = fetchChallenges as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useChallenges', () => {
  it('hands out no cached challenge once the server turns the feature off', async () => {
    const queryClient = createTestQueryClient();
    mockStatus.mockResolvedValue({ enabled: true });
    mockList.mockResolvedValue([makeChallenge()]);
    const { result } = renderHook(() => useChallenges(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));

    mockStatus.mockResolvedValue({ enabled: false });
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isEnabled).toBe(false));
    expect(result.current.challenges).toEqual([]);
    // The list read before is still cached; it is just not handed out.
    expect(queryClient.getQueryData(['challenges', 'list'])).toHaveLength(1);
  });
});
