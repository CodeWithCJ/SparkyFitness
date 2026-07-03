import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { SharedSymptomEntry } from '@workspace/shared';

interface SymptomHistoryListProps {
  symptomLogs: SharedSymptomEntry[];
  loadingSymptoms: boolean;
  onDeleteLog: (logId: string) => void;
  isPending: boolean;
}

export default function SymptomHistoryList({
  symptomLogs,
  loadingSymptoms,
  onDeleteLog,
  isPending,
}: SymptomHistoryListProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();

  const formatEntryTime = (timestamp: string) => {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).formatToParts(new Date(timestamp));

      let hour = '';
      let minute = '';
      let dayPeriod = '';
      for (const p of parts) {
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
        if (p.type === 'dayPeriod') dayPeriod = p.value;
      }
      return `${hour}:${minute} ${dayPeriod}`;
    } catch (e) {
      return '--:--';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {t('medications.symptoms.logsTitle', 'Logged Symptom Logs')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadingSymptoms && (
          <p className="text-sm text-muted-foreground">Loading logs…</p>
        )}
        {!loadingSymptoms && symptomLogs.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No symptom entries logged in the past 30 days. Use the log form to
            record symptoms.
          </div>
        )}
        {symptomLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-start justify-between p-3 rounded-lg border bg-muted/10 text-sm hover:shadow-xs transition"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground capitalize truncate">
                  {log.symptom_name_snapshot.replace(/_/g, ' ')}
                </p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] border-none font-semibold ${
                    log.severity <= 3
                      ? 'bg-green-100 text-green-800'
                      : log.severity <= 6
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  Severity: {log.severity}
                </Badge>
                {log.bristol_type && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-950 border-amber-200"
                  >
                    {t(
                      'medications.symptoms.bristolType',
                      'Bristol Type {{n}}',
                      { n: log.bristol_type }
                    )}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span>
                  {log.entry_date} at {formatEntryTime(log.logged_at)}
                </span>
                {log.body_location && (
                  <>
                    <span>•</span>
                    <span className="capitalize">{log.body_location}</span>
                  </>
                )}
              </div>
              {log.context_text && (
                <p className="text-xs text-muted-foreground bg-background p-1.5 rounded border border-muted mt-1 leading-relaxed italic">
                  "{log.context_text}"
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => onDeleteLog(log.id)}
              disabled={isPending}
              aria-label="Remove symptom log"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
