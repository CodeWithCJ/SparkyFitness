import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CycleAlert {
  key: string;
  severity: 'info' | 'attention';
  message: string;
}

interface CycleAlertsProps {
  alerts: CycleAlert[];
  onAction?: (key: string) => void;
}

export default function CycleAlerts({ alerts, onAction }: CycleAlertsProps) {
  const { t } = useTranslation();

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isAttention = alert.severity === 'attention';
        return (
          <Card
            key={alert.key}
            className={cn(
              'border transition-colors duration-200',
              isAttention
                ? 'border-red-200 bg-red-50/50 dark:border-red-950/30 dark:bg-red-950/10'
                : 'border-blue-200 bg-blue-50/50 dark:border-blue-950/30 dark:bg-blue-950/10'
            )}
          >
            <CardContent className="flex items-start gap-3 py-3 px-4">
              {isAttention ? (
                <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm text-foreground leading-relaxed">
                {t(`cycle.alert.${alert.key}`, alert.message)}
              </div>
              {onAction && (
                <button
                  onClick={() => onAction(alert.key)}
                  className="text-xs font-semibold text-primary hover:underline hover:text-primary/80 transition"
                >
                  {t('common.view', 'View')}
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
