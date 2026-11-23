import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation, Trans } from 'react-i18next';
import { getFoodProviderMetadata } from '@workspace/shared';

interface FoodProviderApiKeyFieldProps {
  providerType: string;
  appKey: string;
  onChange: (value: string) => void;
  idPrefix?: string;
}

export const FoodProviderApiKeyField = ({
  providerType,
  appKey,
  onChange,
  idPrefix = 'edit',
}: FoodProviderApiKeyFieldProps) => {
  const { t } = useTranslation();
  const meta = getFoodProviderMetadata(providerType);

  const inputId = `${idPrefix}_app_key`;
  const isUsda = providerType === 'usda';

  const placeholder = isUsda
    ? t('settings.editProviderForm.enterUSDAAPIKey', 'Enter USDA API Key')
    : t(
        `settings.foodProviders.${providerType}.apiKeyPlaceholder`,
        t('settings.editProviderForm.apiKey', 'API Key')
      );

  return (
    <>
      <div className="col-span-2 sm:col-span-1">
        <Label htmlFor={inputId}>
          {t('settings.editProviderForm.apiKey', 'API Key')}
        </Label>
        <Input
          id={inputId}
          type="password"
          value={appKey || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>
      {isUsda ? (
        <p className="text-sm text-muted-foreground col-span-2">
          <Trans
            i18nKey="settings.editProviderForm.getYourAPIKeyFrom3"
            defaults={
              'Get your API Key from the <link>USDA FoodData Central API Guide</link>.'
            }
            components={{
              link: (
                <a
                  href={
                    meta?.apiKeyUrl ||
                    'https://fdc.nal.usda.gov/api-key-signup.html'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                />
              ),
            }}
          />
        </p>
      ) : (
        (meta?.apiKeyUrl || meta?.termsUrl) && (
          <p className="text-sm text-muted-foreground col-span-2 flex items-center gap-2">
            {meta?.apiKeyUrl && (
              <a
                href={meta.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                {t(
                  `settings.foodProviders.${providerType}.apiKeyLink`,
                  t('settings.foodProviders.common.getApiKey', 'Get an API Key')
                )}
              </a>
            )}
            {meta?.termsUrl && (
              <a
                href={meta.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground underline text-xs"
              >
                {t('settings.foodProviders.common.terms', 'Terms')}
              </a>
            )}
          </p>
        )
      )}
    </>
  );
};
