import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FastingTimerRing from '../Fasting/FastingTimerRing';
import { useNavigate } from 'react-router-dom';
import { Play, Timer, Square } from 'lucide-react';
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

const HomeDashboardFasting = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('16-8');
  const [showEndDialog, setShowEndDialog] = useState(false);

  const { data: activeFast, isLoading } = useCurrentFast();
  const { mutateAsync: startFast } = useStartFastMutation();
  const { mutate: endFast } = useEndFastMutation();

  const { data: stats } = useFastingStats();

  if (isLoading) return <Card className="h-64 animate-pulse" />;

  const handleStartFast = async () => {
    const preset = FASTING_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset) return;

    const start = new Date();
    const end = addHours(start, preset.fastingHours);

    await startFast({
      startTime: start,
      targetEndTime: end,
      fastingType: preset.name,
    });
    setShowStartDialog(false);
  };

  const handleEndFast = (
    weight: number,
    mood: { value: number; notes: string },
    start: Date,
    end: Date
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
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const fastDurationHours = activeFast
    ? (new Date().getTime() - parseISO(activeFast.start_time).getTime()) /
      (1000 * 60 * 60)
    : 0;

  return (
    <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Timer className="w-5 h-5 text-primary" />
          {t('fasting.checklistTitle', 'Fasting Timer')}
        </CardTitle>
        <CardDescription>
          {activeFast
            ? 'You are currently fasting'
            : 'Ready to start a new fast?'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center">
          {activeFast ? (
            <div
              className="cursor-pointer hover:scale-105 transition-transform"
              onClick={() => navigate('/fasting')}
            >
              <FastingTimerRing
                startTime={parseISO(activeFast.start_time)}
                targetEndTime={parseISO(activeFast.target_end_time!)}
                size={180}
              />
            </div>
          ) : (
            <div className="text-center space-y-4 py-4">
              <div className="w-32 h-32 rounded-full bg-secondary/50 flex items-center justify-center mx-auto border-2 border-dashed border-muted-foreground/30">
                <span className="text-4xl">🍽️</span>
              </div>
              <Button
                onClick={() => setShowStartDialog(true)}
                className="w-full gap-2 font-semibold"
              >
                <Play className="w-4 h-4" /> Start Fast
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
              className="w-full shadow-md hover:shadow-lg transition-all"
            >
              <Square className="w-4 h-4 mr-2 fill-current" /> End Fast
            </Button>
          </>
        )}

        {/* Mini Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="flex flex-col items-center p-2 bg-secondary/20 rounded-lg">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                Total Fasts
              </span>
              <span className="text-xl font-bold">
                {stats.total_completed_fasts}
              </span>
            </div>
            <div className="flex flex-col items-center p-2 bg-secondary/20 rounded-lg">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                Avg Duration
              </span>
              <span className="text-xl font-bold">
                {Math.round(parseInt(stats.average_duration_minutes) / 60)}h
              </span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Start Fast Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a New Fast</DialogTitle>
            <DialogDescription>
              Select a protocol to begin your fast.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Fasting Protocol</Label>
              <Select
                value={selectedPresetId}
                onValueChange={setSelectedPresetId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FASTING_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.fastingHours}:{p.eatingHours})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {
                  FASTING_PRESETS.find((p) => p.id === selectedPresetId)
                    ?.description
                }
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartFast}>Start Fasting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EndFastDialog
        isOpen={showEndDialog}
        onClose={() => setShowEndDialog(false)}
        durationFormatted={formatDuration()}
        initialStartISO={activeFast?.start_time ?? null}
        initialEndISO={new Date().toISOString()}
        onEnd={(weight, mood, start, end) => {
          handleEndFast(weight, mood, start, end);
        }}
      />
    </Card>
  );
};

export default HomeDashboardFasting;
