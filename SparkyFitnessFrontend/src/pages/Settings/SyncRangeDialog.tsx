import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, AlertCircle, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMockDataEnabled } from '@/hooks/Admin/useSettings';

export interface SyncMockOptions {
  /** Write this sync's raw provider responses to a JSON file on the server. */
  saveMockData?: boolean;
  /** 'local' replays the saved file instead of calling the provider. */
  dataSource?: string;
}

interface SyncRangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (
    startDate: string,
    endDate: string,
    mockOptions?: SyncMockOptions
  ) => void;
  providerType: string;
}

const SyncRangeDialog = ({
  isOpen,
  onClose,
  onSync,
  providerType,
}: SyncRangeDialogProps) => {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState<Date | undefined>(
    subDays(new Date(), 7)
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  // Only rendered when an admin has turned the capability on; the server
  // ignores both options otherwise, so this is presentation only.
  const { data: mockDataEnabled } = useMockDataEnabled();
  type SyncMode = 'live' | 'capture' | 'replay';
  const [syncMode, setSyncMode] = useState<SyncMode>('live');
  const isReplay = syncMode === 'replay';

  // ProviderCard keeps this dialog mounted and only flips `isOpen`, so state
  // survives a close. Reset the mode on the way out, otherwise a capture or
  // replay selection would silently carry into the next sync.
  const handleClose = () => {
    setSyncMode('live');
    onClose();
  };

  const handleSyncClick = () => {
    if (startDate && endDate) {
      onSync(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd'),
        mockDataEnabled
          ? {
              saveMockData: syncMode === 'capture',
              dataSource: isReplay ? 'local' : undefined,
            }
          : undefined
      );
      handleClose();
    }
  };

  const setPreset = (days: number) => {
    setStartDate(subDays(new Date(), days));
    setEndDate(new Date());
  };

  const getProviderName = (type: string) => {
    switch (type.toLowerCase()) {
      case 'strava':
        return 'Strava';
      case 'fitbit':
        return 'Fitbit';
      case 'oura':
        return 'Oura';
      case 'polar':
        return 'Polar';
      case 'garmin':
        return 'Garmin';
      case 'hevy':
        return 'Hevy';
      case 'liftosaur':
        return 'Liftosaur';
      case 'withings':
        return 'Withings';
      case 'googlehealth':
        return 'Google Health';
      case 'coros_mcp':
        return 'COROS';
      default:
        return type;
    }
  };

  const providerName = getProviderName(providerType);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            {t('syncRangeDialog.title', 'Sync {{provider}} Data', {
              provider: providerName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'syncRangeDialog.description',
              'Choose the date range you would like to synchronize from {{provider}}.',
              { provider: providerName }
            )}
          </DialogDescription>
        </DialogHeader>

        {providerType === 'polar' && (
          <Alert variant="default" className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-700">
              {t(
                'syncRangeDialog.polarWarning',
                'Note: Polar only allows syncing data recorded after you connected your account to SparkyFitness.'
              )}
            </AlertDescription>
          </Alert>
        )}

        {providerType === 'coros_mcp' && (
          <Alert variant="default" className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-700">
              {t(
                'syncRangeDialog.corosWarning',
                'Note: COROS MCP supports syncing activities and workouts within a 90-day window per request. Daily FIT file downloads are subject to rate limits.'
              )}
            </AlertDescription>
          </Alert>
        )}

        <Alert
          variant="default"
          className="mt-2 bg-yellow-50 border-yellow-200"
        >
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-[10px] leading-tight text-yellow-700">
            {t(
              'syncRangeDialog.timeoutWarning',
              'For large date ranges, the browser may time out, but the server will continue syncing in the background.'
            )}
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 py-4">
          {/* Presets */}
          <div
            className="flex flex-wrap gap-2"
            style={
              isReplay ? { opacity: 0.5, pointerEvents: 'none' } : undefined
            }
            aria-disabled={isReplay}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreset(7)}
              className="text-xs"
            >
              {t('syncRangeDialog.last7Days', 'Last 7 Days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreset(30)}
              className="text-xs"
            >
              {t('syncRangeDialog.last30Days', 'Last 30 Days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreset(90)}
              className="text-xs"
            >
              {t('syncRangeDialog.last90Days', 'Last 90 Days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreset(180)}
              className="text-xs"
            >
              {t('syncRangeDialog.last180Days', 'Last 180 Days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreset(365)}
              className="text-xs"
            >
              {t('syncRangeDialog.last365Days', 'Last 365 Days')}
            </Button>
          </div>

          <div
            className="grid grid-cols-2 gap-4"
            style={
              isReplay ? { opacity: 0.5, pointerEvents: 'none' } : undefined
            }
            aria-disabled={isReplay}
          >
            {/* Start Date */}
            <div className="grid gap-2">
              <Label htmlFor="startDate" className="text-xs font-semibold">
                {t('syncRangeDialog.startDate', 'Start Date')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      <span>{format(startDate, 'PP')}</span>
                    ) : (
                      <span>{t('common.pickADate', 'Pick a date')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) =>
                      date > new Date() || (endDate ? date > endDate : false)
                    }
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="grid gap-2">
              <Label htmlFor="endDate" className="text-xs font-semibold">
                {t('syncRangeDialog.endDate', 'End Date')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      <span>{format(endDate, 'PP')}</span>
                    ) : (
                      <span>{t('common.pickADate', 'Pick a date')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) =>
                      date > new Date() ||
                      (startDate ? date < startDate : false)
                    }
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {mockDataEnabled && (
          <div className="grid gap-3 rounded-md border border-dashed p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('syncRangeDialog.troubleshooting', 'Troubleshooting')}
            </p>
            {(
              [
                [
                  'live',
                  t(
                    'syncRangeDialog.modeLive',
                    'Sync normally from {{provider}}',
                    { provider: providerName }
                  ),
                ],
                [
                  'capture',
                  t(
                    'syncRangeDialog.modeCapture',
                    "Sync from {{provider}} and save this sync's raw responses to a file on the server",
                    { provider: providerName }
                  ),
                ],
                [
                  'replay',
                  t(
                    'syncRangeDialog.modeReplay',
                    'Sync from the previously saved file instead of {{provider}}',
                    { provider: providerName }
                  ),
                ],
              ] as const
            ).map(([mode, label]) => (
              <label
                key={mode}
                className="flex items-start gap-2 text-xs cursor-pointer"
              >
                <input
                  type="radio"
                  name="sync-mode"
                  className="mt-0.5"
                  checked={syncMode === mode}
                  onChange={() => setSyncMode(mode)}
                />
                <span>{label}</span>
              </label>
            ))}
            {isReplay && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'syncRangeDialog.replayIgnoresDates',
                  'The date range does not apply here — the saved file is replayed in full, covering whatever period it was captured over.'
                )}
              </p>
            )}
            {syncMode === 'capture' && (
              <p className="text-xs text-muted-foreground italic">
                {t(
                  'syncRangeDialog.capturePrivacyNote',
                  'Warning: Raw diagnostic capture files contain your personal activity, GPS track, and health data. Review and redact any sensitive information before sharing.'
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSyncClick} disabled={!startDate || !endDate}>
            {t('syncRangeDialog.syncNow', 'Start Sync')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncRangeDialog;
