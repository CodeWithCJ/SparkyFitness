import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateTimeInput } from '@/components/ui/TimeInput';
import FastingTimerRing from '../Fasting/FastingTimerRing';
import { Play, Timer, Square, Sparkles, Utensils } from 'lucide-react';
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
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatTimeWithPreference } from '@/utils/timeFormatters';
import { FASTING_PRESETS } from '@/constants/fastingPresets';
import { parseISO, addHours, differenceInMinutes } from 'date-fns';
import EndFastDialog from '../Fasting/EndFastDialog';
import FastingZoneBar from '../Fasting/FastingZoneBar';
import EatingWindowBar from '../Fasting/EatingWindowBar';
import {
  useCurrentFast,
  useEndFastMutation,
  useFastingStats,
  useStartFastMutation,
} from '@/hooks/Fasting/useFasting';

const HomeDashboardFasting = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { timeFormat } = usePreferences();

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('16-8');
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [startLocal, setStartLocal] = useState<string>('');
  const [now, setNow] = useState(() => Date.now());

  const formatForLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const {
    data: activeFast,
    isLoading,
    refetch: refetchCurrentFast,
  } = useCurrentFast();
  const { mutateAsync: startFast } = useStartFastMutation();
  const { mutate: endFast } = useEndFastMutation();

  useEffect(() => {
    if (!activeFast?.is_eating_window) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, [activeFast?.is_eating_window]);

  const dynamicEatingRemainingMinutes = useMemo(() => {
    if (!activeFast?.is_eating_window) return 0;
    if (activeFast.target_end_time) {
      const targetMs = parseISO(activeFast.target_end_time).getTime();
      return Math.max(0, Math.floor((targetMs - now) / 60000));
    }
    return activeFast.eating_window_remaining_minutes ?? 0;
  }, [activeFast, now]);

  useEffect(() => {
    if (activeFast?.is_eating_window && activeFast.target_end_time) {
      const targetMs = parseISO(activeFast.target_end_time).getTime();
      if (now >= targetMs) {
        void refetchCurrentFast();
      }
    }
  }, [now, activeFast, refetchCurrentFast]);

  const { data: stats } = useFastingStats();
  const averageDurationMinutes = Number(stats?.average_duration_minutes ?? 0);
  const averageDurationHours = Number.isFinite(averageDurationMinutes)
    ? Math.round(averageDurationMinutes / 60)
    : 0;

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
        <CardTitle className="flex items-center justify-between text-xl">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-primary" />
            {t('fasting.checklistTitle', 'Fasting Timer')}
          </div>
          {activeFast?.is_eating_window ? (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            >
              <Sparkles className="w-3 h-3" />
              {t('fasting.eatingWindowOpen', 'Eating Window Open')}
            </Badge>
          ) : (
            activeFast?.is_auto_calculated && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 text-xs bg-primary/10 text-primary border-primary/20"
              >
                <Sparkles className="w-3 h-3" />
                {t('fasting.autoFromMeals', 'Auto (from meals)')}
              </Badge>
            )
          )}
        </CardTitle>
        <CardDescription>
          {activeFast
            ? activeFast.is_eating_window
              ? t('fasting.eatingWindowDescription', {
                  defaultValue: `Eating window open · ${Math.floor((activeFast.eating_window_remaining_minutes ?? 0) / 60)}h ${(activeFast.eating_window_remaining_minutes ?? 0) % 60}m remaining (closes at ${activeFast.target_end_time ? formatTimeWithPreference(parseISO(activeFast.target_end_time), timeFormat) : ''})`,
                  remaining: `${Math.floor((activeFast.eating_window_remaining_minutes ?? 0) / 60)}h ${(activeFast.eating_window_remaining_minutes ?? 0) % 60}m`,
                  endTime: activeFast.target_end_time
                    ? formatTimeWithPreference(
                        parseISO(activeFast.target_end_time),
                        timeFormat
                      )
                    : '',
                })
              : activeFast.is_auto_calculated && activeFast.start_meal_name
                ? t('fasting.currentlyFastingAfterMeal', {
                    meal: activeFast.start_meal_name,
                    defaultValue: `Fasting since ${activeFast.start_meal_name}`,
                  })
                : t('fasting.currentlyFasting', 'You are currently fasting')
            : t('fasting.readyToStart', 'Ready to start a new fast?')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center">
          {activeFast && activeFast.is_eating_window ? (
            <div className="flex flex-col items-center justify-center py-2 text-center space-y-4 w-full">
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-4xl shadow-sm">
                🍽️
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {Math.floor(dynamicEatingRemainingMinutes / 60)}h{' '}
                  {dynamicEatingRemainingMinutes % 60}m
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    'fasting.remainingInEatingWindow',
                    'Remaining in your eating window'
                  )}
                </p>
              </div>

              {/* Eating Window Color Bands Bar */}
              {activeFast.start_time && activeFast.target_end_time && (
                <div className="w-full px-2">
                  <EatingWindowBar
                    startTime={activeFast.start_time}
                    targetEndTime={activeFast.target_end_time}
                    remainingMinutes={dynamicEatingRemainingMinutes}
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground/80 max-w-xs">
                {t(
                  'fasting.eatingWindowHint',
                  'Fasting will automatically resume after your eating window closes.'
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartLocal(formatForLocalInput(new Date()));
                  setShowStartDialog(true);
                }}
                className="text-xs"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {t('fasting.startFastEarly', 'Start Fasting Now')}
              </Button>
            </div>
          ) : activeFast &&
            activeFast.start_time &&
            activeFast.target_end_time ? (
            <div className="flex justify-center">
              <FastingTimerRing
                startTime={parseISO(activeFast.start_time)}
                targetEndTime={parseISO(activeFast.target_end_time)}
                size={180}
              />
            </div>
          ) : (
            <div className="text-center space-y-4 py-4">
              <div className="w-32 h-32 rounded-full bg-secondary/50 flex items-center justify-center mx-auto border-2 border-dashed border-muted-foreground/30">
                <span className="text-4xl">🍽️</span>
              </div>
              <Button
                onClick={() => {
                  setStartLocal(formatForLocalInput(new Date()));
                  setShowStartDialog(true);
                }}
                className="w-full gap-2 font-semibold"
              >
                <Play className="w-4 h-4" />
                {t('fasting.startFast', 'Start Fast')}
              </Button>
            </div>
          )}
        </div>

        {activeFast && !activeFast.is_eating_window && (
          <>
            <div className="w-full">
              <FastingZoneBar
                hoursFasted={fastDurationHours}
                startTime={activeFast.start_time}
                targetEndTime={activeFast.target_end_time}
              />
            </div>

            <Button
              variant="destructive"
              size="lg"
              onClick={() => setShowEndDialog(true)}
              className="w-full shadow-md hover:shadow-lg transition-all"
            >
              <Square className="w-4 h-4 mr-2 fill-current" />
              {t('fasting.endFast', 'End Fast')}
            </Button>

            {activeFast.is_auto_calculated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
                className="w-full gap-2 text-xs text-muted-foreground -mt-3"
              >
                <Utensils className="w-3.5 h-3.5 mr-1" />
                {t('fasting.logMealToEnd', 'Log Meal to End Fast')}
              </Button>
            )}
          </>
        )}

        {/* Mini Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="flex flex-col items-center p-2 bg-secondary/20 rounded-lg">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                {t('fasting.totalFasts', 'Total Fasts')}
              </span>
              <span className="text-xl font-bold">
                {stats.total_completed_fasts}
              </span>
            </div>
            <div className="flex flex-col items-center p-2 bg-secondary/20 rounded-lg">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                {t('fasting.avgDuration', 'Avg Duration')}
              </span>
              <span className="text-xl font-bold">
                {t('fasting.hoursShort', {
                  count: averageDurationHours,
                  defaultValue: `${averageDurationHours}h`,
                })}
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
              {t('homeFasting.startNew', 'Start a New Fast')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'homeFasting.description',
                'Select a protocol to begin your fast.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label id="home-fast-start-label">
                {t('homeFasting.startTime', 'Start Time')}
              </Label>
              <DateTimeInput
                aria-labelledby="home-fast-start-label"
                value={startLocal}
                onChange={setStartLocal}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('homeFasting.protocol', 'Fasting Protocol')}</Label>
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
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleStartFast}>
              {t('homeFasting.start', 'Start Fasting')}
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
