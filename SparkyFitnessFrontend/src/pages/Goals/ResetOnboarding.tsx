import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResetOnboarding } from '@/hooks/Onboarding/useOnboarding';
export const ResetOnboarding = () => {
  const { t } = useTranslation();
  const { mutateAsync: resetOnboardingStatus, isPending: saving } =
    useResetOnboarding();
  const handleResetOnboarding = async () => {
    if (
      !confirm(
        t(
          'goals.goalsSettings.resetOnboardingConfirm',
          'Are you sure you want to reset your onboarding status? This will restart the onboarding process.'
        )
      )
    ) {
      return;
    }
    try {
      await resetOnboardingStatus();
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset onboarding', error);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('goals.goalsSettings.resetOnboarding', 'Reset Onboarding')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'goals.goalsSettings.resetOnboardingDescription',
            'Reset your onboarding status to revisit the initial questionnaire. You will be signed out after resetting.'
          )}
        </p>
        <Button
          onClick={handleResetOnboarding}
          disabled={saving}
          variant="destructive"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('goals.goalsSettings.resetOnboarding', 'Reset Onboarding')}
        </Button>
      </CardContent>
    </Card>
  );
};
