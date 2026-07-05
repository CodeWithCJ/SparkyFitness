import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useContractions,
  useCreateContractionMutation,
  useUpdateContractionMutation,
} from '@/hooks/usePregnancy';
import type { SharedContraction } from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Timer } from 'lucide-react';

interface ContractionTimerProps {
  pregnancyId: string;
}

function fmtDuration(a: string, b: string | null | undefined): string {
  if (!b) return '—';
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return `${s}s`;
}

function fmtInterval(prev: string, cur: string): string {
  const m = (new Date(cur).getTime() - new Date(prev).getTime()) / 60000;
  return `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
}

export default function ContractionTimer({
  pregnancyId,
}: ContractionTimerProps) {
  const { t } = useTranslation();
  const createMutation = useCreateContractionMutation();
  const updateMutation = useUpdateContractionMutation();
  const { data } = useContractions(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedIso = useRef<string | null>(null);

  useEffect(() => {
    if (startMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startMs]);

  const startContraction = async () => {
    const iso = new Date().toISOString();
    startedIso.current = iso;
    setStartMs(Date.now());
    const c = await createMutation.mutateAsync({
      pregnancyId,
      startedAt: iso,
    });
    setActiveId(c.id ?? null);
  };

  const stopContraction = async () => {
    if (activeId) {
      await updateMutation.mutateAsync({
        id: activeId,
        body: { ended_at: new Date().toISOString() },
      });
    }
    setActiveId(null);
    setStartMs(null);
    startedIso.current = null;
  };

  const contractions: SharedContraction[] = data?.contractions ?? [];
  const stats = data?.stats;
  const running = startMs != null;

  return (
    <Card>
      <CardContent className="py-6">
        <p className="mb-1 text-center text-sm font-medium">
          {t('pregnancy.contractions.title', 'Contraction timer')}
        </p>

        {stats?.isFiveOneOne ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {t(
                'pregnancy.contractions.fiveOneOne',
                'Your contractions look like a 5-1-1 pattern (about 5 min apart, ~1 min long, for an hour). Consider contacting your provider. This is not medical advice.'
              )}
            </span>
          </div>
        ) : null}

        <div className="mb-4 text-center">
          <p className="text-3xl font-bold tabular-nums">
            {running && startMs != null
              ? `${Math.floor((now - startMs) / 1000)}s`
              : '—'}
          </p>
          <Button
            className="mt-3 rounded-full px-8"
            variant={running ? 'destructive' : 'default'}
            onClick={running ? stopContraction : startContraction}
          >
            <Timer className="mr-1.5 h-4 w-4" />
            {running
              ? t('pregnancy.contractions.stop', 'Stop')
              : t('pregnancy.contractions.start', 'Start contraction')}
          </Button>
        </div>

        {stats && stats.count > 0 ? (
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-muted/40 py-2">
              <p className="font-semibold">{stats.count}</p>
              <p className="text-muted-foreground">
                {t('pregnancy.contractions.count', 'in last hr')}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 py-2">
              <p className="font-semibold">
                {stats.avgIntervalMin != null
                  ? `${stats.avgIntervalMin}m`
                  : '—'}
              </p>
              <p className="text-muted-foreground">
                {t('pregnancy.contractions.apart', 'apart')}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 py-2">
              <p className="font-semibold">
                {stats.avgDurationSec != null
                  ? `${stats.avgDurationSec}s`
                  : '—'}
              </p>
              <p className="text-muted-foreground">
                {t('pregnancy.contractions.long', 'long')}
              </p>
            </div>
          </div>
        ) : null}

        {contractions.length > 0 ? (
          <div className="space-y-1">
            {contractions
              .slice()
              .reverse()
              .slice(0, 6)
              .map((c, i, arr) => {
                const prev = arr[i + 1];
                return (
                  <div
                    key={c.id ?? c.started_at}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
                  >
                    <span>{new Date(c.started_at).toLocaleTimeString()}</span>
                    <span className="text-muted-foreground">
                      {t('pregnancy.contractions.dur', 'Duration')}:{' '}
                      {fmtDuration(c.started_at, c.ended_at)}
                      {prev
                        ? ` · ${t('pregnancy.contractions.int', 'Interval')}: ${fmtInterval(prev.started_at, c.started_at)}`
                        : ''}
                    </span>
                  </div>
                );
              })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
