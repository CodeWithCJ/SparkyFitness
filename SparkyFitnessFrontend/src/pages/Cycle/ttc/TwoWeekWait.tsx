import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, HeartHandshake, Sparkles, Plus } from 'lucide-react';
import { useCreateTestEntry, useTestEntriesQuery } from '@/hooks/useCycle';
import { addDays, todayInZone } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';

interface TwoWeekWaitProps {
  dpo: number;
  currentCycleStart: string | null;
}

export default function TwoWeekWait({
  dpo,
  currentCycleStart,
}: TwoWeekWaitProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);

  const startDate = currentCycleStart || addDays(today, -30);
  const endDate = addDays(today, 14);
  const { data: testEntries } = useTestEntriesQuery(startDate, endDate);
  const createMutation = useCreateTestEntry();

  const isPositiveLogged = useMemo(() => {
    if (!testEntries) return false;
    return testEntries.some(
      (t) => t.test_type === 'hpt' && t.result === 'positive'
    );
  }, [testEntries]);

  const handleQuickLogHpt = async (result: string) => {
    try {
      await createMutation.mutateAsync({
        entry_date: today,
        test_type: 'hpt',
        result,
        notes: null,
      });
      toast({
        title: t('cycle.ttc.testLogged', 'Test Logged'),
        description: t(
          'cycle.ttc.testLoggedDesc',
          'Successfully logged your test result.'
        ),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartPregnancyMode = () => {
    toast({
      title: t('cycle.ttc.pregnancyModeStubTitle', 'Pregnancy Mode'),
      description: t(
        'cycle.ttc.pregnancyModeStubDesc',
        'Pregnancy Mode is coming soon in Phase 4! We will transition your stats then.'
      ),
    });
  };

  const isImplantationWindow = dpo >= 6 && dpo <= 12;
  const daysUntilTesting = 10 - dpo;

  // Congratulations State
  if (isPositiveLogged) {
    return (
      <Card className="overflow-hidden border-rose-500/30 shadow-md bg-gradient-to-br from-rose-50/50 via-card to-rose-100/10 dark:from-rose-950/20 dark:to-rose-900/5">
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center animate-bounce">
            <Sparkles className="h-7 w-7 text-rose-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">
              {t('cycle.ttc.congratsTitle', 'Congratulations! 🎉')}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t(
                'cycle.ttc.congratsDesc',
                'You have logged a positive pregnancy test in this cycle. We wish you a healthy and happy pregnancy!'
              )}
            </p>
          </div>
          <Button
            type="button"
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold shadow-md px-6"
            onClick={handleStartPregnancyMode}
          >
            {t('cycle.ttc.startPregnancyMode', 'Start Pregnancy Mode')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-indigo-500/20 shadow-md bg-gradient-to-br from-card to-indigo-50/10 dark:to-indigo-950/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-indigo-500" />
          {t('cycle.ttc.twoWeekWaitTitle', 'Two-Week Wait (TWW)')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* DPO Header */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tight tabular-nums">
            {dpo}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            {t('cycle.ttc.dpo', 'Days Past Ovulation (DPO)')}
          </span>
        </div>

        {/* Implantation Window Alert */}
        {isImplantationWindow && (
          <div className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/30 p-2.5 text-xs text-indigo-900 dark:border-indigo-950/30 dark:bg-indigo-950/10 dark:text-indigo-300">
            <HeartHandshake className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <div>
              <p className="font-semibold">
                {t('cycle.ttc.implantationTitle', 'Implantation Window')}
              </p>
              <p className="mt-0.5 opacity-90">
                {t(
                  'cycle.ttc.implantationDesc',
                  'A fertilized egg typically implants 6–12 days after ovulation. During this window, it is common to feel no symptoms at all, or mild cramping and spotting. These can feel identical to regular PMS.'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Guidance and test advice */}
        <p className="text-sm text-foreground/90">
          {daysUntilTesting > 0
            ? t(
                'cycle.ttc.testCountdown',
                'Testing is most accurate starting at 10 DPO (in {{n}} days). Try to wait to avoid disappointment or faint line confusion.',
                { n: daysUntilTesting }
              )
            : t(
                'cycle.ttc.testReady',
                'You have reached {{dpo}} DPO! A pregnancy test logged now is highly accurate. Use first morning urine for the best concentration.',
                { dpo }
              )}
        </p>

        {/* Quick Log Test CTA */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleQuickLogHpt('positive')}
            className="text-xs bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-300"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('cycle.ttc.logPositiveHpt', 'Log Positive HPT')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleQuickLogHpt('negative')}
            className="text-xs bg-muted text-muted-foreground"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('cycle.ttc.logNegativeHpt', 'Log Negative HPT')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
