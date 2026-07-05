import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, CalendarDays, FlaskConical, Beaker } from 'lucide-react';
import {
  useCreateTestEntry,
  useDeleteTestEntry,
  useTestEntriesQuery,
} from '@/hooks/useCycle';
import { addDays, todayInZone } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface TestQuickLogProps {
  currentCycleStart: string | null;
}

const OPK_OPTIONS = [
  {
    value: 'negative',
    label: 'Negative',
    color: 'bg-muted hover:bg-muted/80 text-muted-foreground',
  },
  {
    value: 'low',
    label: 'Low LH',
    color:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20',
  },
  {
    value: 'high',
    label: 'High LH',
    color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20',
  },
  {
    value: 'peak',
    label: 'Peak Surge',
    color: 'bg-rose-500 text-white hover:bg-rose-600 border-transparent',
  },
];

const HPT_OPTIONS = [
  {
    value: 'negative',
    label: 'Negative',
    color: 'bg-muted hover:bg-muted/80 text-muted-foreground',
  },
  {
    value: 'faint',
    label: 'Faint Line',
    color:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  },
  {
    value: 'positive',
    label: 'Positive ✓',
    color:
      'bg-rose-500 text-white hover:bg-rose-600 border-transparent font-semibold',
  },
];

const BADGE_STYLES: Record<string, string> = {
  negative: 'bg-muted text-muted-foreground',
  low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  peak: 'bg-rose-500 text-white',
  faint:
    'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200',
  positive: 'bg-rose-500 text-white font-semibold',
};

export default function TestQuickLog({ currentCycleStart }: TestQuickLogProps) {
  const { t } = useTranslation();
  const { timezone, formatDateInUserTimezone } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);

  // Compute test range (cycle start to today + 14 days)
  const startDate = currentCycleStart || addDays(today, -30);
  const endDate = addDays(today, 14);

  const { data: testEntries } = useTestEntriesQuery(startDate, endDate);
  const createMutation = useCreateTestEntry();
  const deleteMutation = useDeleteTestEntry();

  const handleLogTest = async (testType: 'opk' | 'hpt', result: string) => {
    try {
      await createMutation.mutateAsync({
        entry_date: today,
        test_type: testType,
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
      toast({
        variant: 'destructive',
        title: t('common.error', 'Error'),
        description: t(
          'cycle.ttc.logTestError',
          'Failed to log your test. Please try again.'
        ),
      });
    }
  };

  const handleDeleteTest = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: t('cycle.ttc.testDeleted', 'Test Deleted'),
        description: t('cycle.ttc.testDeletedDesc', 'Removed test entry.'),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const formatDateShort = (testedAtStr: string) =>
    formatDateInUserTimezone(testedAtStr, 'M/d') +
    ' at ' +
    formatDateInUserTimezone(testedAtStr, 'HH:mm');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-rose-500" />
          {t('cycle.ttc.testLoggingTitle', 'Ovulation & Pregnancy Tests')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OPK/LH test log */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
            <Beaker className="h-4 w-4 text-emerald-500" />
            {t('cycle.ttc.opkTestTitle', 'Ovulation Test (OPK / LH Surge)')}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {OPK_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="outline"
                className={cn(
                  'text-xs py-2 px-1 h-auto border transition',
                  opt.color
                )}
                onClick={() => handleLogTest('opk', opt.value)}
              >
                {t(`cycle.ttc.opk.${opt.value}`, opt.label)}
              </Button>
            ))}
          </div>
        </div>

        {/* HPT/Pregnancy test log */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
            <FlaskConical className="h-4 w-4 text-rose-500" />
            {t('cycle.ttc.hptTestTitle', 'Pregnancy Test (HPT)')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {HPT_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="outline"
                className={cn(
                  'text-xs py-2 px-1 h-auto border transition',
                  opt.color
                )}
                onClick={() => handleLogTest('hpt', opt.value)}
              >
                {t(`cycle.ttc.hpt.${opt.value}`, opt.label)}
              </Button>
            ))}
          </div>
        </div>

        {/* Timeline list of logged tests */}
        {testEntries && testEntries.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {t('cycle.ttc.testLogsHistory', "This Cycle's Test Logs")}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {testEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 border text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {entry.test_type === 'opk'
                          ? 'OPK (LH)'
                          : 'Pregnancy (HPT)'}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 text-[10px] rounded-full border',
                          BADGE_STYLES[entry.result] ||
                            'bg-muted text-muted-foreground'
                        )}
                      >
                        {t(
                          `cycle.ttc.result.${entry.result}`,
                          entry.result.toUpperCase()
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateShort(entry.tested_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label={t('common.delete', 'Delete')}
                    onClick={() => handleDeleteTest(entry.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
