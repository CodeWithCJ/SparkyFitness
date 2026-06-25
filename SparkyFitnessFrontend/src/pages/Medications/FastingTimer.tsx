import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer, Droplet } from 'lucide-react';

const FAST_MINUTES = 30;

/**
 * Oral GLP-1 (e.g. oral semaglutide / Rybelsus) fasting countdown: take with a sip of water,
 * then wait ~30 min before food, coffee, or other meds. Start time is persisted per-medication in
 * localStorage so the countdown survives reloads/navigation.
 */
export default function FastingTimer({ medId }: { medId: string }) {
  const storageKey = `glp1-fast-${medId}`;
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    const v =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(storageKey)
        : null;
    return v ? Number(v) : null;
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const remainingMs =
    startedAt == null
      ? 0
      : Math.max(0, FAST_MINUTES * 60_000 - (now - startedAt));
  const done = startedAt != null && remainingMs === 0;
  const mm = Math.floor(remainingMs / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000);

  const start = () => {
    const ts = Date.now();
    localStorage.setItem(storageKey, String(ts));
    setStartedAt(ts);
    setNow(ts);
  };
  const reset = () => {
    localStorage.removeItem(storageKey);
    setStartedAt(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-blue-500" /> Oral GLP-1 fasting timer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Take with 4–6 oz of water, then wait {FAST_MINUTES} min before food,
          coffee, or other medications.
        </p>
        {startedAt == null ? (
          <Button onClick={start} className="w-full">
            Tablet taken — start timer
          </Button>
        ) : done ? (
          <div className="flex items-center justify-between rounded-md border border-green-500/40 bg-green-50 p-3 text-sm dark:bg-green-950">
            <span className="font-medium text-green-700 dark:text-green-300">
              Fast complete — you can eat now.
            </span>
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Droplet className="h-4 w-4 text-blue-500" /> Water only
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-semibold tabular-nums">
                {mm}:{String(ss).padStart(2, '0')}
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Reset
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
