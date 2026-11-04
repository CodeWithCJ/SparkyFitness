import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OPEN_METEO_PUBLIC_URL } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

interface WeatherProviderFieldsProps {
  baseUrl: string | null | undefined;
  appKey: string | null | undefined;
  onBaseUrlChange: (value: string) => void;
  onAppKeyChange: (value: string) => void;
  idPrefix: string;
}

/**
 * The fields of an Open-Meteo compatible weather provider: the server URL (no
 * default: the person adds the service on purpose, and the public address is
 * only a placeholder), an optional API key for Open-Meteo's commercial
 * service, and what sending an activity's start to that server means.
 */
export const WeatherProviderFields = ({
  baseUrl,
  appKey,
  onBaseUrlChange,
  onAppKeyChange,
  idPrefix,
}: WeatherProviderFieldsProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}_weather_base_url`}>
          {t('settings.weatherProvider.baseUrlLabel', 'Open-Meteo server URL')}
        </Label>
        <Input
          id={`${idPrefix}_weather_base_url`}
          type="text"
          value={baseUrl || ''}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={OPEN_METEO_PUBLIC_URL}
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_weather_app_key`}>
          {t('settings.weatherProvider.apiKeyLabel', 'API key (optional)')}
        </Label>
        <Input
          id={`${idPrefix}_weather_app_key`}
          type="password"
          value={appKey || ''}
          onChange={(e) => onAppKeyChange(e.target.value)}
          placeholder={t(
            'settings.weatherProvider.apiKeyPlaceholder',
            "Only for Open-Meteo's commercial service"
          )}
          autoComplete="off"
        />
      </div>
      <div className="text-sm text-muted-foreground col-span-2 space-y-1">
        <p>
          {t(
            'settings.weatherProvider.privacyNote',
            'The time a GPS-recorded activity started and its start place, rounded to two decimals (about 1 km), are sent to this server, which can see them. Use a server you trust, or run your own. With no weather provider, nothing is looked up or sent.'
          )}
        </p>
        <p>
          {t(
            'settings.weatherProvider.freeTierNote',
            "There is no default server. Open-Meteo's free service ({{url}}; its archive for older activities is served from archive-api.open-meteo.com) is for non-commercial use only. For commercial use, use its paid service (customer-api.open-meteo.com) with an API key, or run your own Open-Meteo server. A sent API key is used only for this provider.",
            { url: OPEN_METEO_PUBLIC_URL }
          )}
        </p>
        <p>
          {t(
            'settings.weatherProvider.resultNote',
            'Once this provider is active, new GPS-recorded activities get the temperature and conditions at their start. Activities that already have weather (such as from Garmin) keep it.'
          )}
        </p>
      </div>
    </>
  );
};
