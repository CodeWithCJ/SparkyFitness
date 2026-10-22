import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useOAuthConsentDetails,
  useOAuthConsentMutation,
} from '@/hooks/Auth/useOAuth';
import { getErrorMessage } from '@/utils/api';

export default function OAuthConsent() {
  const { t } = useTranslation();
  const signedQuery = window.location.search.slice(1);
  const {
    data: details,
    error: detailsError,
    isLoading,
  } = useOAuthConsentDetails(signedQuery);
  const consentMutation = useOAuthConsentMutation();
  const error = detailsError || consentMutation.error;
  const submitting = consentMutation.isPending;

  const clientName =
    details?.client.name ||
    details?.client.clientId ||
    t('auth.oauth.unknownClient', 'This application');
  const clientWebsite =
    details?.client.uri && /^https?:\/\//i.test(details.client.uri)
      ? details.client.uri
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>
            {t('auth.oauth.allowAccessTitle', 'Allow access to SparkyFitness?')}
          </CardTitle>
          <CardDescription>
            {t(
              'auth.oauth.allowAccessDescription',
              '{{clientName}} wants to connect to your SparkyFitness account.',
              { clientName }
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>
                {t('auth.oauth.requestFailed', 'Authorization failed')}
              </AlertTitle>
              <AlertDescription>{getErrorMessage(error)}</AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('auth.oauth.loadingRequest', 'Loading authorization request…')}
            </div>
          )}

          {details && (
            <>
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>
                  {t('auth.oauth.unverifiedClient', 'Unverified application')}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'auth.oauth.unverifiedClientDescription',
                    "SparkyFitness has not verified this application's identity. Its name and website were supplied by the application."
                  )}
                </AlertDescription>
              </Alert>

              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">
                  {t(
                    'auth.oauth.clientWillBeAbleTo',
                    'This client is requesting permission to:'
                  )}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {details.scopes.map((scope) => (
                    <li key={scope}>
                      {scope === 'sparky:mcp'
                        ? t(
                            'auth.oauth.mcpAccessDescription',
                            'Read and update your SparkyFitness data through MCP tools.'
                          )
                        : scope === 'offline_access'
                          ? t(
                              'auth.oauth.offlineAccessDescription',
                              'Stay connected and access your account when you are not actively using SparkyFitness.'
                            )
                          : t(
                              'auth.oauth.unknownScopeDescription',
                              'Request the “{{scope}}” permission.',
                              { scope }
                            )}
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-2 border-t pt-3 text-xs">
                  {clientWebsite && (
                    <div>
                      <dt className="font-medium text-foreground">
                        {t('auth.oauth.declaredWebsite', 'Declared website')}
                      </dt>
                      <dd className="break-all text-muted-foreground">
                        <a
                          href={clientWebsite}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 underline"
                        >
                          {clientWebsite}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-medium text-foreground">
                      {t(
                        'auth.oauth.redirectDestination',
                        'Redirect destination'
                      )}
                    </dt>
                    <dd className="break-all text-muted-foreground">
                      {details.redirectUri}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {t(
                    'auth.oauth.securityHint',
                    'Only allow access if you recognize and trust this application.'
                  )}
                </p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={!details || submitting}
            onClick={() => consentMutation.mutate(false)}
          >
            {t('auth.oauth.deny', 'Deny')}
          </Button>
          <Button
            disabled={!details || submitting}
            onClick={() => consentMutation.mutate(true)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('auth.oauth.allow', 'Allow')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
