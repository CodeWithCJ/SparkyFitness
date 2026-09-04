import { useState } from 'react';
import { AlertTriangle, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useOpenFoodFactsContributionSettings,
  useUpdateOpenFoodFactsContributionSettings,
} from '@/hooks/Settings/useOpenFoodFactsContributions';
import type { OpenFoodFactsAutomaticSyncResponse } from '@workspace/shared';
import { OpenFoodFactsContributionStatus } from './OpenFoodFactsContributionStatus';

const PRODUCT_LANGUAGE_PATTERN = /^[a-z]{2}$/;

export const OpenFoodFactsContributionSettingsCard = () => {
  const { data: settings, isLoading } = useOpenFoodFactsContributionSettings();

  if (isLoading || !settings) {
    return null;
  }

  return (
    <OpenFoodFactsContributionSettingsContent
      key={settings.productLanguage}
      settings={settings}
    />
  );
};

interface OpenFoodFactsContributionSettingsContentProps {
  settings: OpenFoodFactsAutomaticSyncResponse;
}

const OpenFoodFactsContributionSettingsContent = ({
  settings,
}: OpenFoodFactsContributionSettingsContentProps) => {
  const { t } = useTranslation();
  const { mutate: updateSettings, isPending } =
    useUpdateOpenFoodFactsContributionSettings();
  const [productLanguage, setProductLanguage] = useState(
    settings.productLanguage
  );

  const hasAccount = settings.providerScope !== null;
  const languageIsValid = PRODUCT_LANGUAGE_PATTERN.test(productLanguage);
  const settingsControlsDisabled =
    !settings.serverEnabled || !hasAccount || isPending;
  const consentDisabled =
    isPending ||
    (!settings.userEnabled &&
      (!languageIsValid || !settings.serverEnabled || !hasAccount));
  const consentDescription = `openfoodfacts-consent-warning openfoodfacts-account-status${
    settings.serverEnabled ? '' : ' openfoodfacts-server-disabled'
  }`;
  const saveConsent = (enabled: boolean) => {
    const language = enabled ? productLanguage : settings.productLanguage;
    if (!PRODUCT_LANGUAGE_PATTERN.test(language)) return;
    updateSettings({ enabled, productLanguage: language });
  };
  const saveLanguage = () => {
    if (!languageIsValid) return;
    updateSettings({
      enabled: settings.userEnabled,
      productLanguage,
    });
  };

  const accountLabel =
    settings.providerScope === 'personal'
      ? t(
          'settings.foodExerciseDataProviders.openFoodFacts.accountPersonal',
          'Available contribution account: your personal Open Food Facts account'
        )
      : settings.providerScope === 'global'
        ? t(
            'settings.foodExerciseDataProviders.openFoodFacts.accountGlobal',
            'Available contribution account: the server Open Food Facts account'
          )
        : t(
            'settings.foodExerciseDataProviders.openFoodFacts.accountMissing',
            'No Open Food Facts account is currently available'
          );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe2 className="h-5 w-5" aria-hidden />
          {t(
            'settings.foodExerciseDataProviders.openFoodFacts.contributionsTitle',
            'Open Food Facts contributions'
          )}
        </CardTitle>
        <CardDescription>
          {t(
            'settings.foodExerciseDataProviders.openFoodFacts.contributionsDescription',
            'Improve the shared Open Food Facts database and make product data better for every SparkyFitness server.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert
          id="openfoodfacts-consent-warning"
          className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
        >
          <AlertTriangle aria-hidden />
          <AlertTitle>
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.consentTitle',
              'Uploads require your consent'
            )}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.personalConsentWarning',
                'When enabled, qualifying products that you entered from physical packaging are uploaded after you add or edit them. Products imported from Open Food Facts or other providers are never uploaded. Existing eligible products are queued once as an initial backfill.'
              )}
            </p>
            <p>
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.sharedDataWarning',
                'Open Food Facts publishes structured product data under the ODbL and Database Contents License and images under CC BY-SA. SparkyFitness never uploads images automatically.'
              )}{' '}
              <a
                href="https://world.openfoodfacts.org/terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {t(
                  'settings.foodExerciseDataProviders.openFoodFacts.contributorTerms',
                  'Contributor terms'
                )}
              </a>
            </p>
          </AlertDescription>
        </Alert>

        <div
          id="openfoodfacts-account-status"
          className="rounded-md border p-3 text-sm"
        >
          <div className="font-medium">{accountLabel}</div>
          <p className="mt-1 text-muted-foreground">
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.accountPriorityHelp',
              'Your personal active account is used first. If none is configured, the enabled server account is used as fallback.'
            )}
          </p>
        </div>

        {!settings.serverEnabled && (
          <p
            id="openfoodfacts-server-disabled"
            className="text-sm text-muted-foreground"
          >
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.serverDisabled',
              'Automatic contributions are disabled by this server administrator.'
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="openfoodfacts-auto-contribute">
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.automaticContributionsLabel',
              'Automatically contribute eligible products'
            )}
          </Label>
          <Switch
            id="openfoodfacts-auto-contribute"
            checked={settings.userEnabled}
            disabled={consentDisabled}
            onCheckedChange={saveConsent}
            aria-describedby={consentDescription}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="openfoodfacts-product-language">
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.productLanguageLabel',
                'Product data language'
              )}
            </Label>
            <Input
              id="openfoodfacts-product-language"
              value={productLanguage}
              maxLength={2}
              inputMode="text"
              autoComplete="off"
              disabled={settingsControlsDisabled}
              aria-invalid={!languageIsValid}
              aria-describedby="openfoodfacts-product-language-help"
              onChange={(event) =>
                setProductLanguage(
                  event.target.value
                    .replace(/[^a-z]/gi, '')
                    .slice(0, 2)
                    .toLowerCase()
                )
              }
            />
            <p
              id="openfoodfacts-product-language-help"
              className="text-xs text-muted-foreground"
            >
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.productLanguageHelp',
                'Use the two-letter language code printed on the product packaging, for example en or de.'
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={
              settingsControlsDisabled ||
              !languageIsValid ||
              productLanguage === settings.productLanguage
            }
            onClick={saveLanguage}
          >
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.saveLanguage',
              'Save language'
            )}
          </Button>
        </div>

        <OpenFoodFactsContributionStatus
          status={settings.status}
          recentFailures={settings.recentFailures}
        />
      </CardContent>
    </Card>
  );
};
