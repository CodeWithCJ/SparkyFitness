import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trans, useTranslation } from 'react-i18next';

interface ZeppBridgeFieldsProps {
  baseUrl: string | null | undefined;
  appKey: string | null | undefined;
  onBaseUrlChange: (value: string) => void;
  onAppKeyChange: (value: string) => void;
  idPrefix: string;
  /** When editing, a blank token keeps the saved one. */
  keepExistingToken?: boolean;
}

/**
 * The fields of a ZeppBridge provider (Amazfit / Zepp): the address of the
 * person's own ZeppBridge server and its read-only pull token. SparkyFitness
 * reads from that server only; it never contacts Zepp.
 */

// Shown as a placeholder only; it is never saved or used as a default.
const EXAMPLE_BASE_URL = 'http://zeppbridge-serve:43921';
const ZEPPBRIDGE_REPO_URL = 'https://github.com/lingcang728/ZeppBridge';
const ZEPPBRIDGE_PRIVACY_URL = `${ZEPPBRIDGE_REPO_URL}#privacy-and-connections`;

const linkClass = 'text-blue-500 underline';

export const ZeppBridgeFields = ({
  baseUrl,
  appKey,
  onBaseUrlChange,
  onAppKeyChange,
  idPrefix,
  keepExistingToken = false,
}: ZeppBridgeFieldsProps) => {
  const { t } = useTranslation();
  return (
    <>
      <Alert
        className="col-span-2 border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
        id={`${idPrefix}_zeppbridge_warning`}
      >
        <AlertTriangle aria-hidden />
        <AlertTitle>
          {t(
            'settings.zeppBridgeProvider.warningTitle',
            'Third-party integration: requires ZeppBridge'
          )}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            <Trans
              i18nKey="settings.zeppBridgeProvider.warningInstall"
              defaults={
                'ZeppBridge is an independent open-source project. It is not made, maintained or supported by SparkyFitness. This integration only works if you install and run ZeppBridge yourself. See <repo>the ZeppBridge project on GitHub</repo> for what it is and how to set it up.'
              }
              components={{
                repo: (
                  <a
                    href={ZEPPBRIDGE_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  />
                ),
              }}
            />
          </p>
          <p>
            <Trans
              i18nKey="settings.zeppBridgeProvider.warningDueDiligence"
              defaults={
                'ZeppBridge signs in to your Zepp account and keeps a copy of your health data on your own machine. Please do your own due diligence before installing it: read its documentation and <privacy>privacy notes</privacy>, check what access it asks for, and decide whether you trust it. Use it at your own risk.'
              }
              components={{
                privacy: (
                  <a
                    href={ZEPPBRIDGE_PRIVACY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  />
                ),
              }}
            />
          </p>
          <p>
            {t(
              'settings.zeppBridgeProvider.warningExperimental',
              'This integration is experimental. It was built from ZeppBridge’s published API and has had limited testing with real devices.'
            )}
          </p>
        </AlertDescription>
      </Alert>
      <div>
        <Label htmlFor={`${idPrefix}_zeppbridge_base_url`}>
          {t('settings.zeppBridgeProvider.baseUrlLabel', 'ZeppBridge URL')}
        </Label>
        <Input
          id={`${idPrefix}_zeppbridge_base_url`}
          type="text"
          value={baseUrl || ''}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={EXAMPLE_BASE_URL}
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_zeppbridge_app_key`}>
          {t('settings.zeppBridgeProvider.tokenLabel', 'Pull token')}
        </Label>
        <Input
          id={`${idPrefix}_zeppbridge_app_key`}
          type="password"
          value={appKey || ''}
          onChange={(e) => onAppKeyChange(e.target.value)}
          placeholder={
            keepExistingToken
              ? t(
                  'settings.editProviderForm.leaveBlankToKeepExisting2',
                  '•••••••• (leave blank to keep existing)'
                )
              : t(
                  'settings.zeppBridgeProvider.tokenPlaceholder',
                  'The token set as ZEPPBRIDGE_PULL_TOKEN'
                )
          }
          autoComplete="off"
        />
      </div>
      <div className="text-sm text-muted-foreground col-span-2 space-y-1">
        <p>
          {t(
            'settings.zeppBridgeProvider.overviewNote',
            'SparkyFitness only reads from your own ZeppBridge server (run `zeppbridge-cli serve`). It never contacts Zepp and never sees your Zepp login.'
          )}
        </p>
        <p>
          {t(
            'settings.zeppBridgeProvider.urlNote',
            'Type the full address including http:// (or https://). Inside Docker, put both containers on one network and use the container name, for example http://zeppbridge-serve:43921.'
          )}
        </p>
        <p>
          {t(
            'settings.zeppBridgeProvider.privateNetworkNote',
            'A private or LAN address works for admin accounts. On a server with several users, an admin has to allow private network providers first.'
          )}
        </p>
      </div>
    </>
  );
};
