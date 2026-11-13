import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { brushingQuadrant } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { playIntervalCue } from '@/utils/workoutSounds';

interface BrushingTimerDialogProps {
  open: boolean;
  /** The goal's time per brush, split into four quarters of the mouth. */
  targetSeconds: number;
  onOpenChange: (open: boolean) => void;
  /** Saves the brush; rejecting keeps the dialog open so Save can retry. */
  onSave: (startedAt: Date, durationSeconds: number) => Promise<unknown>;
}

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The web brushing timer (#1862): the target time in four quarters of the
 * mouth, a soft chime at each change and the workout finish chime at the target
 * (synthesized, so no audio files). Time comes from the wall clock, so a
 * throttled background tab still saves the right duration; the chimes only
 * play while the tab is visible.
 */
export const BrushingTimerDialog = ({
  open,
  targetSeconds,
  onOpenChange,
  onSave,
}: BrushingTimerDialogProps) => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const startedAtRef = useRef<Date | null>(null);
  // Milliseconds counted before the current run (pauses split runs).
  const bankedMsRef = useRef(0);
  const runStartMsRef = useRef<number | null>(null);
  const lastQuadrantRef = useRef(0);

  const currentMs = useCallback(
    () =>
      bankedMsRef.current +
      (runStartMsRef.current !== null ? Date.now() - runStartMsRef.current : 0),
    []
  );

  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    setSaving(false);
    startedAtRef.current = null;
    bankedMsRef.current = 0;
    runStartMsRef.current = null;
    lastQuadrantRef.current = 0;
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const seconds = Math.floor(currentMs() / 1000);
      setElapsed(seconds);
      const quadrant = brushingQuadrant(seconds, targetSeconds);
      if (quadrant !== lastQuadrantRef.current) {
        lastQuadrantRef.current = quadrant;
        if (soundOn && document.visibilityState === 'visible') {
          playIntervalCue(quadrant === 4 ? 'finish' : 'rest');
        }
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running, targetSeconds, currentMs, soundOn]);

  const toggle = () => {
    if (running) {
      bankedMsRef.current = currentMs();
      runStartMsRef.current = null;
      setRunning(false);
      return;
    }
    if (!startedAtRef.current) startedAtRef.current = new Date();
    runStartMsRef.current = Date.now();
    setRunning(true);
  };

  const handleSave = async () => {
    const startedAt = startedAtRef.current;
    const seconds = Math.round(currentMs() / 1000);
    if (!startedAt || seconds <= 0 || saving) return;
    bankedMsRef.current = currentMs();
    runStartMsRef.current = null;
    setRunning(false);
    setSaving(true);
    try {
      await onSave(startedAt, seconds);
      reset();
      onOpenChange(false);
    } catch {
      // The mutation's own toast says what failed; Save can be pressed again.
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const quadrant = brushingQuadrant(elapsed, targetSeconds);
  const timeLeftFraction =
    targetSeconds > 0
      ? Math.max(0, targetSeconds - elapsed) / targetSeconds
      : 0;
  const quadrantLabels = [
    t('oralCare.timer.upperLeft', 'Upper left'),
    t('oralCare.timer.upperRight', 'Upper right'),
    t('oralCare.timer.lowerRight', 'Lower right'),
    t('oralCare.timer.lowerLeft', 'Lower left'),
  ];
  const status =
    quadrant === 4
      ? t('oralCare.timer.done', 'Done! Save the brush')
      : elapsed === 0 && !running
        ? t('oralCare.timer.ready', 'Ready')
        : quadrantLabels[quadrant];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>
            {t('oralCare.timer.title', 'Brushing timer')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'oralCare.timer.subtitle',
              '{{time}}, a quarter of your mouth at a time',
              { time: formatClock(targetSeconds) }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative h-56 w-56">
            {/* Full at the start, drains to empty as the time runs out. */}
            <svg
              className="absolute inset-0 -rotate-90"
              viewBox="0 0 100 100"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="6"
                className="stroke-sky-500/15"
              />
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className="stroke-sky-500 transition-[stroke-dashoffset] duration-300 ease-linear"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - timeLeftFraction)}
                data-testid="timer-ring"
                data-progress={timeLeftFraction}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div
                className="text-5xl font-mono font-bold tabular-nums"
                aria-live="polite"
              >
                {quadrant === 4
                  ? formatClock(elapsed)
                  : formatClock(targetSeconds - elapsed)}
              </div>
              <div className="text-sm font-medium text-sky-600 dark:text-sky-400">
                {status}
              </div>
            </div>
          </div>

          <div className="flex gap-2" aria-hidden>
            {[0, 1, 2, 3].map((q) => (
              <div
                key={q}
                className={`h-2 w-12 rounded-full ${
                  q < quadrant || quadrant === 4
                    ? 'bg-sky-500'
                    : q === quadrant && (running || elapsed > 0)
                      ? 'bg-sky-500/50'
                      : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundOn((on) => !on)}
            aria-label={
              soundOn
                ? t('oralCare.timer.mute', 'Turn sound off')
                : t('oralCare.timer.unmute', 'Turn sound on')
            }
            aria-pressed={!soundOn}
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </Button>
          <Button className="flex-1 gap-2" onClick={toggle} disabled={saving}>
            {running ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running
              ? t('oralCare.timer.pause', 'Pause')
              : elapsed > 0
                ? t('oralCare.timer.resume', 'Resume')
                : t('oralCare.timer.start', 'Start')}
          </Button>
          {elapsed > 0 && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {t('common.save', 'Save')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
