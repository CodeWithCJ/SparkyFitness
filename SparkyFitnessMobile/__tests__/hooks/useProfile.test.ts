import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile } from '../../src/hooks/useProfile';
import { profileQueryKey } from '../../src/hooks/queryKeys';
import { fetchProfile } from '../../src/services/api/profileApi';

jest.mock('../../src/services/api/profileApi', () => ({
  fetchProfile: jest.fn(),
}));

const mockFetchProfile = fetchProfile as jest.MockedFunction<typeof fetchProfile>;

describe('useProfile', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = 'QueryClientWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('query behavior', () => {
    test('fetches profile on mount', async () => {
      mockFetchProfile.mockResolvedValue({
        id: '123',
        full_name: 'Test User',
        phone_number: null,
        date_of_birth: '1990-01-01',
        bio: null,
        avatar_url: null,
        gender: 'male',
      });

      renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchProfile).toHaveBeenCalled();
      });
    });

    test('returns profile data', async () => {
      const profileData = {
        id: '1adfcf00-032e-4331-a826-299d7b4b52fe',
        full_name: 'Andrew',
        phone_number: null,
        date_of_birth: '2016-01-01',
        bio: null,
        avatar_url: null,
        gender: 'male' as const,
      };
      mockFetchProfile.mockResolvedValue(profileData);

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.profile).toEqual(profileData);
    });

    test('isError is true on fetch failure', async () => {
      mockFetchProfile.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('refetch', () => {
    test('provides refetch function', async () => {
      mockFetchProfile.mockResolvedValue({
        id: '123',
        full_name: 'Test User',
        phone_number: null,
        date_of_birth: '1990-01-01',
        bio: null,
        avatar_url: null,
        gender: 'male',
      });

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    test('refetch updates data', async () => {
      mockFetchProfile.mockResolvedValue({
        id: '123',
        full_name: 'Test User',
        phone_number: null,
        date_of_birth: '1990-01-01',
        bio: null,
        avatar_url: null,
        gender: 'male',
      });

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.profile?.gender).toBe('male');
      });

      mockFetchProfile.mockResolvedValue({
        id: '123',
        full_name: 'Test User',
        phone_number: null,
        date_of_birth: '1990-01-01',
        bio: null,
        avatar_url: null,
        gender: 'female',
      });

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.profile?.gender).toBe('female');
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(profileQueryKey).toEqual(['userProfile']);
    });
  });
});
