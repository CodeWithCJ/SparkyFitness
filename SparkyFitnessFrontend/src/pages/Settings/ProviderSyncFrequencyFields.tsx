import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { ExternalDataProvider } from './ExternalProviderSettings';

interface ProviderSyncFrequencyFieldsProps {
  providerType: string | undefined;
  frequency: ExternalDataProvider['sync_frequency'];
  onFrequencyChange: (
    value: NonNullable<ExternalDataProvider['sync_frequency']>
  ) => void;
  idPrefix: string;
}

const SCHEDULED_PROVIDER_TYPES = new Set([
  'withings',
  'garmin',
  'fitbit',
  'oura',
  'googlehealth',
  'strava',
  'polar',
  'coros_mcp',
  'hevy',
  'liftosaur',
  'intervals',
]);

export function ProviderSyncFrequencyFields({
  providerType,
  frequency,
  onFrequencyChange,
  idPrefix,
}: ProviderSyncFrequencyFieldsProps) {
  const { t } = useTranslation();
  if (!providerType || !SCHEDULED_PROVIDER_TYPES.has(providerType)) return null;

  const isHevy = providerType === 'hevy';
  const fieldId = `${idPrefix}_sync_frequency`;
  const helpId = `${fieldId}_help`;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>
        {t('settings.editProviderForm.syncFrequency', 'Sync Frequency')}
      </Label>
      <Select
        value={frequency || 'manual'}
        onValueChange={(value) => {
          if (value === 'manual' || value === 'hourly' || value === 'daily') {
            onFrequencyChange(value);
          }
        }}
      >
        <SelectTrigger
          id={fieldId}
          aria-describedby={isHevy ? helpId : undefined}
        >
          <SelectValue
            placeholder={t(
              'settings.editProviderForm.selectSyncFrequency',
              'Select sync frequency'
            )}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">
            {t('settings.editProviderForm.manual', 'Manual')}
          </SelectItem>
          <SelectItem value="hourly">
            {t('settings.editProviderForm.hourly', 'Hourly')}
          </SelectItem>
          <SelectItem value="daily">
            {isHevy
              ? t('settings.editProviderForm.hevyDaily', 'Daily at 21:00')
              : t('settings.editProviderForm.daily', 'Daily')}
          </SelectItem>
        </SelectContent>
      </Select>
      {isHevy && (
        <p id={helpId} className="text-sm text-muted-foreground">
          {t(
            'settings.editProviderForm.hevyDailyHelp',
            'Daily Hevy sync runs at or after 21:00 in your SparkyFitness timezone. Only a successful sync at or after 21:00 counts for that evening. Automatic sync requires an active provider.'
          )}
        </p>
      )}
    </div>
  );
}
