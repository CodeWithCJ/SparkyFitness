import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clipboard } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import { RoutingProviderFields } from './RoutingProviderFields';
import { WeatherProviderFields } from './WeatherProviderFields';

// Developer dashboards where each OAuth provider's Client ID/Secret and callback
// URL are configured. Kept in sync with the per-provider text in EditProviderForm.
const OAUTH_DASHBOARD_LABELS =
  'settings.foodExerciseDataProviders.oauthDashboards';

const OAUTH_PROVIDER_DASHBOARDS: Record<
  string,
  { labelKey: string; url: string }
> = {
  withings: {
    labelKey: `${OAUTH_DASHBOARD_LABELS}.withings`,
    url: 'https://developer.withings.com/dashboard/',
  },
  fitbit: {
    labelKey: `${OAUTH_DASHBOARD_LABELS}.fitbit`,
    url: 'https://dev.fitbit.com/apps',
  },
  oura: {
    labelKey: `${OAUTH_DASHBOARD_LABELS}.oura`,
    url: 'https://developer.ouraring.com/applications',
  },
  googlehealth: {
    labelKey: `${OAUTH_DASHBOARD_LABELS}.googlehealth`,
    url: 'https://console.cloud.google.com/apis/credentials',
  },
  polar: {
    labelKey: `${OAUTH_DASHBOARD_LABELS}.polar`,
    url: 'https://admin.polaraccesslink.com',
  },
};

interface ProviderSpecificFieldsProps {
  provider: Partial<ExternalDataProvider>;
  setProvider: React.Dispatch<
    React.SetStateAction<Partial<ExternalDataProvider>>
  >;
  fullSyncOnConnect: boolean;
  setFullSyncOnConnect: (val: boolean) => void;
  onCopy: (text: string) => void;
}

