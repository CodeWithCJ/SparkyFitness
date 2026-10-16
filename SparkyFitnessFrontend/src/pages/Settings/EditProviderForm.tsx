import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Clipboard } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import { toast } from '@/hooks/use-toast';
import { useExternalProviderTypesQuery } from '@/hooks/Settings/useExternalProviderSettings';

interface EditProviderFormProps {
  provider: ExternalDataProvider;
  editData: Partial<ExternalDataProvider>;
  setEditData: React.Dispatch<
    React.SetStateAction<Partial<ExternalDataProvider>>
  >;
  onSubmit: (providerId: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  isAdminMode?: boolean;
}

export const EditProviderForm = ({
  provider,
  editData,
  setEditData,
  onSubmit,
  onCancel,
  loading,
  isAdminMode = false,
}: EditProviderFormProps) => {
  const { t } = useTranslation();
  const { data: providerTypes } = useExternalProviderTypesQuery();
  // Fatsecret shares the credential fields with Nutritionix, but its dashboard
  // issues OAuth 2.0 Client ID / Client Secret rather than an App ID / App Key.
  const isFatsecret = editData.provider_type === 'fatsecret';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(provider.id);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>
            {t('settings.editProviderForm.providerName', 'Provider Name')}
          </Label>
          <Input
            value={editData.provider_name || ''}
            onChange={(e) =>
              setEditData((prev) => ({
                ...prev,
                provider_name: e.target.value,
              }))
            }
          />
        </div>
        <div>
          <Label>
            {t('settings.editProviderForm.providerType', 'Provider Type')}
          </Label>
          <Select
            value={editData.provider_type || ''}
            onValueChange={(value) =>
              setEditData((prev) => ({
                ...prev,
                provider_type: value as ExternalDataProvider['provider_type'],
                app_id: '',
                app_key: '',
                base_url:
                  value === 'coros_mcp' ? 'https://mcpus.coros.com/mcp' : '',
                garmin_connect_status: 'disconnected',
                garmin_last_status_check: '',
                garmin_token_expires: '',
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(providerTypes || [])
                .map((type) => ({
                  value: type.id,
                  label: type.display_name,
                  is_strictly_private: type.is_strictly_private,
                }))
                .filter((type) => !isAdminMode || !type.is_strictly_private)
                .map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {editData.provider_type === 'openfoodfacts' && (
        <>
          <div>
            <Label htmlFor="edit-openfoodfacts-base-url">
              {t(
                'settings.foodExerciseDataProviders.openFoodFacts.baseUrlLabel'
              )}
            </Label>
            <Input
              id="edit-openfoodfacts-base-url"
              type="text"
              value={editData.base_url || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  base_url: e.target.value,
                }))
              }
              placeholder="https://world.openfoodfacts.org"
              autoComplete="off"
              aria-describedby="edit-openfoodfacts-base-url-help"
            />
          </div>
          <p
            id="edit-openfoodfacts-base-url-help"
            className="text-sm text-muted-foreground col-span-2"
          >
            {t('settings.foodExerciseDataProviders.openFoodFacts.baseUrlHelp')}
          </p>
          <div>
            <Label htmlFor="edit-openfoodfacts-username">
              {t(
                'settings.editProviderForm.openFoodFactsUsernameOptional',
                'Open Food Facts Username (Optional)'
              )}
            </Label>
            <Input
              id="edit-openfoodfacts-username"
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.leaveBlankToKeepExisting',
                '(leave blank to keep existing)'
              )}
              autoComplete="username"
              aria-describedby="edit-openfoodfacts-credential-help"
            />
          </div>
          <div>
            <Label htmlFor="edit-openfoodfacts-password">
              {t(
                'settings.editProviderForm.openFoodFactsPasswordOptional',
                'Open Food Facts Password (Optional)'
              )}
            </Label>
            <Input
              id="edit-openfoodfacts-password"
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.leaveBlankToKeepExisting2',
                '•••••••• (leave blank to keep existing)'
              )}
              autoComplete="current-password"
              aria-describedby="edit-openfoodfacts-credential-help"
            />
          </div>
          <p
            id="edit-openfoodfacts-credential-help"
            className="text-sm text-muted-foreground col-span-2"
          >
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.credentialContributionHelp'
            )}{' '}
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.credentialKeepExistingHelp'
            )}
          </p>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.openFoodFactsIsA2"
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
      {(editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'norish') && (
        <>
          <div>
            <Label>{t('settings.editProviderForm.appURL', 'App URL')}</Label>
            <Input
              type="text"
              value={editData.base_url || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  base_url: e.target.value,
                }))
              }
              placeholder={
                editData.provider_type === 'norish'
                  ? t(
                      'settings.editProviderForm.eGHttpsNorishYour',
                      'e.g., https://norish.your-domain.com'
                    )
                  : editData.provider_type === 'tandoor'
                    ? t(
                        'settings.editProviderForm.eGHttpYourTandoor',
                        'e.g., http://your-tandoor-instance.com'
                      )
                    : t(
                        'settings.editProviderForm.eGHttpYourMealie',
                        'e.g., http://your-mealie-instance.com'
                      )
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label>{t('settings.editProviderForm.apiKey', 'API Key')}</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={
                editData.provider_type === 'norish'
                  ? t(
                      'settings.editProviderForm.enterNorishAPIKey',
                      'Enter Norish API Key'
                    )
                  : editData.provider_type === 'tandoor'
                    ? t(
                        'settings.editProviderForm.enterTandoorAPIKey',
                        'Enter Tandoor API Key'
                      )
                    : t(
                        'settings.editProviderForm.enterMealieAPIKey',
                        'Enter Mealie API Key'
                      )
              }
              autoComplete="off"
            />
          </div>
        </>
      )}
      {(editData.provider_type === 'nutritionix' ||
        editData.provider_type === 'fatsecret') && (
        <>
          <div>
            <Label>
              {isFatsecret
                ? t('settings.editProviderForm.clientID', 'Client ID')
                : t('settings.editProviderForm.appID', 'App ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={
                isFatsecret
                  ? t(
                      'settings.editProviderForm.enterClientID',
                      'Enter Client ID'
                    )
                  : t('settings.editProviderForm.enterAppID', 'Enter App ID')
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {isFatsecret
                ? t('settings.editProviderForm.clientSecret', 'Client Secret')
                : t('settings.editProviderForm.appKey', 'App Key')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={
                isFatsecret
                  ? t(
                      'settings.editProviderForm.enterClientSecret',
                      'Enter Client Secret'
                    )
                  : t('settings.editProviderForm.enterAppKey', 'Enter App Key')
              }
              autoComplete="off"
            />
          </div>
          {editData.provider_type === 'fatsecret' && (
            <p className="text-sm text-muted-foreground col-span-2">
              <Trans
                i18nKey="settings.editProviderForm.noteForFatsecretYouNeed2"
                defaults={
                  'Note: For Fatsecret, you need to set up <strong>your public IP</strong> whitelisting in your Fatsecret developer account. This process can take up to 24 hours.'
                }
                components={{ strong: <strong /> }}
              />
            </p>
          )}
        </>
      )}
      {editData.provider_type === 'yazio' && (
        <>
          <div className="col-span-2">
            <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                {t(
                  'settings.editProviderForm.unofficialAPIUseAtYour',
                  '⚠️ Unofficial API — Use at your own risk'
                )}
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                <Trans
                  i18nKey="settings.editProviderForm.yazioIntegrationUsesAnUnofficial"
                  defaults={
                    'YAZIO integration uses an <strong>unofficial, undocumented API</strong> that is not provided or endorsed by YAZIO. Using it may <strong2>risk getting your YAZIO account banned</strong2>. The API could also <strong3>stop working at any time</strong3> without notice if YAZIO changes their backend.'
                  }
                  components={{
                    strong: <strong />,
                    strong2: <strong />,
                    strong3: <strong />,
                  }}
                />
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                <Trans
                  i18nKey="settings.editProviderForm.forMoreInformationClientCredentials2"
                  defaults={
                    'For more information & client credentials, see <link>saganos/yazio_public_api</link>.'
                  }
                  components={{
                    link: (
                      <a
                        href="https://github.com/saganos/yazio_public_api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-800 dark:text-red-200 underline font-medium"
                      />
                    ),
                  }}
                />
              </p>
            </div>
          </div>
          <div>
            <Label>
              {t(
                'settings.editProviderForm.yazioEmailUsernameOptional',
                'YAZIO Email / Username (Optional)'
              )}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterYAZIOEmailOrUsername',
                'Enter YAZIO email or username'
              )}
              autoComplete="username"
            />
          </div>
          <div>
            <Label>
              {t(
                'settings.editProviderForm.yazioPasswordOptional',
                'YAZIO Password (Optional)'
              )}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.leaveBlankToKeepExisting3',
                'Leave blank to keep existing password'
              )}
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t(
              'settings.editProviderForm.emailAndPasswordAreOptional',
              'Email and password are optional. Only Client ID and Client Secret are required.'
            )}
          </p>
          <div>
            <Label>
              {t('settings.editProviderForm.yazioClientID', 'YAZIO Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.yazio_client_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  yazio_client_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterYAZIOClientID',
                'Enter YAZIO Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t(
                'settings.editProviderForm.yazioClientSecret',
                'YAZIO Client Secret'
              )}
            </Label>
            <Input
              type="password"
              value={editData.yazio_client_secret || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  yazio_client_secret: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.leaveBlankToKeepExisting4',
                'Leave blank to keep existing client secret'
              )}
              autoComplete="off"
            />
          </div>
        </>
      )}
      {editData.provider_type === 'nutritionix' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.editProviderForm.getYourAppIDAnd2"
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
      {editData.provider_type === 'fatsecret' && (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.editProviderForm.getYourClientIDAnd2"
            defaults={
              'Get your Client ID and Client Secret from the <link>Fatsecret Platform Dashboard</link>, under <strong>REST API OAuth 2.0 Credentials</strong> (not the OAuth 1.0 Consumer Key/Secret).'
            }
            components={{
              link: (
                <a
                  href="https://platform.fatsecret.com/my-account/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
              strong: <strong />,
            }}
          />
        </p>
      )}
      {editData.provider_type === 'usda' && (
        <>
          <div>
            <Label>{t('settings.editProviderForm.apiKey', 'API Key')}</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterUSDAAPIKey',
                'Enter USDA API Key'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.getYourAPIKeyFrom3"
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
        </>
      )}
      {editData.provider_type === 'withings' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.clientID', 'Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterWithingsClientID',
                'Enter Withings Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t('settings.editProviderForm.clientSecret', 'Client Secret')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterWithingsClientSecret',
                'Enter Withings Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.withingsIntegrationUsesOAuth2You2"
              defaults={
                'Withings integration uses OAuth2. You will be redirected to Withings to authorize access after adding the provider.<br/>In your <link>Withings Developer Dashboard</link>, you must set your callback URL to:'
              }
              components={{
                br: <br />,
                link: (
                  <a
                    href="https://developer.withings.com/dashboard/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  />
                ),
              }}
            />
            <strong className="flex items-center">
              {`${window.location.origin}/withings/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/withings/callback`
                  );
                  toast({
                    title: t('common.copied', 'Copied!'),
                    description: t(
                      'settings.editProviderForm.callbackURLCopiedToClipboard',
                      'Callback URL copied to clipboard.'
                    ),
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'garmin' && (
        <>
          {/* Show connection status for connected Garmin accounts instead of credential fields */}
          {provider.garmin_connect_status === 'linked' ||
          provider.garmin_connect_status === 'connected' ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">
                  {t(
                    'settings.editProviderForm.connectedToGarmin',
                    'Connected to Garmin'
                  )}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {t(
                  'settings.editProviderForm.yourGarminAccountIsConnected',
                  'Your Garmin account is connected. To reconnect with different credentials, disconnect first and add a new provider.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label>
                  {t('settings.editProviderForm.garminEmail', 'Garmin Email')}
                </Label>
                <Input
                  type="email"
                  value={editData.app_id || ''}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      app_id: e.target.value,
                    }))
                  }
                  placeholder={t(
                    'settings.editProviderForm.enterGarminEmail',
                    'Enter Garmin Email'
                  )}
                  autoComplete="username"
                />
              </div>
              <div>
                <Label>
                  {t(
                    'settings.editProviderForm.garminPassword',
                    'Garmin Password'
                  )}
                </Label>
                <Input
                  type="password"
                  value={editData.app_key || ''}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      app_key: e.target.value,
                    }))
                  }
                  placeholder={t(
                    'settings.editProviderForm.enterGarminPassword',
                    'Enter Garmin Password'
                  )}
                  autoComplete="current-password"
                />
              </div>
              <p className="text-sm text-muted-foreground col-span-2">
                <Trans
                  i18nKey="settings.editProviderForm.noteGarminConnectIntegrationIs2"
                  defaults={
                    'Note: Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section.<br/>Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.'
                  }
                  components={{ br: <br /> }}
                />
              </p>
            </>
          )}
        </>
      )}
      {editData.provider_type === 'fitbit' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.clientID', 'Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterFitbitClientID',
                'Enter Fitbit Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t('settings.editProviderForm.clientSecret', 'Client Secret')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterFitbitClientSecret',
                'Enter Fitbit Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.fitbitIntegrationUsesOAuth2You2"
              defaults={
                'Fitbit integration uses OAuth2. You will be redirected to Fitbit to authorize access after adding the provider.<br/>In your <link>Fitbit Developer Dashboard</link>, you must set your callback URL to:'
              }
              components={{
                br: <br />,
                link: (
                  <a
                    href="https://dev.fitbit.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  />
                ),
              }}
            />
            <strong className="flex items-center">
              {`${window.location.origin}/fitbit/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/fitbit/callback`
                  );
                  toast({
                    title: t('common.copied', 'Copied!'),
                    description: t(
                      'settings.editProviderForm.callbackURLCopiedToClipboard',
                      'Callback URL copied to clipboard.'
                    ),
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'oura' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.clientID', 'Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterOuraClientID',
                'Enter Oura Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t('settings.editProviderForm.clientSecret', 'Client Secret')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterOuraClientSecret',
                'Enter Oura Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.ouraIntegrationUsesOAuth2You2"
              defaults={
                'Oura integration uses OAuth2. You will be redirected to Oura to authorize access after adding the provider.<br/>In your <link>Oura Developer Portal</link>, you must set your callback URL to:'
              }
              components={{
                br: <br />,
                link: (
                  <a
                    href="https://developer.ouraring.com/applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  />
                ),
              }}
            />
            <strong className="flex items-center">
              {`${window.location.origin}/oura/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/oura/callback`
                  );
                  toast({
                    title: t('common.copied', 'Copied!'),
                    description: t(
                      'settings.editProviderForm.callbackURLCopiedToClipboard',
                      'Callback URL copied to clipboard.'
                    ),
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'strava' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.clientID', 'Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterStravaClientID',
                'Enter Strava Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t('settings.editProviderForm.clientSecret', 'Client Secret')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterStravaClientSecret',
                'Enter Strava Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.stravaIntegrationUsesOAuth2You2"
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
            <strong className="flex items-center">
              {window.location.hostname}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(window.location.hostname);
                  toast({
                    title: t('common.copied', 'Copied!'),
                    description: t(
                      'settings.editProviderForm.domainCopiedToClipboard',
                      'Domain copied to clipboard.'
                    ),
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
            <span className="block">
              {t(
                'settings.editProviderForm.ensureLocalUrl',
                'Also ensure your local URL is correct if testing locally.'
              )}
            </span>
            <Trans
              i18nKey="settings.editProviderForm.stravaCallbackNote"
              defaults={
                'Note: Strava callback URL on the server is configured to: <strong>{{value}}</strong>'
              }
              values={{ value: `${window.location.origin}/strava/callback` }}
              components={{ strong: <strong /> }}
            />
          </p>
        </>
      )}
      {editData.provider_type === 'googlehealth' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.clientID', 'Client ID')}
            </Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterGoogleCloudClientID',
                'Enter Google Cloud Client ID'
              )}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>
              {t('settings.editProviderForm.clientSecret', 'Client Secret')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterGoogleCloudClientSecret',
                'Enter Google Cloud Client Secret'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.googleHealthIntegrationUsesOAuth22"
              defaults={
                'Google Health integration uses OAuth2. After saving, click <strong>Connect</strong> on the provider card to authorize access.<br/>In your <link>Google Cloud Console</link>, your OAuth 2.0 Web Application client must have this callback URL:'
              }
              components={{
                strong: <strong />,
                br: <br />,
                link: (
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  />
                ),
              }}
            />
            <strong className="flex items-center mt-1">
              {`${window.location.origin}/googlehealth/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/googlehealth/callback`
                    );
                    toast({
                      title: t('common.copied', 'Copied!'),
                      description: t(
                        'settings.editProviderForm.callbackURLCopiedToClipboard',
                        'Callback URL copied to clipboard.'
                      ),
                    });
                  } else {
                    toast({
                      title: t(
                        'settings.editProviderForm.copyFailed',
                        'Copy Failed'
                      ),
                      description: t(
                        'settings.editProviderForm.clipboardAccessRequiresASecure',
                        'Clipboard access requires a secure context (HTTPS).'
                      ),
                      variant: 'destructive',
                    });
                  }
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'hevy' && (
        <>
          <div>
            <Label>
              {t('settings.editProviderForm.hevyAPIKey', 'Hevy API Key')}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterHevyAPIKey',
                'Enter Hevy API Key'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            {t(
              'settings.editProviderForm.getYourAPIKeyFrom2',
              'Get your API Key from Hevy Settings > API Key.'
            )}
          </p>
        </>
      )}
      {editData.provider_type === 'liftosaur' && (
        <>
          <div>
            <Label>
              {t(
                'settings.editProviderForm.liftosaurAPIKey',
                'Liftosaur API Key'
              )}
            </Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={t(
                'settings.editProviderForm.enterLiftosaurAPIKeyLftsk',
                'Enter Liftosaur API Key (lftsk_...)'
              )}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            <Trans
              i18nKey="settings.editProviderForm.generateAnAPIKeyIn2"
              defaults={
                'Generate an API key in the Liftosaur app: Settings > API Keys (starts with <span>lftsk_</span>). A Liftosaur Pro subscription is required to use the Liftosaur API.'
              }
              components={{ span: <span className="font-mono" /> }}
            />
          </p>
        </>
      )}
      {(editData.provider_type === 'withings' ||
        editData.provider_type === 'garmin' ||
        editData.provider_type === 'fitbit' ||
        editData.provider_type === 'oura' ||
        editData.provider_type === 'googlehealth' ||
        editData.provider_type === 'strava' ||
        editData.provider_type === 'polar' ||
        editData.provider_type === 'coros_mcp' ||
        editData.provider_type === 'hevy' ||
        editData.provider_type === 'liftosaur') && (
        <div>
          <Label htmlFor="edit_sync_frequency">
            {t('settings.editProviderForm.syncFrequency', 'Sync Frequency')}
          </Label>
          <Select
            value={editData.sync_frequency || 'manual'}
            onValueChange={(value) =>
              setEditData((prev) => ({
                ...prev,
                sync_frequency: value as 'hourly' | 'daily' | 'manual',
              }))
            }
          >
            <SelectTrigger id="edit_sync_frequency">
              <SelectValue
                placeholder={t(
                  'settings.editProviderForm.selectSyncFrequency',
                  'Select sync frequency'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">
                {t('settings.editProviderForm.manual', 'Manual')}
              </SelectItem>
              <SelectItem value="hourly">
                {t('settings.editProviderForm.hourly', 'Hourly')}
              </SelectItem>
              <SelectItem value="daily">
                {t('settings.editProviderForm.daily', 'Daily')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {editData.provider_type === 'swissfood' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.editProviderForm.theSwissFoodCompositionDatabase2"
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
              i18nKey="settings.editProviderForm.ifYourActiveLanguageIn2"
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

      {editData.provider_type === 'canadian-nutrient-file' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.editProviderForm.theCanadianNutrientFileCNF2"
              defaults={
                'The Canadian Nutrient File (CNF) contains information published by Health Canada under the <link>Open Government Licence – Canada</link>. It is free, public, and requires no credentials. Supported languages are <strong>English (en)</strong> and <strong2>French (fr)</strong2>.'
              }
              components={{
                link: (
                  <a
                    href="https://open.canada.ca/en/open-government-licence-canada"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
                strong: <strong />,
                strong2: <strong />,
              }}
            />
          </p>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.editProviderForm.forMoreDetailsSeeThe2"
              defaults={
                'For more details, see the official portal at <link>Canadian Nutrient File (Health Canada)</link>.'
              }
              components={{
                link: (
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

      {editData.provider_type === 'free-exercise-db' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.editProviderForm.theFreeExerciseDBProvider2"
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

      {editData.provider_type === 'wger' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.editProviderForm.theWgerProviderIsPublic2"
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

      {editData.provider_type === 'coros_mcp' && (
        <div className="col-span-2 space-y-4">
          <div>
            <Label htmlFor="edit_coros_region">
              {t(
                'settings.foodExerciseDataProviders.coros.regionLabel',
                'COROS Region'
              )}
            </Label>
            <Select
              value={editData.base_url || 'https://mcpus.coros.com/mcp'}
              onValueChange={(val) =>
                setEditData((prev) => ({ ...prev, base_url: val }))
              }
            >
              <SelectTrigger id="edit_coros_region" className="w-full">
                <SelectValue
                  placeholder={t(
                    'settings.editProviderForm.selectRegion',
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
                    i18nKey="settings.editProviderForm.europeMcpeuCorosComNot"
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
                    i18nKey="settings.editProviderForm.mainlandChinaMcpcnCorosCom"
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

      <div className="flex items-center space-x-2">
        <Switch
          checked={editData.is_active || false}
          onCheckedChange={(checked) =>
            setEditData((prev) => ({ ...prev, is_active: checked }))
          }
        />
        <Label>
          {t(
            'settings.editProviderForm.activateThisProvider',
            'Activate this provider'
          )}
        </Label>
      </div>
      {/* Public sharing switch removed */}
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {t('common.saveChanges', 'Save Changes')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </form>
  );
};
