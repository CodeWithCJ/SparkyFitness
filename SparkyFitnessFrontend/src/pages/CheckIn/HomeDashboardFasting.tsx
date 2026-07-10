import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FastingTimerRing from '../Fasting/FastingTimerRing';
import { CircleAlert, Play, Square, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FASTING_PRESETS } from '@/constants/fastingPresets';
import { parseISO, addHours, differenceInMinutes } from 'date-fns';
import EndFastDialog from '../Fasting/EndFastDialog';
import FastingZoneBar from '../Fasting/FastingZoneBar';
import {
  useCurrentFast,
  useEndFastMutation,
  useFastingStats,
  useStartFastMutation,
} from '@/hooks/Fasting/useFasting';
import { formatLocalizedMinutes } from '@/utils/timeFormatters';

const HomeDashboardFasting = () => {
  const { t } = useTranslation();

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('16-8');
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [startLocal, setStartLocal] = useState<string>('');

  const formatForLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const { data: activeFast, isLoading } = useCurrentFast();
  const { mutateAsync: startFast } = useStartFastMutation();
  const { mutate: endFast } = useEndFastMutation();

  const { data: stats } = useFastingStats();

  if (isLoading) return <Card className="h-64 animate-pulse" />;

  const handleStartFast = async () => {
    const preset = FASTING_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset) return;

    const start = startLocal ? new Date(startLocal) : new Date();
    const end = addHours(start, preset.fastingHours);

    await startFast({
      startTime: start,
      targetEndTime: end,
      fastingType: preset.name,
    });
    setShowStartDialog(false);
  };

  const handleEndFast = (
    start: Date,
    end: Date,
    weight?: number,
    mood?: { value: number; notes: string }
  ) => {
    if (!activeFast) return;
    endFast({
      id: activeFast.id,
      startTime: start,
      endTime: end,
      weight: weight,
      mood: mood,
    });
  };
  const formatDuration = () => {
    if (!activeFast) return '';
    const mins = differenceInMinutes(
      new Date(),
      parseISO(activeFast.start_time)
    );
    return formatLocalizedMinutes(mins, t);
  };

  const fastDurationHours = activeFast
    ? (new Date().getTime() - parseISO(activeFast.start_time).getTime()) /
      (1000 * 60 * 60)
    : 0;

  return (
    <Card className="flex h-full flex-col border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('fasting.timerTitle', 'Fasting timer')}
        </CardTitle>
        <CardDescription>
          {activeFast
            ? t('fasting.activeDescription', 'Your fast is in progress.')
            : t('fasting.readyDescription', 'Ready to start a new fast?')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col items-center justify-center">
          {activeFast && activeFast.start_time && activeFast.target_end_time ? (
            <div className="flex justify-center">
              <FastingTimerRing
                startTime={parseISO(activeFast.start_time)}
                targetEndTime={parseISO(activeFast.target_end_time)}
                size={180}
              />
            </div>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 bg-secondary/50">
                <span className="text-4xl" aria-hidden="true">
                  🍽️
                </span>
              </div>
              <Button
                onClick={() => {
                  setStartLocal(formatForLocalInput(new Date()));
                  setShowStartDialog(true);
                }}
                className="w-full gap-2 font-semibold"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('fasting.startFast', 'Start fast')}
              </Button>
            </div>
          )}
        </div>

        {activeFast && (
          <>
            <div className="w-full">
              <FastingZoneBar hoursFasted={fastDurationHours} />
            </div>

            <Button
              variant="destructive"
              size="lg"
              onClick={() => setShowEndDialog(true)}
              className="w-full shadow-md transition-all hover:shadow-lg"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              {t('fasting.endFast', 'End fast')}
            </Button>
          </>
        )}

        <div
          role="note"
          className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground"
        >
          <CircleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span>
            {t(
              'fasting.safetyNote',
              'If you have diabetes, a chronic condition, or take regular medication, consult your clinician before fasting. Stop if you develop severe dizziness or symptoms of low or high blood sugar or dehydration.'
            )}
          </span>
        </div>

        {/* Mini Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="flex flex-col items-center rounded-lg bg-secondary/20 p-2">
              <span className="text-xs font-bold tracking-wide text-muted-foreground">
                {t('fasting.totalFasts', 'Total fasts')}
              </span>
              <span className="text-xl font-bold">
                {stats.total_completed_fasts}
              </span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-secondary/20 p-2">
              <span className="text-xs font-bold tracking-wide text-muted-foreground">
                {t('fasting.averageDuration', 'Average duration')}
              </span>
              <span className="text-xl font-bold">
                {formatLocalizedMinutes(
                  parseInt(stats.average_duration_minutes),
                  t
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Start Fast Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('fasting.startDialogTitle', 'Start a new fast')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'fasting.startDialogDescription',
                'Choose a duration and set your start time.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fast-start-time">
                {t('fasting.startTime', 'Start time')}
              </Label>
              <Input
                id="fast-start-time"
                type="datetime-local"
                dir="ltr"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fasting-protocol">
                {t('fasting.protocol', 'Fasting duration')}
              </Label>
              <Select
                value={selectedPresetId}
                onValueChange={setSelectedPresetId}
              >
                <SelectTrigger id="fasting-protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FASTING_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {t(p.labelKey, p.name)} ({p.fastingHours}:{p.eatingHours})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const preset = FASTING_PRESETS.find(
                    (item) => item.id === selectedPresetId
                  );
                  return preset
                    ? t(preset.descriptionKey, preset.description)
                    : null;
                })()}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              {t('fasting.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleStartFast}>
              {t('fasting.confirmStart', 'Start fasting')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EndFastDialog
        isOpen={showEndDialog}
        onClose={() => setShowEndDialog(false)}
        durationFormatted={formatDuration()}
        initialStartISO={activeFast?.start_time ?? null}
        initialEndISO={new Date().toISOString()}
        onEnd={(start, end, weight, mood) => {
          handleEndFast(start, end, weight, mood);
        }}
      />
    </Card>
  );
};

export default HomeDashboardFasting;
