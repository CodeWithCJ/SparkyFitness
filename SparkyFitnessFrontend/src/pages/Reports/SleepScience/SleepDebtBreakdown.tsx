import type { SleepDebtData } from '@/api/SleepScience/sleepScience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface SleepDebtBreakdownProps {
  data: SleepDebtData;
}

const SleepDebtBreakdown: React.FC<SleepDebtBreakdownProps> = ({ data }) => {
  const { t } = useTranslation();

  // Show only last 7 days for brevity
  const recentDays = data.last14Days.slice(0, 7);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t('sleepScience.dailyBreakdown', 'Daily Breakdown')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-2">
                  {t('sleepScience.date', 'Date')}
                </th>
                <th className="text-right py-2">
                  {t('sleepScience.slept', 'Slept')}
                </th>
                <th className="text-right py-2">
                  {t('sleepScience.deviation', 'Deviation')}
                </th>
                <th className="text-right py-2">
                  {t('sleepScience.weight', 'Weight')}
                </th>
              </tr>
            </thead>
            <tbody>
              {recentDays.map((day) => (
                <tr
                  key={day.date}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-1.5 text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="text-right py-1.5 font-mono">
                    {day.tst.toFixed(1)}h
                  </td>
                  <td className="text-right py-1.5 font-mono">
                    <span
                      className={
                        day.deviation > 0
                          ? 'text-red-500'
                          : day.deviation < 0
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                      }
                    >
                      {day.deviation > 0 ? '+' : ''}
                      {day.deviation.toFixed(1)}h
                    </span>
                  </td>
                  <td className="text-right py-1.5 font-mono text-muted-foreground">
                    {(day.weight * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t(
            'sleepScience.weightExplanation',
            'Weight indicates recency: more recent days have higher impact.'
          )}
        </p>
      </CardContent>
    </Card>
  );
};

export default SleepDebtBreakdown;
