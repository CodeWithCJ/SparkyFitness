import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  pregnancyKeys,
  useStartKickMutation,
  useUpdateKickMutation,
} from '@/hooks/usePregnancy';
import type { SharedKickSession } from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Baby, Check } from 'lucide-react';

const GOAL = 10;

interface KickCounterProps {
  pregnancyId: string;
  recentSessions?: SharedKickSession[];
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function KickCounter({
  pregnancyId,
  recentSessions = [],
}: KickCounterProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const startMutation = useStartKickMutation();
  const updateMutation = useUpdateKickMutation();
  const [session, setSession] = useState<SharedKickSession | null>(null);
  const [count, setCount] = useState(0);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pop, setPop] = useState(false);
  const times = useRef<string[]>([]);

  useEffect(() => {
    if (startMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startMs]);

  const start = async () => {
    const s = await startMutation.mutateAsync(pregnancyId);
    setSession(s);
    setCount(0);
    times.current = [];
    setStartMs(Date.now());
  };

  const tap = async () => {
    if (!session) return;
    const next = count + 1;
    setCount(next);
    setPop(true);
    setTimeout(() => setPop(false), 150);
    times.current = [...times.current, new Date().toISOString()];
    await updateMutation.mutateAsync({
      id: session.id!,
      body: {
        kick_count: next,
        kick_times: times.current,
        ended: next >= GOAL,
      },
    });
    if (next >= GOAL) {
      finish();
    }
  };

  const finish = () => {
    setStartMs(null);
    setSession(null);
    queryClient.invalidateQueries({ queryKey: pregnancyKeys.kicks() });
    queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
  };

  const stop = async () => {
    if (session) {
      await updateMutation.mutateAsync({
        id: session.id!,
        body: { ended: true },
      });
    }
    finish();
  };

  const active = startMs != null;
  const reached = count >= GOAL;

  return (
    <Card>
      <CardContent className="py-6 text-center">
        <p className="text-sm font-medium">
          {t('pregnancy.kicks.title', 'Kick counter')}
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('pregnancy.kicks.goal', 'Aim for {{n}} movements', { n: GOAL })}
        </p>

        {active ? (
          <>
            <button
              type="button"
              onClick={tap}
              disabled={reached}
              aria-label={t('pregnancy.kicks.tap', 'Tap to count a kick')}
              className={`mx-auto flex h-40 w-40 select-none flex-col items-center justify-center rounded-full bg-primary/10 text-primary transition-transform ${
                pop ? 'scale-105' : 'scale-100'
              } active:scale-95`}
            >
              <Baby className="mb-1 h-8 w-8" />
              <span className="text-4xl font-bold tabular-nums">{count}</span>
              <span className="text-xs">/ {GOAL}</span>
            </button>
            <p className="mt-3 text-sm text-muted-foreground tabular-nums">
              {startMs != null ? fmtElapsed(now - startMs) : '0:00'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={stop}>
              {t('pregnancy.kicks.stop', 'End session')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={start} className="rounded-full px-6">
              {t('pregnancy.kicks.start', 'Start counting')}
            </Button>
            {recentSessions.length > 0 ? (
              <div className="mt-5 space-y-1.5 text-left">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('pregnancy.kicks.recent', 'Recent sessions')}
                </p>
                {recentSessions.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      {s.kick_count}{' '}
                      {t('pregnancy.kicks.movements', 'movements')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.started_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
