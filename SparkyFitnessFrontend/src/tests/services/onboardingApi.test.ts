import {
  getOnboardingStatus,
  skipOnboarding,
  submitOnboardingData,
  resetOnboardingStatus,
} from '@/api/Onboarding/onboarding';
import * as apiModule from '@/api/api';
import type { OnboardingData } from '@/types/onboarding';

jest.mock('@/api/api');

const mockedApiCall = apiModule.apiCall as jest.MockedFunction<
  typeof apiModule.apiCall
>;

describe('onboarding API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getOnboardingStatus', () => {
    it('returns onboardingComplete and onboardingSkipped from the API', async () => {
      mockedApiCall.mockResolvedValue({
        onboardingComplete: false,
        onboardingSkipped: false,
      });

      const result = await getOnboardingStatus();

      expect(mockedApiCall).toHaveBeenCalledWith('/onboarding/status');
      expect(result).toEqual({
        onboardingComplete: false,
        onboardingSkipped: false,
      });
    });

    it('returns onboardingSkipped=true when user has skipped', async () => {
      mockedApiCall.mockResolvedValue({
        onboardingComplete: false,
        onboardingSkipped: true,
      });

      const result = await getOnboardingStatus();

      expect(result).toEqual({
        onboardingComplete: false,
        onboardingSkipped: true,
      });
    });

    it('falls back to { onboardingComplete: true, onboardingSkipped: false } on error', async () => {
      mockedApiCall.mockRejectedValue(new Error('Network error'));

      const result = await getOnboardingStatus();

      expect(result).toEqual({
        onboardingComplete: true,
        onboardingSkipped: false,
      });
    });
  });

  describe('skipOnboarding', () => {
    it('calls POST /onboarding/skip and returns the response', async () => {
      mockedApiCall.mockResolvedValue({
        message: 'Onboarding skipped successfully.',
      });

      const result = await skipOnboarding();

      expect(mockedApiCall).toHaveBeenCalledWith('/onboarding/skip', {
        method: 'POST',
      });
      expect(result).toEqual({ message: 'Onboarding skipped successfully.' });
    });

    it('propagates errors to the caller', async () => {
      mockedApiCall.mockRejectedValue(new Error('Server error'));

      await expect(skipOnboarding()).rejects.toThrow('Server error');
    });
  });

  describe('submitOnboardingData', () => {
    it('calls POST /onboarding with JSON body', async () => {
      mockedApiCall.mockResolvedValue({
        message: 'Onboarding completed successfully.',
      });

      const payload: OnboardingData = {
        sex: 'female' as const,
        primaryGoal: 'maintain_weight',
        currentWeight: 65,
        height: 165,
        birthDate: '1995-06-15',
        bodyFatRange: '',
        targetWeight: 65,
        mealsPerDay: 3,
        activityLevel: 'light',
        addBurnedCalories: false,
      };

      const result = await submitOnboardingData(payload);

      expect(mockedApiCall).toHaveBeenCalledWith('/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual({ message: 'Onboarding completed successfully.' });
    });
  });

  describe('resetOnboardingStatus', () => {
    it('calls POST /onboarding/reset and returns the response', async () => {
      mockedApiCall.mockResolvedValue({
        message: 'Onboarding status reset successfully.',
      });

      const result = await resetOnboardingStatus();

      expect(mockedApiCall).toHaveBeenCalledWith('/onboarding/reset', {
        method: 'POST',
      });
      expect(result).toEqual({
        message: 'Onboarding status reset successfully.',
      });
    });

    it('propagates errors to the caller', async () => {
      mockedApiCall.mockRejectedValue(new Error('Server error'));

      await expect(resetOnboardingStatus()).rejects.toThrow('Server error');
    });
  });
});
