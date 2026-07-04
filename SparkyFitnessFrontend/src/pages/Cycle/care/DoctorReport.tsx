import { useTranslation } from 'react-i18next';
import { useCycleInsights } from '@/hooks/useCycle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Printer } from 'lucide-react';

interface InsightsShape {
  stats?: {
    avgCycleLength: number;
    avgPeriodLength: number;
    cycleLengthSd: number;
    regularity: string;
    sampleSize: number;
  };
  accuracy?: { withinDays?: number; sampleSize?: number } | null;
}

export default function DoctorReport() {
  const { t } = useTranslation();
  const { data } = useCycleInsights() as { data?: InsightsShape };
  const stats = data?.stats;

  const print = () => window.print();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <FileText className="h-4 w-4" />
          {t('cycle.care.doctorReport', 'Doctor report')}
        </p>
        <Button variant="ghost" size="sm" onClick={print}>
          <Printer className="mr-1 h-4 w-4" />
          {t('cycle.care.print', 'Print')}
        </Button>
      </div>
      <Card>
        <CardContent className="py-4 text-sm">
          {stats && stats.sampleSize > 0 ? (
            <div className="space-y-1.5">
              <Row
                label={t('cycle.care.avgCycle', 'Average cycle length')}
                value={`${stats.avgCycleLength} days (±${stats.cycleLengthSd})`}
              />
              <Row
                label={t('cycle.care.avgPeriod', 'Average period length')}
                value={`${stats.avgPeriodLength} days`}
              />
              <Row
                label={t('cycle.care.regularity', 'Regularity')}
                value={t(
                  `cycle.regularity.${stats.regularity}`,
                  stats.regularity
                )}
              />
              <Row
                label={t('cycle.care.cyclesTracked', 'Cycles analyzed')}
                value={String(stats.sampleSize)}
              />
              <p className="pt-2 text-[11px] text-muted-foreground">
                {t(
                  'cycle.care.reportNote',
                  'Based on self-reported data. Generated locally for sharing with your clinician.'
                )}
              </p>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">
              {t(
                'cycle.care.reportEmpty',
                'Log a few cycles to generate a summary you can share.'
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
