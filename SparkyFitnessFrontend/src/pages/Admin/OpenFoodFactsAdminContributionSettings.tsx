import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import { useOpenFoodFactsAdminSyncStatus } from '@/hooks/Settings/useOpenFoodFactsContributions';
import { OpenFoodFactsContributionStatus } from '@/pages/Settings/OpenFoodFactsContributionStatus';

export const OpenFoodFactsAdminContributionSettings = () => {
  const { t } = useTranslation();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { data: syncStatus } = useOpenFoodFactsAdminSyncStatus();

  if (settingsLoading || !settings) {
    return null;
  }

  const handleChange = (enabled: boolean) => {
    updateSettings({
      ...settings,
      allow_openfoodfacts_contributions: enabled,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {t(
            'settings.foodExerciseDataProviders.openFoodFacts.adminTitle',
            'Open Food Facts automatic contributions'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="allow-openfoodfacts-contributions">
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.serverGateLabel',
              'Allow automatic Open Food Facts contributions on this server'
            )}
          </Label>
          <Switch
            id="allow-openfoodfacts-contributions"
            checked={settings.allow_openfoodfacts_contributions}
            disabled={isPending}
            onCheckedChange={handleChange}
            aria-describedby="openfoodfacts-server-gate-help"
          />
        </div>

        <p
          id="openfoodfacts-server-gate-help"
          className="text-sm text-muted-foreground"
        >
          {t(
            'settings.foodExerciseDataProviders.openFoodFacts.serverGateHelp',
            'This server switch allows automatic contributions. Global credentials are an optional fallback for users without a personal account. Neither setting opts users in; every user must give consent in their own settings.'
          )}
        </p>

        {syncStatus && (
          <OpenFoodFactsContributionStatus
            status={syncStatus.status}
            recentFailures={syncStatus.recentFailures}
            showUserId
          />
        )}
      </CardContent>
    </Card>
  );
};
