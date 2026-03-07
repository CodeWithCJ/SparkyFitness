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

interface SyncRangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (startDate: string, endDate: string) => void;
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

  const handleSyncClick = () => {
    if (startDate && endDate) {
      onSync(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
      onClose();
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
      case 'polar':
        return 'Polar';
      case 'garmin':
        return 'Garmin';
      case 'hevy':
        return 'Hevy';
      case 'withings':
        return 'Withings';
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
          <div className="flex flex-wrap gap-2">
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
                      format(startDate, 'PP')
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
                      format(endDate, 'PP')
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
          <Button onClick={handleSyncClick} disabled={!startDate || !endDate}>
            {t('syncRangeDialog.syncNow', 'Start Sync')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncRangeDialog;
