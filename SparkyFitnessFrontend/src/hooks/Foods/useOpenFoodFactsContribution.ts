import { useMutation } from '@tanstack/react-query';
import type {
  OpenFoodFactsConfirmRequest,
  OpenFoodFactsPreviewRequest,
} from '@workspace/shared';
import { useAuth } from '@/hooks/useAuth';
import { useOpenFoodFactsContributionSettings } from '@/hooks/Settings/useOpenFoodFactsContributions';
import {
  previewOpenFoodFactsContribution,
  confirmOpenFoodFactsContribution,
} from '@/api/Foods/openFoodFactsContributionService';

export function useOpenFoodFactsContributionAvailability() {
  const { user } = useAuth();
  const isOwner = Boolean(
    user?.id && (!user.activeUserId || user.activeUserId === user.id)
  );
  const { data: settings } = useOpenFoodFactsContributionSettings(isOwner);
  return {
    userId: user?.id,
    isOwner,
    settings,
    available: Boolean(
      isOwner && settings?.serverEnabled && settings.providerScope
    ),
  };
}

export function useOpenFoodFactsContribution(foodId: string) {
  const preview = useMutation({
    mutationFn: (request: OpenFoodFactsPreviewRequest) =>
      previewOpenFoodFactsContribution(foodId, request),
    retry: false,
    networkMode: 'always',
  });
  const contribute = useMutation({
    mutationFn: (request: OpenFoodFactsConfirmRequest) =>
      confirmOpenFoodFactsContribution(foodId, request),
    retry: false,
    networkMode: 'always',
  });
  return { preview, contribute };
}
