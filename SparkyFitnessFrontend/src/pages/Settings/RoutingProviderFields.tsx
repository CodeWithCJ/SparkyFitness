import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

interface RoutingProviderFieldsProps {
  baseUrl: string | null | undefined;
  appKey: string | null | undefined;
  onBaseUrlChange: (value: string) => void;
  onAppKeyChange: (value: string) => void;
  idPrefix: string;
}

/**
 * The fields of a Valhalla routing provider: the server URL (no default: the
 * person adds a server they run or may use), an optional API key for hosted
 * services, and what sending route points to that server means.
 */

// Shown as a placeholder only; it is never saved or used as a default.
const EXAMPLE_BASE_URL = 'https://valhalla.example.com';

export const RoutingProviderFields = ({
  baseUrl,
  appKey,
  onBaseUrlChange,
  onAppKeyChange,
  idPrefix,
}: RoutingProviderFieldsProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}_routing_base_url`}>
          {t('settings.routingProvider.baseUrlLabel', 'Valhalla server URL')}
        </Label>
        <Input
          id={`${idPrefix}_routing_base_url`}
          type="text"
          value={baseUrl || ''}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={EXAMPLE_BASE_URL}
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_routing_app_key`}>
          {t('settings.routingProvider.apiKeyLabel', 'API key (optional)')}
        </Label>
        <Input
          id={`${idPrefix}_routing_app_key`}
          type="password"
          value={appKey || ''}
          onChange={(e) => onAppKeyChange(e.target.value)}
          placeholder={t(
            'settings.routingProvider.apiKeyPlaceholder',
            'Only for hosted services such as Stadia Maps'
          )}
          autoComplete="off"
        />
      </div>
      <div className="text-sm text-muted-foreground col-span-2 space-y-1">
        <p>
          {t(
            'settings.routingProvider.privacyNote',
            'The points of the routes you generate or draw with Follow roads (start, end and any waypoints in between) are sent to this server, which can see them. Use a server you trust, or run your own.'
          )}
        </p>
        <p>
          {t(
            'settings.routingProvider.publicServerNote',
            'There is no default server. The public Valhalla server run by FOSSGIS is a demo for light personal testing, and its maintainers say it is not meant for production use by third parties, so do not point a shared server at it. Run your own Valhalla, use a hosted service (Stadia Maps, for one, offers a free plan for non-commercial use only) or a server whose operator has agreed. A sent API key is used only for this provider.'
          )}
        </p>
        <p>
          {t(
            'settings.routingProvider.unlockNote',
            'Once this provider is active, route generation and Follow roads become available in the mobile app.'
          )}
        </p>
      </div>
    </>
  );
};
