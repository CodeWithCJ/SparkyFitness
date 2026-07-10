import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Cloud,
  HeartPulse,
  Link2Off,
  LoaderCircle,
  Info,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import {
  useConnectHuaweiHealthMutation,
  useDisconnectHuaweiHealthMutation,
  useHuaweiHealthStatus,
  useSyncHuaweiHealthMutation,
} from '@/hooks/Integrations/useHuaweiHealth';
import { HUAWEI_HEALTH_DATA_SCOPES } from '@/constants/integrationConstants';
import SyncRangeDialog from './SyncRangeDialog';
import { formatIntegrationDateTime } from '@/utils/integrationSync';
import { useDeploymentCapabilities } from '@/hooks/useDeploymentCapabilities';

const HuaweiHealthSettings = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: deploymentCapabilities } = useDeploymentCapabilities();
  const isOwnerProfile = Boolean(user && user.id === user.activeUserId);
  const statusQuery = useHuaweiHealthStatus(isOwnerProfile);
  const connectMutation = useConnectHuaweiHealthMutation();
  const syncMutation = useSyncHuaweiHealthMutation();
  const disconnectMutation = useDisconnectHuaweiHealthMutation();
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);

  const status = statusQuery.data;
  const missingScopes = useMemo(() => {
    if (syncMutation.data) return syncMutation.data.missingScopes;
    if (!status?.connected) return [];
    const granted = new Set(status.grantedScopes);
    return HUAWEI_HEALTH_DATA_SCOPES.filter((scope) => !granted.has(scope));
  }, [status, syncMutation.data]);

  const isBusy =
    connectMutation.isPending ||
    syncMutation.isPending ||
    disconnectMutation.isPending;

  const connect = async () => {
    const { authUrl } = await connectMutation.mutateAsync();
    window.location.assign(authUrl);
  };

  const sync = async (startDate: string, endDate: string) => {
    await syncMutation.mutateAsync({ startDate, endDate });
  };

  const lastSyncLabel = status?.lastSyncAt
    ? formatIntegrationDateTime(new Date(status.lastSyncAt), i18n.language)
    : null;

  return (
    <Card className="overflow-hidden border-red-500/20">
      <CardHeader className="bg-gradient-to-br from-red-500/10 via-background to-background">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">
              <HeartPulse className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl">
                <bdi dir="ltr">HUAWEI Health</bdi>
              </CardTitle>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t(
                  'huaweiHealth.subtitle',
                  'Link your health account and sync the data you approve into SparkyFitness.'
                )}
              </p>
            </div>
          </div>

          {isOwnerProfile && !statusQuery.isLoading && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={status?.connected ? 'default' : 'secondary'}
                className="w-fit"
              >
                {status?.connected
                  ? t('huaweiHealth.status.connected', 'Connected')
                  : status?.available === false
                    ? t(
                        'huaweiHealth.status.unavailable',
                        'Unavailable on this server'
                      )
                    : t('huaweiHealth.status.disconnected', 'Not connected')}
              </Badge>
              {status?.connected && missingScopes.length > 0 && (
                <Badge variant="outline" className="w-fit border-amber-500/50">
                  {t('huaweiHealth.status.partial', 'Partial permissions')}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {!isOwnerProfile ? (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>
              {t(
                'huaweiHealth.ownerOnlyTitle',
                'Only the account owner can link this service'
              )}
            </AlertTitle>
            <AlertDescription>
              {t(
                'huaweiHealth.ownerOnlyDescription',
                'To protect private health data, HUAWEI Health cannot be linked or synced while you are viewing another family profile. Switch back to your own profile to continue.'
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Cloud className="h-4 w-4 text-red-500" aria-hidden="true" />
                  {t('huaweiHealth.flowTitle', 'How web linking works')}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(
                    'huaweiHealth.cloudExplanation',
                    'Linking happens in your browser through Huawei cloud. Your watch first syncs with the HUAWEI Health app on your phone, then SparkyFitness securely imports the data you approve.'
                  )}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <ShieldCheck
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  {t(
                    'huaweiHealth.privacyTitle',
                    'Your privacy stays in your control'
                  )}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(
                    'huaweiHealth.privacyDescription',
                    'Imported data is used only for your SparkyFitness health history and reports. Access tokens are encrypted, and you can cancel authorization at any time without deleting the original data in Huawei.'
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {t('huaweiHealth.dataTitle', 'What data can be imported?')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  'huaweiHealth.dataDescription',
                  'Steps, calories burned, distance, heart rate, oxygen saturation, weight, sleep, and workouts that you approve for sharing.'
                )}
              </p>
            </div>

            {deploymentCapabilities?.backgroundJobsEnabled === false && (
              <Alert className="border-blue-500/40 bg-blue-500/5">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle>
                  {t(
                    'huaweiHealth.manualOnlyTitle',
                    'Manual sync on this deployment'
                  )}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'huaweiHealth.manualOnlyDescription',
                    'Background jobs are disabled here. After connecting, use Sync now whenever you want to import the latest approved data.'
                  )}
                </AlertDescription>
              </Alert>
            )}

            {statusQuery.isLoading && (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {t(
                  'huaweiHealth.status.loading',
                  'Checking the connection status...'
                )}
              </div>
            )}

            {statusQuery.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t(
                    'huaweiHealth.errors.status',
                    'The connection status could not be checked.'
                  )}
                </AlertDescription>
              </Alert>
            )}

            {status?.available === false && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {t(
                    'huaweiHealth.notConfiguredTitle',
                    'This server has not configured the integration'
                  )}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'huaweiHealth.notConfiguredDescription',
                    'A server administrator must configure the Huawei app credentials and approved Health Service scopes before users can connect.'
                  )}
                </AlertDescription>
              </Alert>
            )}

            {status?.connected && missingScopes.length > 0 && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle>
                  {t(
                    'huaweiHealth.partialTitle',
                    'Some data is not authorized'
                  )}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'huaweiHealth.partialDescription',
                    'Sync continues for approved data. {{count}} requested data types are not currently authorized; you can change permissions in your Huawei account.',
                    { count: missingScopes.length }
                  )}
                </AlertDescription>
              </Alert>
            )}

            {syncMutation.data && (
              <Alert className="border-emerald-500/40 bg-emerald-500/5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <AlertTitle>
                  {t('huaweiHealth.syncCompleteTitle', 'Sync complete')}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'huaweiHealth.syncCompleteDescription',
                    'Processed {{processed}}, skipped {{skipped}}, and could not import {{errors}} records.',
                    {
                      processed: syncMutation.data.processed,
                      skipped: syncMutation.data.skipped,
                      errors: syncMutation.data.errors,
                    }
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {status?.connected
                  ? lastSyncLabel
                    ? t('huaweiHealth.lastSync', {
                        defaultValue: 'Last sync: {{date}}',
                        date: lastSyncLabel,
                        interpolation: { escapeValue: false },
                      })
                    : t('huaweiHealth.neverSynced', 'Not synced yet.')
                  : t('huaweiHealth.status.disconnected', 'Not connected')}
              </p>

              <div className="flex flex-wrap gap-2">
                {status?.connected ? (
                  <>
                    <Button
                      onClick={() => setIsSyncDialogOpen(true)}
                      disabled={isBusy}
                    >
                      <RefreshCw
                        className={`me-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                      />
                      {syncMutation.isPending
                        ? t('huaweiHealth.syncing', 'Syncing...')
                        : t('huaweiHealth.syncNow', 'Sync now')}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={isBusy}>
                          <Link2Off className="me-2 h-4 w-4" />
                          {t('huaweiHealth.disconnect', 'Disconnect')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t(
                              'huaweiHealth.disconnectDialogTitle',
                              'Disconnect HUAWEI Health?'
                            )}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              'huaweiHealth.disconnectDialogDescription',
                              'This cancels SparkyFitness authorization with Huawei and removes access tokens stored on this server. It does not delete your original Huawei data. Previously imported SparkyFitness data remains subject to your server retention policy.'
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('huaweiHealth.cancel', 'Cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            aria-label="Confirm disconnect"
                            onClick={() => disconnectMutation.mutateAsync()}
                          >
                            {t('huaweiHealth.disconnectConfirm', 'Disconnect')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <Button
                    onClick={() => void connect()}
                    disabled={isBusy || !status?.available}
                  >
                    {connectMutation.isPending && (
                      <LoaderCircle className="me-2 h-4 w-4 animate-spin" />
                    )}
                    {connectMutation.isPending
                      ? t('huaweiHealth.connecting', 'Redirecting to Huawei...')
                      : t('huaweiHealth.connect', 'Connect account')}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>

      <SyncRangeDialog
        isOpen={isSyncDialogOpen}
        onClose={() => setIsSyncDialogOpen(false)}
        onSync={(startDate, endDate) => void sync(startDate, endDate)}
        providerType="huaweihealth"
        maxDays={31}
      />
    </Card>
  );
};

export default HuaweiHealthSettings;
