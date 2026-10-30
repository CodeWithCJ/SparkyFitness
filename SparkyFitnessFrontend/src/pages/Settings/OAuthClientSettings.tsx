import { Cable, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useOAuthAuthorizations,
  useRevokeOAuthAuthorization,
} from '@/hooks/Auth/useOAuth';
import { toast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/api';

export function OAuthClientSettings() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useOAuthAuthorizations();
  const revoke = useRevokeOAuthAuthorization();

  if (!isLoading && data && !data.enabled) return null;

  const revokeAuthorization = async (consentId: string) => {
    try {
      await revoke.mutateAsync(consentId);
      toast({
        title: t(
          'settings.oauthClients.revokeSuccess',
          'Application access revoked'
        ),
      });
    } catch (revokeError) {
      toast({
        title: t(
          'settings.oauthClients.revokeError',
          'Failed to revoke access'
        ),
        description: getErrorMessage(revokeError),
        variant: 'destructive',
      });
    }
  };

  return (
    <AccordionItem value="oauth-clients" className="border rounded-lg mb-4">
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.oauthClients.description',
          'Review and revoke applications connected through Remote MCP OAuth'
        )}
      >
        <Cable className="h-5 w-5" />
        {t('settings.oauthClients.title', 'Connected MCP Applications')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0">
        {isLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(
              'settings.oauthClients.loading',
              'Loading connected applications…'
            )}
          </div>
        )}

        {error && (
          <p className="py-4 text-sm text-destructive">
            {t(
              'settings.oauthClients.loadError',
              'Failed to load connected applications.'
            )}
          </p>
        )}

        {data?.enabled && data.authorizations.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t(
              'settings.oauthClients.empty',
              'No applications currently have OAuth access to your account.'
            )}
          </p>
        )}

        <div className="space-y-3">
          {data?.authorizations.map((authorization) => (
            <div
              key={authorization.consentId}
              className="flex items-start justify-between gap-4 rounded-md border p-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">
                  {authorization.name || authorization.clientId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'settings.oauthClients.unverified',
                    'Unverified application'
                  )}
                </p>
                {authorization.uri &&
                  /^https?:\/\//i.test(authorization.uri) && (
                    <a
                      href={authorization.uri}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block break-all text-xs text-primary underline"
                    >
                      {authorization.uri}
                    </a>
                  )}
                <p className="text-xs text-muted-foreground">
                  {t('settings.oauthClients.permissions', 'Permissions:')}{' '}
                  {authorization.scopes.join(', ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.oauthClients.authorizedAt', 'Authorized:')}{' '}
                  {new Date(authorization.createdAt).toLocaleString()}
                </p>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending}
                    className="shrink-0 text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('settings.oauthClients.revoke', 'Revoke')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t(
                        'settings.oauthClients.revokeTitle',
                        'Revoke application access?'
                      )}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        'settings.oauthClients.revokeDescription',
                        '{{clientName}} will immediately lose access and must be authorized again to reconnect.',
                        {
                          clientName:
                            authorization.name || authorization.clientId,
                        }
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('common.cancel', 'Cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void revokeAuthorization(authorization.consentId)
                      }
                    >
                      {t('settings.oauthClients.revoke', 'Revoke')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
