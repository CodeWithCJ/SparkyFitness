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
import { addDays, format, subDays } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  formatIntegrationDate,
  isSyncRangeWithinLimit,
} from '@/utils/integrationSync';

interface SyncRangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (startDate: string, endDate: string) => void;
  providerType: string;
  maxDays?: number;
}

const SyncRangeDialog = ({
  isOpen,
  onClose,
  onSync,
  providerType,
  maxDays,
}: SyncRangeDialogProps) => {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState<Date | undefined>(
    subDays(new Date(), 6)
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const handleSyncClick = () => {
    if (startDate && endDate && !rangeTooLong) {
      onSync(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
      onClose();
    }
  };

  const setPreset = (days: number) => {
    setStartDate(subDays(new Date(), days - 1));
    setEndDate(new Date());
  };

  const rangeTooLong = Boolean(
    maxDays &&
    startDate &&
    endDate &&
    !isSyncRangeWithinLimit(startDate, endDate, maxDays)
  );

  const getProviderName = (type: string) => {
    switch (type.toLowerCase()) {
      case 'strava':
        return 'Strava';
      case 'fitbit':
        return 'Fitbit';
      case 'polar':
        return 'Polar';
      case 'garmin':
        return 'Garmin';
      case 'hevy':
        return 'Hevy';
      case 'withings':
        return 'Withings';
      case 'googlehealth':
        return 'Google Health';
      case 'huaweihealth':
        return 'HUAWEI Health';
      default:
        return type;
    }
  };

  const providerName = getProviderName(providerType);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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

        {providerType === 'huaweihealth' ? (
          <Alert variant="default" className="mt-2 border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs leading-relaxed text-blue-700">
              {t(
                'syncRangeDialog.huaweiLimit',
                'Huawei accepts up to 31 calendar days per manual sync. The most recent 7 days are selected by default.'
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert
            variant="default"
            className="mt-2 border-yellow-200 bg-yellow-50"
          >
            <Info className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-[10px] leading-tight text-yellow-700">
              {t(
                'syncRangeDialog.timeoutWarning',
                'For large date ranges, the browser may time out, but the server will continue syncing in the background.'
              )}
            </AlertDescription>
          </Alert>
        )}

        {rangeTooLong && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t(
                'syncRangeDialog.rangeTooLong',
                'Choose a range of {{maxDays}} days or fewer.',
                { maxDays }
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 py-4">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {[
              [7, t('syncRangeDialog.last7Days', 'Last 7 Days')],
              [30, t('syncRangeDialog.last30Days', 'Last 30 Days')],
              [90, t('syncRangeDialog.last90Days', 'Last 90 Days')],
              [180, t('syncRangeDialog.last180Days', 'Last 180 Days')],
              [365, t('syncRangeDialog.last365Days', 'Last 365 Days')],
            ]
              .filter(([days]) => !maxDays || Number(days) <= maxDays)
              .map(([days, label]) => (
                <Button
                  key={String(days)}
                  variant="outline"
                  size="sm"
                  onClick={() => setPreset(Number(days))}
                  className="text-xs"
                >
                  {label}
                </Button>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                      formatIntegrationDate(startDate, i18n.language)
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
                      date > new Date() ||
                      (endDate ? date > endDate : false) ||
                      Boolean(
                        maxDays &&
                        endDate &&
                        date < subDays(endDate, maxDays - 1)
                      )
                    }
                    initialFocus
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
                      formatIntegrationDate(endDate, i18n.language)
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
                      (startDate ? date < startDate : false) ||
                      Boolean(
                        maxDays &&
                        startDate &&
                        date > addDays(startDate, maxDays - 1)
                      )
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSyncClick}
            disabled={!startDate || !endDate || rangeTooLong}
          >
            {t('syncRangeDialog.syncNow', 'Start Sync')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncRangeDialog;
