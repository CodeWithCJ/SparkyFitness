import { useTranslation } from 'react-i18next';
import type { GestationalAge } from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';

interface WeekBannerProps {
  gestation: GestationalAge;
  dueDate: string;
}

const TRIMESTER_LABELS = ['First', 'Second', 'Third'];

export default function WeekBanner({ gestation, dueDate }: WeekBannerProps) {
  const { t } = useTranslation();
  const { week, day, trimester, daysRemaining, progress } = gestation;

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5">
      <CardContent className="py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {t(
            `pregnancy.trimester.${trimester}`,
            `${TRIMESTER_LABELS[trimester - 1]} trimester`
          )}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {t('pregnancy.banner.week', 'Week {{n}}', { n: week })}
          </span>
          <span className="text-lg text-muted-foreground">+{day}d</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {daysRemaining > 0
            ? t(
                'pregnancy.banner.daysUntil',
                '{{n}} days until due date · {{date}}',
                {
                  n: daysRemaining,
                  date: formatDue(dueDate),
                }
              )
            : t('pregnancy.banner.dueNow', 'Due date is here!')}
        </p>

        {/* Trimester progress bar */}
        <div className="mt-4">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>T1</span>
            <span>T2</span>
            <span>T3</span>
            <span>{t('pregnancy.banner.due', 'Due')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDue(day: string): string {
  const [, m, d] = day.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}
