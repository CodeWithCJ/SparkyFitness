import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
  type CycleMode,
} from '@workspace/shared';
import {
  useCycleSettings,
  useUpsertCycleSettingsMutation,
  useCycleExportMutation,
} from '@/hooks/useCycle';
import { AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Heart, Save, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function CycleSettings() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useCycleSettings();
  const upsert = useUpsertCycleSettingsMutation();
  const exportMutation = useCycleExportMutation();

  // Local draft states
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<CycleMode>('standard');
  const [avgCycleLength, setAvgCycleLength] = useState<number | ''>('');
  const [avgPeriodLength, setAvgPeriodLength] = useState<number | ''>('');
  const [birthControlMethod, setBirthControlMethod] = useState<string>('none');
  const [conditions, setConditions] = useState<string[]>([]);
  const [showFertileWindow, setShowFertileWindow] = useState(true);
  const [terminology, setTerminology] = useState<'default' | 'neutral'>(
    'default'
  );
  const [discreetMode, setDiscreetMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sync state from server settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setMode(settings.mode);
      setAvgCycleLength(settings.avg_cycle_length_override ?? '');
      setAvgPeriodLength(settings.avg_period_length_override ?? '');
      setBirthControlMethod(settings.birth_control_method);
      setConditions(settings.conditions ?? []);
      setShowFertileWindow(settings.show_fertile_window);
      setTerminology(settings.terminology);
      setDiscreetMode(settings.discreet_mode ?? false);
    }
  }, [settings]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cycle-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      toast({
        variant: 'destructive',
        title: t('settings.cycle.errorTitle', 'Error'),
        description: t('settings.cycle.exportError', 'Could not export data.'),
      });
    } finally {
      setExporting(false);
    }
  };

  const toggleCondition = (val: string) => {
    setConditions((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({
        enabled,
        mode,
        avg_cycle_length_override:
          avgCycleLength === '' ? null : Number(avgCycleLength),
        avg_period_length_override:
          avgPeriodLength === '' ? null : Number(avgPeriodLength),
        luteal_phase_length: 14,
        birth_control_method: birthControlMethod,
        conditions,
        show_fertile_window: showFertileWindow,
        terminology,
        discreet_mode: discreetMode,
      });
      toast({
        title: t('settings.cycle.successTitle', 'Success'),
        description: t('settings.cycle.successDesc', 'Cycle settings updated.'),
      });
    } catch (err) {
      console.error('Failed to update cycle settings:', err);
      toast({
        variant: 'destructive',
        title: t('settings.cycle.errorTitle', 'Error'),
        description: t(
          'settings.cycle.errorDesc',
          'Could not save cycle settings. Please try again.'
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetOnboarding = async () => {
    if (
      !confirm(
        t(
          'settings.cycle.resetConfirm',
          'Are you sure you want to reset your cycle tracking profile? This will let you re-run the onboarding configuration from scratch. Your logged cycle history will not be deleted.'
        )
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await upsert.mutateAsync({
        reset_onboarding: true,
      });
      toast({
        title: t('settings.cycle.resetSuccessTitle', 'Profile Reset'),
        description: t(
          'settings.cycle.resetSuccessDesc',
          'Onboarding has been reset. Please visit the Cycle Hub tab to start onboarding.'
        ),
      });
    } catch (err) {
      console.error('Failed to reset onboarding:', err);
      toast({
        variant: 'destructive',
        title: t('settings.cycle.errorTitle', 'Error'),
        description: t(
          'settings.cycle.resetError',
          'Could not reset onboarding. Please try again.'
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        <div className="h-6 bg-muted/40 w-1/3 rounded" />
        <div className="h-10 bg-muted/40 rounded" />
      </div>
    );
  }

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.cycle.description',
          'Manage reproductive health, menstruation cycles, and pregnancy tracking'
        )}
      >
        <Heart className="h-5 w-5 text-primary fill-primary/10" />
        {t('settings.cycle.title', 'Cycle & Pregnancy')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {/* Enable Switch */}
        <div className="flex items-center justify-between py-2">
          <div className="space-y-0.5">
            <Label
              htmlFor="cycle-tracking-enabled"
              className="text-sm font-semibold"
            >
              {t(
                'settings.cycle.enableLabel',
                'Enable Cycle & Pregnancy Tracking'
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.cycle.enableHint',
                'Toggle the reproductive health hub. Enabling reveals the sidebar navigation tab.'
              )}
            </p>
          </div>
          <Switch
            id="cycle-tracking-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="space-y-6 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tracker Mode */}
              <div>
                <Label htmlFor="cycle-mode">
                  {t('settings.cycle.mode', 'Tracker Mode')}
                </Label>
                <Select
                  value={mode}
                  onValueChange={(val) => setMode(val as CycleMode)}
                >
                  <SelectTrigger id="cycle-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">
                      {t('cycle.mode.standard', 'Standard Cycle')}
                    </SelectItem>
                    <SelectItem value="ttc">
                      {t('cycle.mode.ttc', 'Trying to Conceive (TTC)')}
                    </SelectItem>
                    <SelectItem value="pregnant">
                      {t('cycle.mode.pregnant', 'Pregnancy Tracking')}
                    </SelectItem>
                    <SelectItem value="postpartum">
                      {t('cycle.mode.postpartum', 'Postpartum')}
                    </SelectItem>
                    <SelectItem value="menopause">
                      {t('cycle.mode.menopause', 'Menopause-aware')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Birth Control Method */}
              <div>
                <Label htmlFor="settings-bc-method">
                  {t('settings.cycle.bcMethod', 'Birth Control')}
                </Label>
                <Select
                  value={birthControlMethod}
                  onValueChange={setBirthControlMethod}
                >
                  <SelectTrigger id="settings-bc-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BIRTH_CONTROL_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Terminology Selector */}
              <div>
                <Label htmlFor="settings-terminology">
                  {t('settings.cycle.terminology', 'Terminology')}
                </Label>
                <Select
                  value={terminology}
                  onValueChange={(val) =>
                    setTerminology(val as 'default' | 'neutral')
                  }
                >
                  <SelectTrigger id="settings-terminology">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {t(
                        'settings.cycle.terminologyDefault',
                        'Default (Gendered)'
                      )}
                    </SelectItem>
                    <SelectItem value="neutral">
                      {t('settings.cycle.terminologyNeutral', 'Gender Neutral')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Overrides */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="settings-avg-cycle">
                  {t(
                    'settings.cycle.avgCycleOverride',
                    'Average Cycle Length (days)'
                  )}
                </Label>
                <Input
                  id="settings-avg-cycle"
                  type="number"
                  placeholder={t(
                    'settings.cycle.learned',
                    'Calculated from logs'
                  )}
                  value={avgCycleLength}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAvgCycleLength(
                      v === ''
                        ? ''
                        : Math.max(15, Math.min(90, parseInt(v, 10) || 28))
                    );
                  }}
                />
              </div>

              <div>
                <Label htmlFor="settings-avg-period">
                  {t(
                    'settings.cycle.avgPeriodOverride',
                    'Average Period Length (days)'
                  )}
                </Label>
                <Input
                  id="settings-avg-period"
                  type="number"
                  placeholder={t(
                    'settings.cycle.learned',
                    'Calculated from logs'
                  )}
                  value={avgPeriodLength}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAvgPeriodLength(
                      v === ''
                        ? ''
                        : Math.max(1, Math.min(15, parseInt(v, 10) || 5))
                    );
                  }}
                />
              </div>

              <div>
                <Label htmlFor="settings-luteal">
                  {t(
                    'settings.cycle.lutealLength',
                    'Luteal Phase Length (days)'
                  )}
                </Label>
                <Input id="settings-luteal" type="number" value={14} disabled />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {t(
                    'settings.cycle.lutealConstHelp',
                    'Luteal phase is locked at 14 days. The follicular phase automatically adjusts to your cycle length.'
                  )}
                </p>
              </div>
            </div>

            {/* Fertile Window Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label
                  htmlFor="show-fertile-window"
                  className="text-sm font-semibold"
                >
                  {t(
                    'settings.cycle.showFertileWindow',
                    'Show Fertile Window Predictions'
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'settings.cycle.showFertileWindowHint',
                    'Show or hide fertile days and ovulation predictions on dashboards/calendars.'
                  )}
                </p>
              </div>
              <Switch
                id="show-fertile-window"
                checked={showFertileWindow}
                onCheckedChange={setShowFertileWindow}
              />
            </div>

            <Separator />

            {/* Conditions Multi-select */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {t('settings.cycle.conditions', 'Health Conditions')}
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CYCLE_CONDITIONS.map((cond) => (
                  <div
                    key={cond.value}
                    onClick={() => toggleCondition(cond.value)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition',
                      conditions.includes(cond.value)
                        ? 'border-primary bg-primary/5 font-semibold text-foreground'
                        : 'border-muted bg-transparent text-muted-foreground hover:bg-muted/30'
                    )}
                  >
                    <Checkbox
                      checked={conditions.includes(cond.value)}
                      onCheckedChange={() => toggleCondition(cond.value)}
                      className="pointer-events-none"
                    />
                    <span>{cond.displayName}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Discreet Mode Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label
                  htmlFor="discreet-mode"
                  className="text-sm font-semibold"
                >
                  {t('settings.cycle.discreetMode', 'Discreet mode')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'settings.cycle.discreetModeHint',
                    'Use a neutral “Wellness” label and icon in the navigation.'
                  )}
                </p>
              </div>
              <Switch
                id="discreet-mode"
                checked={discreetMode}
                onCheckedChange={setDiscreetMode}
              />
            </div>

            <Separator />

            {/* Data Export */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">
                  {t('settings.cycle.exportData', 'Export your data')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'settings.cycle.exportHint',
                    'Download all your cycle data as JSON. It never leaves your server.'
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting
                  ? t('settings.cycle.exporting', 'Exporting…')
                  : t('settings.cycle.export', 'Export')}
              </Button>
            </div>
          </div>
        )}

        <div className="pt-2 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving
              ? t('common.saving', 'Saving...')
              : t('settings.preferences.savePreferences', 'Save Preferences')}
          </Button>

          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={handleResetOnboarding}
            disabled={saving}
          >
            {t('settings.cycle.resetOnboarding', 'Reset & Re-run Onboarding')}
          </Button>
        </div>
      </AccordionContent>
    </>
  );
}
