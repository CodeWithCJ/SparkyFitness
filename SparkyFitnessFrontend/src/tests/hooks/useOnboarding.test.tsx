import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useOnboardingStatus,
  useSkipOnboarding,
  useSubmitOnboarding,
  useResetOnboarding,
} from '@/hooks/Onboarding/useOnboarding';
import * as onboardingApi from '@/api/Onboarding/onboarding';
import type { OnboardingData } from '@/types/onboarding';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/api/Onboarding/onboarding');
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const mockedGetOnboardingStatus =
  onboardingApi.getOnboardingStatus as jest.MockedFunction<
    typeof onboardingApi.getOnboardingStatus
  >;
const mockedSkipOnboarding =
  onboardingApi.skipOnboarding as jest.MockedFunction<
    typeof onboardingApi.skipOnboarding
  >;
const mockedSubmitOnboardingData =
  onboardingApi.submitOnboardingData as jest.MockedFunction<
    typeof onboardingApi.submitOnboardingData
  >;
const mockedResetOnboardingStatus =
  onboardingApi.resetOnboardingStatus as jest.MockedFunction<
    typeof onboardingApi.resetOnboardingStatus
  >;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
};

describe('useOnboardingStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns onboardingComplete and onboardingSkipped when both are false', async () => {
    mockedGetOnboardingStatus.mockResolvedValue({
      onboardingComplete: false,
      onboardingSkipped: false,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useOnboardingStatus(true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      onboardingComplete: false,
      onboardingSkipped: false,
    });
  });

  it('returns onboardingSkipped=true after user has skipped', async () => {
    mockedGetOnboardingStatus.mockResolvedValue({
      onboardingComplete: false,
      onboardingSkipped: true,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useOnboardingStatus(true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.onboardingSkipped).toBe(true);
    expect(result.current.data?.onboardingComplete).toBe(false);
  });

  it('does not fetch when disabled', () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useOnboardingStatus(false), { wrapper: Wrapper });

    expect(mockedGetOnboardingStatus).not.toHaveBeenCalled();
  });
});

describe('useSkipOnboarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls skipOnboarding API and resolves', async () => {
    mockedSkipOnboarding.mockResolvedValue({
      message: 'Onboarding skipped successfully.',
    });
    // Re-prime the status query so invalidation has something to re-fetch
    mockedGetOnboardingStatus.mockResolvedValue({
      onboardingComplete: false,
      onboardingSkipped: true,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSkipOnboarding(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSkipOnboarding).toHaveBeenCalledTimes(1);
  });

  it('transitions to error state when API call fails', async () => {
    mockedSkipOnboarding.mockRejectedValue(new Error('Network error'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSkipOnboarding(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});

describe('useSubmitOnboarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls submitOnboardingData and resolves', async () => {
    mockedSubmitOnboardingData.mockResolvedValue({
      message: 'Onboarding completed successfully.',
    });
    mockedGetOnboardingStatus.mockResolvedValue({
      onboardingComplete: true,
      onboardingSkipped: false,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubmitOnboarding(), {
      wrapper: Wrapper,
    });

    const payload: OnboardingData = {
      sex: 'male' as const,
      primaryGoal: 'lose_weight',
      currentWeight: 80,
      height: 180,
      birthDate: '1990-01-01',
      bodyFatRange: '',
      targetWeight: 75,
      mealsPerDay: 3,
      activityLevel: 'moderate',
      addBurnedCalories: false,
    };

    await act(async () => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSubmitOnboardingData).toHaveBeenCalledWith(payload);
  });
});

describe('useResetOnboarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls resetOnboardingStatus and resolves', async () => {
    mockedResetOnboardingStatus.mockResolvedValue({ message: 'Reset.' });
    mockedGetOnboardingStatus.mockResolvedValue({
      onboardingComplete: false,
      onboardingSkipped: false,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useResetOnboarding(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedResetOnboardingStatus).toHaveBeenCalledTimes(1);
  });
});
