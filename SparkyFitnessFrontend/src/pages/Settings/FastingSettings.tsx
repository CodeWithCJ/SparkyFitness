import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, Save, Sparkles, Bell } from 'lucide-react';
import { AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FASTING_PRESETS } from '@/constants/fastingPresets';
import {
  useFastingPreferences,
  useUpdateFastingPreferencesMutation,
} from '@/hooks/Fasting/useFasting';
import { toast } from '@/hooks/use-toast';
import type { UserFastingPreferences } from '@/types/fasting';

interface FastingSettingsFormProps {
  preferences: UserFastingPreferences;
}

const FastingSettingsForm = ({ preferences }: FastingSettingsFormProps) => {
  const { t } = useTranslation();
  const updateMutation = useUpdateFastingPreferencesMutation();

  const [autoCalculate, setAutoCalculate] = useState(
    preferences.auto_calculate
  );
  const [defaultProtocol, setDefaultProtocol] = useState<string>(
    preferences.default_protocol || '16:8'
  );
  const [targetFastingHours, setTargetFastingHours] = useState(
    preferences.target_fasting_hours ?? 16
  );
  const [targetEatingHours, setTargetEatingHours] = useState(
    preferences.target_eating_hours ?? 8
  );
  const [calorieThreshold, setCalorieThreshold] = useState(
    preferences.calorie_threshold ?? 50
  );
  const [preEndAlertMinutes, setPreEndAlertMinutes] = useState(
    preferences.pre_end_alert_minutes ?? 30
  );
  const [eatingWindowAlert, setEatingWindowAlert] = useState(
    preferences.eating_window_alert ?? true
  );

  const handleProtocolSelect = (protocolVal: string) => {
    setDefaultProtocol(protocolVal);
    const preset = FASTING_PRESETS.find((p) => p.name === protocolVal);
    if (preset) {
      setTargetFastingHours(preset.fastingHours);
      setTargetEatingHours(preset.eatingHours);
    }
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        auto_calculate: autoCalculate,
        default_protocol: defaultProtocol,
        target_fasting_hours: targetFastingHours,
        target_eating_hours: targetEatingHours,
        calorie_threshold: calorieThreshold,
        pre_end_alert_minutes: preEndAlertMinutes,
        eating_window_alert: eatingWindowAlert,
      });
      toast({
        title: t('settings.preferences.successTitle', 'Success'),
        description: t(
          'fasting.settings.saved',
          'Fasting preferences updated successfully.'
        ),
      });
    } catch (error) {
      console.error('Failed to update fasting preferences:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'fasting.settings.error',
          'Failed to save fasting preferences.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Auto Calculation Switch */}
      <div className="flex items-start justify-between p-4 rounded-lg border bg-secondary/10">
        <div className="space-y-1 pr-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <Label
              htmlFor="auto-calculate-fasting"
              className="font-medium text-base cursor-pointer"
            >
              {t(
                'fasting.settings.autoCalculate',
                'Auto-Calculate Fasting from Meals'
              )}
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'fasting.settings.autoCalculateHint',
              'When enabled, Sparky automatically detects when your last meal ended and computes your active fasting window and daily history without needing manual start/stop buttons.'
            )}
          </p>
        </div>
        <Switch
          id="auto-calculate-fasting"
          checked={autoCalculate}
          onCheckedChange={setAutoCalculate}
        />
      </div>

      {/* Protocol & Target Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default-protocol">
            {t('fasting.settings.protocol', 'Default Fasting Protocol')}
          </Label>
          <Select value={defaultProtocol} onValueChange={handleProtocolSelect}>
            <SelectTrigger id="default-protocol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FASTING_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {t(
                    'settings.fastingSettings.hFastHEating',
                    '{{name}} ({{fastingHours}}h fast / {{eatingHours}}h eating)',
                    {
                      name: p.name,
                      fastingHours: p.fastingHours,
                      eatingHours: p.eatingHours,
                    }
                  )}
                </SelectItem>
              ))}
              <SelectItem value="Custom">
                {t('fasting.settings.customProtocol', 'Custom Hours')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {defaultProtocol === 'Custom'
              ? t(
                  'fasting.settings.customProtocolDesc',
                  'Specify your desired continuous fasting hours.'
                )
              : FASTING_PRESETS.find((p) => p.name === defaultProtocol)
                  ?.description}
          </p>
        </div>

        {defaultProtocol === 'Custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-fasting-hours">
                {t('fasting.settings.targetHours', 'Target Fasting Hours')}
              </Label>
              <Input
                id="target-fasting-hours"
                type="number"
                min={1}
                max={168}
                value={targetFastingHours}
                onChange={(e) => setTargetFastingHours(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'fasting.settings.targetHoursDesc',
                  'Goal duration in hours before fasting completion.'
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-eating-hours">
                {t('fasting.settings.targetEatingHours', 'Target Eating Hours')}
              </Label>
              <Input
                id="target-eating-hours"
                type="number"
                min={0}
                max={24}
                value={targetEatingHours}
                onChange={(e) => setTargetEatingHours(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'fasting.settings.targetEatingHoursDesc',
                  'Duration in hours for your eating window.'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Calorie Threshold */}
        <div className="space-y-2">
          <Label htmlFor="calorie-threshold">
            {t('fasting.settings.calorieThreshold', 'Calorie Threshold (kcal)')}
          </Label>
          <Input
            id="calorie-threshold"
            type="number"
            min={0}
            max={500}
            value={calorieThreshold}
            onChange={(e) => setCalorieThreshold(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'fasting.settings.calorieThresholdHint',
              'Snacks or drinks below this value (e.g. black coffee, water, electrolytes) will not break or restart your fast.'
            )}
          </p>
        </div>

        {/* Pre-End Alert Minutes */}
        <div className="space-y-2">
          <Label htmlFor="pre-end-alert-minutes">
            {t('fasting.settings.preEndAlert', 'Pre-Goal Warning (minutes)')}
          </Label>
          <Input
            id="pre-end-alert-minutes"
            type="number"
            min={0}
            max={120}
            value={preEndAlertMinutes}
            onChange={(e) => setPreEndAlertMinutes(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'fasting.settings.preEndAlertHint',
              'How many minutes before reaching your target fasting goal to receive a reminder notification.'
            )}
          </p>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">
            {t('fasting.settings.notifications', 'Fasting Alerts')}
          </h4>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="space-y-0.5">
            <Label htmlFor="eating-window-alert" className="cursor-pointer">
              {t(
                'fasting.settings.eatingWindowAlert',
                'Goal & Eating Window Notifications'
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                'fasting.settings.eatingWindowAlertDesc',
                'Receive alerts when your fasting goal is reached and when your eating window opens.'
              )}
            </p>
          </div>
          <Switch
            id="eating-window-alert"
            checked={eatingWindowAlert}
            onCheckedChange={setEatingWindowAlert}
          />
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="gap-2"
      >
        <Save className="h-4 w-4" />
        {updateMutation.isPending
          ? t('common.saving', 'Saving...')
          : t('fasting.settings.save', 'Save Fasting Settings')}
      </Button>
    </div>
  );
};

export const FastingSettings = () => {
  const { t } = useTranslation();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useFastingPreferences();

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'fasting.settings.description',
          'Configure intermittent fasting protocols, auto-calculation from meals, and notifications'
        )}
      >
        <Timer className="h-5 w-5" />
        {t('fasting.settings.title', 'Intermittent Fasting')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-6">
        {isError ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2 text-sm text-destructive">
            <p>
              {t('fasting.settings.errorLoading', 'Failed to load preferences')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('fasting.settings.retry', 'Retry')}
            </Button>
          </div>
        ) : isLoading || !preferences ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            {t('common.loading', 'Loading...')}
          </div>
        ) : (
          <FastingSettingsForm
            key={preferences.id || 'fasting-form'}
            preferences={preferences}
          />
        )}
      </AccordionContent>
    </>
  );
};
