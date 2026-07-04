import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  todayInZone,
  addDays,
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useUpsertCycleSettingsMutation,
  useUpsertDailyLogMutation,
} from '@/hooks/useCycle';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Heart, Calendar, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function CycleOnboarding() {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);

  const upsertSettings = useUpsertCycleSettingsMutation();
  const upsertDailyLog = useUpsertDailyLogMutation();

  const [step, setStep] = useState(1);

  // State for onboarding wizard
  const [mode, setMode] = useState<'standard' | 'ttc' | 'pregnant'>('standard');
  const [lastPeriodStart, setLastPeriodStart] = useState<string>(today);
  const [avgCycleLength, setAvgCycleLength] = useState<number>(28);
  const [avgPeriodLength, setAvgPeriodLength] = useState<number>(5);
  const [birthControlMethod, setBirthControlMethod] = useState<string>('none');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const toggleCondition = (val: string) => {
    setSelectedConditions((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // 1. Save settings
      await upsertSettings.mutateAsync({
        enabled: true,
        mode,
        avg_cycle_length_override: avgCycleLength,
        avg_period_length_override: avgPeriodLength,
        birth_control_method: birthControlMethod,
        conditions: selectedConditions,
        mark_onboarded: true,
      });

      // 2. Seed daily log history for the last period length.
      // Set the first day to medium and subsequent days to light flow.
      const seedPromises = [];
      for (let i = 0; i < avgPeriodLength; i++) {
        const dateStr = addDays(lastPeriodStart, i);
        const flow_level = i === 0 ? 'medium' : 'light';
        seedPromises.push(
          upsertDailyLog.mutateAsync({
            date: dateStr,
            body: { flow_level },
          })
        );
      }

      await Promise.all(seedPromises);

      toast({
        title: t('cycle.onboarding.successTitle', 'Welcome to Cycle Tracking!'),
        description: t(
          'cycle.onboarding.successDesc',
          'Your cycle profile has been initialized successfully.'
        ),
      });
    } catch (err) {
      console.error('Onboarding setup failed:', err);
      toast({
        variant: 'destructive',
        title: t('cycle.onboarding.errorTitle', 'Setup failed'),
        description: t(
          'cycle.onboarding.errorDesc',
          'Could not save your preferences. Please try again.'
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4 max-w-lg mx-auto">
      <Card className="w-full shadow-lg border">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Heart className="h-5 w-5 fill-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('cycle.onboarding.stepIndicator', 'Step {{step}} of 4', {
                step,
              })}
            </span>
          </div>
          <CardTitle className="text-xl font-bold">
            {step === 1 &&
              t('cycle.onboarding.step1Title', 'Choose Your Tracking Goal')}
            {step === 2 &&
              t('cycle.onboarding.step2Title', 'Cycle Dates & Lengths')}
            {step === 3 &&
              t('cycle.onboarding.step3Title', 'Your Health Profile')}
            {step === 4 &&
              t('cycle.onboarding.step4Title', 'Disclaimer & Confirmation')}
          </CardTitle>
          <CardDescription>
            {step === 1 &&
              t(
                'cycle.onboarding.step1Desc',
                'Select the primary mode for your tracker.'
              )}
            {step === 2 &&
              t(
                'cycle.onboarding.step2Desc',
                'Tell us about your typical cycle properties.'
              )}
            {step === 3 &&
              t(
                'cycle.onboarding.step3Desc',
                'Optional information to customize predictions (skippable).'
              )}
            {step === 4 &&
              t(
                'cycle.onboarding.step4Desc',
                'Read and acknowledge before finalizing.'
              )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 py-4 min-h-[220px] flex flex-col justify-center">
          {/* STEP 1: Mode Selection */}
          {step === 1 && (
            <div className="space-y-3">
              <div
                onClick={() => setMode('standard')}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition hover:bg-muted/30',
                  mode === 'standard'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/40'
                )}
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm">
                    {t('cycle.mode.standard', 'Standard Cycle Tracking')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'cycle.mode.standardDesc',
                      'Track periods, symptoms, and predict future cycle phases.'
                    )}
                  </p>
                </div>
                <Heart
                  className={cn(
                    'h-5 w-5',
                    mode === 'standard'
                      ? 'text-primary fill-primary'
                      : 'text-muted-foreground'
                  )}
                />
              </div>

              <div
                onClick={() => setMode('ttc')}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition hover:bg-muted/30',
                  mode === 'ttc'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/40'
                )}
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm">
                    {t('cycle.mode.ttc', 'Trying to Conceive (TTC)')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'cycle.mode.ttcDesc',
                      'Track fertile window, ovulation, and luteal phase indicators.'
                    )}
                  </p>
                </div>
                <Heart
                  className={cn(
                    'h-5 w-5',
                    mode === 'ttc'
                      ? 'text-primary fill-primary'
                      : 'text-muted-foreground'
                  )}
                />
              </div>

              <div
                onClick={() => setMode('pregnant')}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition hover:bg-muted/30',
                  mode === 'pregnant'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/40'
                )}
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm">
                    {t('cycle.mode.pregnant', 'Pregnancy Tracking')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'cycle.mode.pregnantDesc',
                      'Track fetal development milestones, contraction timers, and prenatal care.'
                    )}
                  </p>
                </div>
                <Heart
                  className={cn(
                    'h-5 w-5',
                    mode === 'pregnant'
                      ? 'text-primary fill-primary'
                      : 'text-muted-foreground'
                  )}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Last Period Date & Overrides */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="last-period-date"
                  className="text-sm font-medium"
                >
                  {t(
                    'cycle.onboarding.lastPeriodStart',
                    'When did your last period start?'
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    id="last-period-date"
                    type="date"
                    max={today}
                    value={lastPeriodStart}
                    onChange={(e) => setLastPeriodStart(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cycle-length" className="text-sm font-medium">
                    {t(
                      'cycle.onboarding.avgCycleLength',
                      'Typical cycle (days)'
                    )}
                  </Label>
                  <Input
                    id="cycle-length"
                    type="number"
                    min={15}
                    max={90}
                    value={avgCycleLength}
                    onChange={(e) =>
                      setAvgCycleLength(
                        Math.max(
                          15,
                          Math.min(90, parseInt(e.target.value, 10) || 28)
                        )
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="period-length"
                    className="text-sm font-medium"
                  >
                    {t(
                      'cycle.onboarding.avgPeriodLength',
                      'Typical period (days)'
                    )}
                  </Label>
                  <Input
                    id="period-length"
                    type="number"
                    min={1}
                    max={15}
                    value={avgPeriodLength}
                    onChange={(e) =>
                      setAvgPeriodLength(
                        Math.max(
                          1,
                          Math.min(15, parseInt(e.target.value, 10) || 5)
                        )
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Health Profile */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bc-method" className="text-sm font-medium">
                  {t('cycle.onboarding.bcMethod', 'Birth control method')}
                </Label>
                <Select
                  value={birthControlMethod}
                  onValueChange={setBirthControlMethod}
                >
                  <SelectTrigger id="bc-method">
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
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t(
                    'cycle.onboarding.bcHint',
                    'Hormonal birth control will suppress fertility windows, showing bleed predictions only.'
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t(
                    'cycle.onboarding.conditions',
                    'Known conditions (Optional)'
                  )}
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {CYCLE_CONDITIONS.map((cond) => (
                    <div
                      key={cond.value}
                      onClick={() => toggleCondition(cond.value)}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition',
                        selectedConditions.includes(cond.value)
                          ? 'border-primary bg-primary/5 font-semibold text-foreground'
                          : 'border-muted bg-transparent text-muted-foreground hover:bg-muted/30'
                      )}
                    >
                      <Checkbox
                        checked={selectedConditions.includes(cond.value)}
                        onCheckedChange={() => toggleCondition(cond.value)}
                        className="pointer-events-none"
                      />
                      <span>{cond.displayName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Disclaimer & Complete */}
          {step === 4 && (
            <div className="space-y-3 bg-destructive/5 dark:bg-destructive/10 p-4 rounded-xl border border-destructive/20">
              <div className="flex gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-foreground">
                  <p className="font-semibold text-sm text-destructive">
                    {t('cycle.disclaimer.title', 'Important Health Disclaimer')}
                  </p>
                  <p className="leading-relaxed">
                    {t(
                      'cycle.disclaimer.text1',
                      'This cycle tracking feature is intended for educational, fitness, and log keeping purposes only. It is not designed or intended to be used as a primary method of contraception or family planning.'
                    )}
                  </p>
                  <p className="leading-relaxed">
                    {t(
                      'cycle.disclaimer.text2',
                      'Predictions are estimates and will vary based on individual consistency, health conditions, or cycle irregularity. Always consult a healthcare provider for medical concerns.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 1 || loading}
          >
            {t('common.back', 'Back')}
          </Button>

          {step < 4 ? (
            <Button onClick={handleNext}>{t('common.next', 'Next')}</Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={loading}
              className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              {loading
                ? t('common.saving', 'Saving…')
                : t('cycle.onboarding.complete', 'Agree & Complete')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