export const ProviderSpecificFields = ({
  provider,
  setProvider,
  fullSyncOnConnect,
  setFullSyncOnConnect,
  onCopy,
}: ProviderSpecificFieldsProps) => {
  const { t } = useTranslation();
  const needsBaseUrl = ['mealie', 'tandoor', 'norish'].includes(
    provider.provider_type || ''
  );
  const needsAppId = [
    'nutritionix',
    'fatsecret',
    'withings',
    'fitbit',
    'oura',
    'googlehealth',
    'strava',
    'polar',
    'intervals',
  ].includes(provider.provider_type || '');
  const needsAppKey = [
    'mealie',
    'tandoor',
    'norish',
    'nutritionix',
    'fatsecret',
    'usda',
    'withings',
    'fitbit',
    'oura',
    'googlehealth',
    'strava',
    'polar',
    'hevy',
    'liftosaur',
    'intervals',
  ].includes(provider.provider_type || '');

  const providerDashboard =
    OAUTH_PROVIDER_DASHBOARDS[provider.provider_type || ''];

  const getCallbackUrl = () => {
    if (provider.provider_type === 'strava') {
      return `${window.location.origin}/strava/callback`;
    }
    return `${window.location.origin}/${provider.provider_type}/callback`;
  };

  const yazioMoreInfoText = t(
    'settings.foodExerciseDataProviders.yazio.moreInfoLink',
    'For more information & client credentials, see <1>saganos/yazio_public_api</1>.'
  );
  const yazioHasRepoLink =
    yazioMoreInfoText.includes('saganos/yazio_public_api') ||
    yazioMoreInfoText.includes('<1>') ||
    yazioMoreInfoText.includes('<link>');
  const yazioRepoLinkElement = (
    <a
      href="https://github.com/saganos/yazio_public_api"
      target="_blank"
      rel="noopener noreferrer"
      className="text-red-800 dark:text-red-200 underline font-medium"
    >
      saganos/yazio_public_api
    </a>
  );

  return (
    <>
      {needsBaseUrl && (
        <div>
          <Label htmlFor="new_base_url">
            {t('settings.providerSpecificFields.appURL', 'App URL')}
          </Label>
          <Input
            id="new_base_url"
            type="text"
            value={provider.base_url || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, base_url: e.target.value }))
            }
            placeholder={t(
              'settings.providerSpecificFields.eGHttpYourInstance',
              'e.g., http://your-{{provider_type}}-instance.com',
              { provider_type: provider.provider_type }
            )}
            autoComplete="off"
          />
        </div>
      )}

      {provider.provider_type === 'valhalla' && (
        <RoutingProviderFields
          idPrefix="new"
          baseUrl={provider.base_url}
          appKey={provider.app_key}
          onBaseUrlChange={(value) =>
            setProvider((prev) => ({ ...prev, base_url: value }))
          }
          onAppKeyChange={(value) =>
            setProvider((prev) => ({ ...prev, app_key: value }))
          }
        />
      )}
      {provider.provider_type === 'open_meteo' && (
        <WeatherProviderFields
          idPrefix="new"
          baseUrl={provider.base_url}
          appKey={provider.app_key}
          onBaseUrlChange={(value) =>
            setProvider((prev) => ({ ...prev, base_url: value }))
          }
          onAppKeyChange={(value) =>
            setProvider((prev) => ({ ...prev, app_key: value }))
          }
        />
      )}

      {needsAppId && (
        <div>
          <Label htmlFor="new_app_id">
            {[
              'withings',
              'fitbit',
              'oura',
              'googlehealth',
              'strava',
              'polar',
              'fatsecret',
            ].includes(provider.provider_type || '')
              ? t('settings.providerSpecificFields.clientID', 'Client ID')
              : provider.provider_type === 'yazio'
                ? t(
                    'settings.providerSpecificFields.yazioEmailUsername',
                    'YAZIO Email / Username'
                  )
                : provider.provider_type === 'intervals'
                  ? t('integrations.intervalsAthleteId', 'Athlete ID')
                  : t('settings.providerSpecificFields.appID', 'App ID')}
          </Label>
          <Input
            id="new_app_id"
            type="text"
            value={provider.app_id || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, app_id: e.target.value }))
            }
            placeholder={
              provider.provider_type === 'intervals'
                ? t(
                    'integrations.intervalsAthleteIdPlaceholder',
                    'Enter Athlete ID (i12345)'
                  )
                : t('settings.providerSpecificFields.enterID', 'Enter ID')
            }
            autoComplete="off"
          />
        </div>
      )}

      {needsAppKey && (
        <div>
          <Label htmlFor="new_app_key">
            {[
              'withings',
              'fitbit',
              'oura',
              'googlehealth',
              'strava',
              'polar',
              'fatsecret',
            ].includes(provider.provider_type || '')
              ? t(
                  'settings.providerSpecificFields.clientSecret',
                  'Client Secret'
                )
              : provider.provider_type === 'yazio'
                ? t(
                    'settings.providerSpecificFields.yazioPassword',
                    'YAZIO Password'
                  )
                : provider.provider_type === 'liftosaur'
                  ? t(
                      'settings.providerSpecificFields.liftosaurAPIKey',
                      'Liftosaur API Key'
                    )
                  : t(
                      'settings.providerSpecificFields.apiKeyAppKey',
                      'API Key / App Key'
                    )}
          </Label>
          <Input
            id="new_app_key"
            type="password"
            value={provider.app_key || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, app_key: e.target.value }))
            }
            placeholder={
              provider.provider_type === 'liftosaur'
                ? t(
                    'settings.providerSpecificFields.enterLiftosaurAPIKeyLftsk',
                    'Enter Liftosaur API Key (lftsk_...)'
                  )
                : t('settings.providerSpecificFields.enterKey', 'Enter Key')
            }
            autoComplete="off"
          />
        </div>
      )}

      {provider.provider_type === 'openfoodfacts' && (
        <>
          <div>
            <Label htmlFor="add-openfoodfacts-base-url">
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.baseUrlLabel'
              )}
            </Label>
            <Input
              id="add-openfoodfacts-base-url"
              type="text"
              value={provider.base_url || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, base_url: e.target.value }))
              }
              placeholder="https://world.openfoodfacts.org"
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t('settings.foodExerciseDataProviders.openFoodFacts.baseUrlHelp')}
          </p>
          <div>
            <Label htmlFor="add-openfoodfacts-username">
              {t(
                'settings.providerSpecificFields.openFoodFactsUsernameOptional',
                'Open Food Facts Username (Optional)'
              )}
            </Label>
            <Input
              id="add-openfoodfacts-username"
              type="text"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder={t(
                'settings.providerSpecificFields.enterOpenFoodFactsUsername',
                'Enter Open Food Facts username'
              )}
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-openfoodfacts-password">
              {t(
                'settings.providerSpecificFields.openFoodFactsPasswordOptional',
                'Open Food Facts Password (Optional)'
              )}
            </Label>
            <Input
              id="add-openfoodfacts-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder={t(
                'settings.providerSpecificFields.enterOpenFoodFactsPassword',
                'Enter Open Food Facts password'
              )}
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.credentialContributionHelp'
            )}
          </p>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.providerSpecificFields.openFoodFactsIsA2"
              defaults={
                'Open Food Facts is a community-driven database that supports localization. Sparky automatically queries products in your active language setting in SparkyFitness. For more information, visit the <link>Open Food Facts Portal</link> or learn about language support in the <link2>Open Food Facts Translations Wiki</link2>.'
              }
              components={{
                link: (
                  <a
                    href="https://world.openfoodfacts.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
                link2: (
                  <a
                    href="https://en.wiki.openfoodfacts.org/Translations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        </>
      )}

      {provider.provider_type === 'yazio' && (
        <>
          <div className="col-span-2">
            <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                {t(
                  'settings.foodExerciseDataProviders.yazio.unofficialApiTitle',
                  '⚠️ Unofficial API — Use at your own risk'
                )}
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                <Trans
                  i18nKey="settings.foodExerciseDataProviders.yazio.unofficialApiWarning"
                  defaults="YAZIO integration uses an <1>unofficial, undocumented API</1> that is not provided or endorsed by YAZIO. Using it may <3>risk getting your YAZIO account banned</3>. The API could also <5>stop working at any time</5> without notice if YAZIO changes their backend."
                  components={{
                    1: <strong />,
                    3: <strong />,
                    5: <strong />,
                    strong: <strong />,
                    strong2: <strong />,
                    strong3: <strong />,
                  }}
                />
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {yazioHasRepoLink ? (
                  <Trans
                    i18nKey="settings.foodExerciseDataProviders.yazio.moreInfoLink"
                    defaults="For more information & client credentials, see <1>saganos/yazio_public_api</1>."
                    components={{
                      1: yazioRepoLinkElement,
                      link: yazioRepoLinkElement,
                    }}
                  />
                ) : (
                  <>
                    {yazioMoreInfoText} {yazioRepoLinkElement}.
                  </>
                )}
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="add-yazio-username">
              {t(
                'settings.foodExerciseDataProviders.yazio.emailUsernameLabel',
                'YAZIO Email / Username'
              )}
            </Label>
            <Input
              id="add-yazio-username"
              type="text"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder={t(
                'settings.foodExerciseDataProviders.yazio.emailUsernamePlaceholder',
                'Enter YAZIO email or username'
              )}
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-yazio-password">
              {t(
                'settings.foodExerciseDataProviders.yazio.passwordLabel',
                'YAZIO Password'
              )}
            </Label>
            <Input
              id="add-yazio-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder={t(
                'settings.foodExerciseDataProviders.yazio.passwordPlaceholder',
                'Enter YAZIO password'
              )}
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t(
              'settings.foodExerciseDataProviders.yazio.allFieldsRequired',
              'All fields (Email/Username, Password, Client ID, and Client Secret) are required.'
            )}
          </p>
          <div>
            <Label htmlFor="add-yazio-client-id">
              {t(
                'settings.foodExerciseDataProviders.yazio.clientIdLabel',
                'YAZIO Client ID'
              )}
            </Label>
            <Input
              id="add-yazio-client-id"
              type="text"
              value={provider.yazio_client_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({
                  ...prev,
                  yazio_client_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.foodExerciseDataProviders.yazio.clientIdPlaceholder',
                'Enter YAZIO Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="add-yazio-client-secret">
              {t(
                'settings.foodExerciseDataProviders.yazio.clientSecretLabel',
                'YAZIO Client Secret'
              )}
            </Label>
            <Input
              id="add-yazio-client-secret"
              type="password"
              value={provider.yazio_client_secret || ''}
              onChange={(e) =>
                setProvider((prev) => ({
                  ...prev,
                  yazio_client_secret: e.target.value,
                }))
              }
              placeholder={t(
                'settings.foodExerciseDataProviders.yazio.clientSecretPlaceholder',
                'Enter YAZIO Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t(
              'settings.foodExerciseDataProviders.yazio.languageSupportHelp',
              'YAZIO food searches automatically adjust to your active language preference in SparkyFitness (supporting English, German, French, Russian, Spanish, Italian, Dutch, Polish, Portuguese, Danish, Finnish, Swedish, Czech, Hungarian, Greek, Norwegian, Turkish, Chinese, Japanese, and Korean). Other languages default to standard international database parameters.'
            )}
          </p>
        </>
      )}
      {provider.provider_type === 'garmin' && (
        <>
          <div>
            <Label htmlFor="add-garmin-email">
              {t('settings.providerSpecificFields.garminEmail', 'Garmin Email')}
            </Label>
            <Input
              id="add-garmin-email"
              type="email"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder={t(
                'settings.providerSpecificFields.enterGarminEmail',
                'Enter Garmin Email'
              )}
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-garmin-password">
              {t(
                'settings.providerSpecificFields.garminPassword',
                'Garmin Password'
              )}
            </Label>
            <Input
              id="add-garmin-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder={t(
                'settings.providerSpecificFields.enterGarminPassword',
                'Enter Garmin Password'
              )}
              autoComplete="current-password"
            />
          </div>
        </>
      )}

      {['withings', 'fitbit', 'oura', 'googlehealth', 'polar'].includes(
        provider.provider_type || ''
      ) && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.thisIntegrationUsesOAuth2You2"
            defaults={
              'This integration uses OAuth2. You will be redirected to the provider to authorize access after adding or updating the provider.<br/>In your <link>{{dashboard}}</link>, you must set your callback URL to:'
            }
            values={{
              dashboard: providerDashboard
                ? t(providerDashboard.labelKey)
                : t(`${OAUTH_DASHBOARD_LABELS}.fallback`),
            }}
            components={{
              br: <br />,
              link: providerDashboard ? (
                <a
                  href={providerDashboard.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ) : (
                <span />
              ),
            }}
          />
          <strong className="flex items-center mt-1">
            {getCallbackUrl()}
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-5 w-5"
              onClick={(e) => {
                e.preventDefault();
                onCopy(getCallbackUrl());
              }}
            >
              <Clipboard className="h-4 w-4" />
            </Button>
          </strong>
        </p>
      )}

      {provider.provider_type === 'strava' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.stravaIntegrationUsesOAuth2You2"
            defaults={
              'Strava integration uses OAuth2. You will be redirected to Strava to authorize access after adding or updating the provider.<br/>In your <link>Strava API Dashboard</link>, you must set your "Authorization Callback Domain" to:'
            }
            components={{
              br: <br />,
              link: (
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
            }}
          />
          <strong className="flex items-center mt-1">
            {window.location.hostname}
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-5 w-5"
              onClick={(e) => {
                e.preventDefault();
                onCopy(window.location.hostname);
              }}
            >
              <Clipboard className="h-4 w-4" />
            </Button>
          </strong>
          <span className="block">
            {t(
              'settings.providerSpecificFields.ensureLocalUrl',
              'Also ensure your local URL is correct if testing locally.'
            )}
          </span>
          <Trans
            i18nKey="settings.providerSpecificFields.stravaCallbackNote"
            defaults={
              'Note: Strava callback URL on the server is configured to: <strong>{{value}}</strong>'
            }
            values={{ value: `${window.location.origin}/strava/callback` }}
            components={{ strong: <strong /> }}
          />
        </p>
      )}

      {provider.provider_type === 'garmin' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.noteGarminConnectIntegrationIs2"
            defaults={
              'Note: Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section.<br/>Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.'
            }
            components={{ br: <br /> }}
          />
        </p>
      )}

      {provider.provider_type === 'hevy' && (
        <p className="text-sm text-muted-foreground col-span-2">
          {t(
            'settings.providerSpecificFields.getYourAPIKeyFrom',
            'Get your API Key from Hevy Settings > API Key.'
          )}
        </p>
      )}

      {provider.provider_type === 'liftosaur' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.generateAnAPIKeyIn2"
            defaults={
              'Generate an API key in the Liftosaur app: Settings > API Keys (starts with <span>lftsk_</span>). A Liftosaur Pro subscription is required to use the Liftosaur API.'
            }
            components={{ span: <span className="font-mono" /> }}
          />
        </p>
      )}

      {provider.provider_type === 'intervals' && (
        <p className="text-sm text-muted-foreground col-span-2">
          {t(
            'integrations.intervalsCredentialsHelp',
            'Find your Athlete ID and API Key on intervals.icu under Settings > Developer Settings.'
          )}
        </p>
      )}

      {provider.provider_type === 'nutritionix' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.getYourAppIDAnd2"
            defaults={
              'Get your App ID and App Key from the <link>Nutritionix Developer Portal</link>.'
            }
            components={{
              link: (
                <a
                  href="https://developer.nutritionix.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
            }}
          />
        </p>
      )}

      {provider.provider_type === 'fatsecret' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.noteForFatsecretYouNeed2"
            defaults={
              'Note: For Fatsecret, you need to set up <strong>your public IP</strong> whitelisting in your Fatsecret developer account. This process can take up to 24 hours.<br/>Get your Client ID and Client Secret from the <link>Fatsecret Platform Dashboard</link>, under <strong2>REST API OAuth 2.0 Credentials</strong2> (not the OAuth 1.0 Consumer Key/Secret).'
            }
            components={{
              strong: <strong />,
              br: <br />,
              link: (
                <a
                  href="https://platform.fatsecret.com/my-account/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
              strong2: <strong />,
            }}
          />
        </p>
      )}

      {provider.provider_type === 'usda' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.providerSpecificFields.getYourAPIKeyFrom3"
            defaults={
              'Get your API Key from the <link>USDA FoodData Central API Guide</link>.'
            }
            components={{
              link: (
                <a
                  href="https://fdc.nal.usda.gov/api-guide.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
            }}
          />
        </p>
      )}

      {['hevy', 'polar', 'liftosaur'].includes(
        provider.provider_type || ''
      ) && (
        <div className="flex items-center space-x-2 col-span-2">
          <Switch
            id="full_sync_on_connect"
            checked={fullSyncOnConnect}
            onCheckedChange={setFullSyncOnConnect}
          />
          <Label htmlFor="full_sync_on_connect">
            {t(
              'settings.providerSpecificFields.syncEntireHistoryOnConnect',
              'Sync entire history on connect'
            )}
          </Label>
        </div>
      )}

      {provider.provider_type === 'swissfood' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.providerSpecificFields.theSwissFoodCompositionDatabase2"
              defaults={
                'The Swiss Food Composition Database API is free, public, and requires no credentials. Supported languages for searches and nutritional value labels are <strong>English (en)</strong>, <strong2>German (de)</strong2>, <strong3>French (fr)</strong3>, and <strong4>Italian (it)</strong4>.'
              }
              components={{
                strong: <strong />,
                strong2: <strong />,
                strong3: <strong />,
                strong4: <strong />,
              }}
            />
          </p>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.providerSpecificFields.ifYourActiveLanguageIn2"
              defaults={
                'If your active language in SparkyFitness is not supported, the API queries will default to English. For more details, see the official portal at <link>Swiss Food Composition Database</link>.'
              }
              components={{
                link: (
                  <a
                    href="https://naehrwertdaten.ch/en/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        </div>
      )}

      {provider.provider_type === 'canadian-nutrient-file' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.cnf.providerSpecificDescription"
              defaults="The Canadian Nutrient File (CNF) contains information published by Health Canada under the <1>Open Government Licence – Canada</1>. It is free, public, and requires no credentials. Supported languages are <3>English (en)</3> and <5>French (fr)</5>."
              components={{
                1: (
                  <a
                    href="https://open.canada.ca/en/open-government-licence-canada"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
                3: <strong />,
                5: <strong />,
              }}
            />
          </p>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.cnf.providerSpecificPortal"
              defaults="For more details, see the official portal at <1>Canadian Nutrient File</1>."
              components={{
                1: (
                  <a
                    href="https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        </div>
      )}

      {provider.provider_type === 'free-exercise-db' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.providerSpecificFields.theFreeExerciseDBProvider2"
              defaults={
                'The Free Exercise DB provider is public, free, and requires no credentials. It fetches exercise data directly from the community repository at <link>yuhonas/free-exercise-db on GitHub</link>.'
              }
              components={{
                link: (
                  <a
                    href="https://github.com/yuhonas/free-exercise-db"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        </div>
      )}

      {provider.provider_type === 'wger' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.providerSpecificFields.theWgerProviderIsPublic2"
              defaults={
                'The wger provider is public, free, and requires no credentials. It fetches workout and exercise data directly from the official <link>wger Project Website</link>.'
              }
              components={{
                link: (
                  <a
                    href="https://wger.de/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        </div>
      )}

      {provider.provider_type === 'coros_mcp' && (
        <div className="col-span-2 space-y-4">
          <div>
            <Label htmlFor="coros_region">
              {t(
                'settings.foodExerciseDataProviders.coros.regionLabel',
                'COROS Region'
              )}
            </Label>
            <Select
              value={provider.base_url || 'https://mcpus.coros.com/mcp'}
              onValueChange={(val) =>
                setProvider((prev) => ({ ...prev, base_url: val }))
              }
            >
              <SelectTrigger id="coros_region" className="w-full">
                <SelectValue
                  placeholder={t(
                    'settings.providerSpecificFields.selectRegion',
                    'Select region'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="https://mcpus.coros.com/mcp">
                  {t(
                    'settings.foodExerciseDataProviders.coros.regionUs',
                    'United States (mcpus.coros.com)'
                  )}
                </SelectItem>
                <SelectItem value="https://mcpeu.coros.com/mcp">
                  <Trans
                    i18nKey="settings.providerSpecificFields.europeMcpeuCorosComNot"
                    defaults={
                      'Europe (mcpeu.coros.com) <span>(not yet tested)</span>'
                    }
                    components={{
                      span: <span className="text-xs text-muted-foreground" />,
                    }}
                  />
                </SelectItem>
                <SelectItem value="https://mcpcn.coros.com/mcp">
                  <Trans
                    i18nKey="settings.providerSpecificFields.mainlandChinaMcpcnCorosCom"
                    defaults={
                      'Mainland China (mcpcn.coros.com) <span>(not yet tested)</span>'
                    }
                    components={{
                      span: <span className="text-xs text-muted-foreground" />,
                    }}
                  />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.foodExerciseDataProviders.coros.infoText',
              "No API keys needed. You'll sign in with your COROS account. Your SparkyFitness address must be https:// (or localhost) for COROS to accept the connection."
            )}
          </p>
        </div>
      )}
    </>
  );
};
