import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Wind,
  Timer,
  Plus,
  Pencil,
  Trash2,
  Heart,
  Activity,
  Play,
  Pause,
  CheckCircle2,
} from 'lucide-react';
import {
  useMindfulnessDaySummary,
  useCreateMindfulnessSessionMutation,
  useUpdateMindfulnessSessionMutation,
  useDeleteMindfulnessSessionMutation,
} from '@/hooks/CheckIn/useMindfulness';
import type {
  CreateMindfulnessSessionBody,
  MindfulnessSessionResponse,
} from '@workspace/shared';

interface MindfulnessSectionProps {
  selectedDate: string;
}

const BREATHING_PATTERNS = {
  box: {
    inhale: 4,
    hold1: 4,
    exhale: 4,
    hold2: 4,
  },
  relax: {
    inhale: 4,
    hold1: 7,
    exhale: 8,
    hold2: 0,
  },
  coherence: {
    inhale: 5,
    hold1: 0,
    exhale: 5,
    hold2: 0,
  },
};

type BreathingPatternKey = keyof typeof BREATHING_PATTERNS;
type BreathPhase = 'Inhale' | 'Hold' | 'Exhale' | 'Rest';

export const MindfulnessSection: React.FC<MindfulnessSectionProps> = ({
  selectedDate,
}) => {
  const { t } = useTranslation();
  const { data: summary, isLoading } = useMindfulnessDaySummary(selectedDate);
  const { mutateAsync: createSession, isPending: isCreating } =
    useCreateMindfulnessSessionMutation();
  const { mutateAsync: updateSession, isPending: isUpdating } =
    useUpdateMindfulnessSessionMutation();
  const { mutateAsync: deleteSession } = useDeleteMindfulnessSessionMutation();

  // Dialog & Action states
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<MindfulnessSessionResponse | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTool, setActiveTool] = useState<'none' | 'breathe' | 'timer'>(
    'none'
  );

  // Manual Log Form State (Minutes + Seconds)
  const [formMinutes, setFormMinutes] = useState('15');
  const [formSeconds, setFormSeconds] = useState('0');
  const [formType, setFormType] = useState('meditation');
  const [formNotes, setFormNotes] = useState('');
  const [formHrAvg, setFormHrAvg] = useState('');
  const [formHrStart, setFormHrStart] = useState('');
  const [formHrEnd, setFormHrEnd] = useState('');
  const [formHrv, setFormHrv] = useState('');

  // Breathing Pacer State
  const [patternKey, setPatternKey] = useState<BreathingPatternKey>('box');
  const [isBreathingActive, setIsBreathingActive] = useState(false);
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('Inhale');
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(4);
  const [breathElapsed, setBreathElapsed] = useState(0);
  const breathPhaseRef = useRef<BreathPhase>('Inhale');
  breathPhaseRef.current = breathPhase;

  // Meditation Timer State
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerTargetSeconds, setTimerTargetSeconds] = useState(600); // 10 min default
  const [timerElapsed, setTimerElapsed] = useState(0);

  const getPatternName = (key: BreathingPatternKey) => {
    switch (key) {
      case 'box':
        return t('mindfulness.pacer.boxName', 'Box Breathing');
      case 'relax':
        return t('mindfulness.pacer.relaxName', '4-7-8 Relaxation');
      case 'coherence':
        return t('mindfulness.pacer.coherenceName', 'Coherent Resonance');
    }
  };

  const getPatternDesc = (key: BreathingPatternKey) => {
    switch (key) {
      case 'box':
        return t('mindfulness.pacer.boxDesc', 'Focus & Stress Relief');
      case 'relax':
        return t('mindfulness.pacer.relaxDesc', 'Deep Calm & Sleep Prep');
      case 'coherence':
        return t('mindfulness.pacer.coherenceDesc', 'HRV Maximization');
    }
  };

  const getPhaseName = (phase: BreathPhase) => {
    switch (phase) {
      case 'Inhale':
        return t('mindfulness.pacer.inhale', 'Inhale');
      case 'Hold':
        return t('mindfulness.pacer.hold', 'Hold');
      case 'Exhale':
        return t('mindfulness.pacer.exhale', 'Exhale');
      case 'Rest':
        return t('mindfulness.pacer.rest', 'Rest');
    }
  };

  // Breathing interval loop (ref-based phase tracking avoids drift and interval teardown churn)
  useEffect(() => {
    if (!isBreathingActive) return;

    const pattern = BREATHING_PATTERNS[patternKey];
    const timer = setInterval(() => {
      setBreathElapsed((prev) => prev + 1);

      setPhaseSecondsLeft((prev) => {
        if (prev <= 1) {
          const currentPhase = breathPhaseRef.current;
          let nextPhase: BreathPhase;
          let nextDuration: number;

          if (currentPhase === 'Inhale') {
            if (pattern.hold1 > 0) {
              nextPhase = 'Hold';
              nextDuration = pattern.hold1;
            } else {
              nextPhase = 'Exhale';
              nextDuration = pattern.exhale;
            }
          } else if (currentPhase === 'Hold') {
            nextPhase = 'Exhale';
            nextDuration = pattern.exhale;
          } else if (currentPhase === 'Exhale') {
            if (pattern.hold2 > 0) {
              nextPhase = 'Rest';
              nextDuration = pattern.hold2;
            } else {
              nextPhase = 'Inhale';
              nextDuration = pattern.inhale;
            }
          } else {
            nextPhase = 'Inhale';
            nextDuration = pattern.inhale;
          }

          breathPhaseRef.current = nextPhase;
          setBreathPhase(nextPhase);
          return nextDuration;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBreathingActive, patternKey]);

  // Meditation Timer interval loop
  useEffect(() => {
    if (!isTimerRunning) return;

    const interval = setInterval(() => {
      setTimerElapsed((prev) => {
        const next = prev + 1;
        if (timerTargetSeconds > 0 && next >= timerTargetSeconds) {
          setIsTimerRunning(false);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, timerTargetSeconds]);

  const handleStartBreathing = () => {
    const pattern = BREATHING_PATTERNS[patternKey];
    breathPhaseRef.current = 'Inhale';
    setBreathPhase('Inhale');
    setPhaseSecondsLeft(pattern.inhale);
    setBreathElapsed(0);
    setIsBreathingActive(true);
  };

  const handleStopBreathing = async () => {
    setIsBreathingActive(false);
    if (breathElapsed > 0) {
      await createSession({
        entry_date: selectedDate,
        duration_seconds: breathElapsed,
        session_type: 'breathwork',
        provider: 'manual',
        notes: `${getPatternName(patternKey)} session`,
      });
      setBreathElapsed(0);
    }
  };

  const handleStopTimer = async () => {
    setIsTimerRunning(false);
    if (timerElapsed > 0) {
      await createSession({
        entry_date: selectedDate,
        duration_seconds: timerElapsed,
        session_type: 'meditation',
        provider: 'manual',
      });
      setTimerElapsed(0);
    }
  };

  const handleOpenCreate = () => {
    setEditingSession(null);
    setFormMinutes('15');
    setFormSeconds('0');
    setFormType('meditation');
    setFormNotes('');
    setFormHrAvg('');
    setFormHrStart('');
    setFormHrEnd('');
    setFormHrv('');
    setIsLogDialogOpen(true);
  };

  const handleOpenEdit = (session: MindfulnessSessionResponse) => {
    setEditingSession(session);
    setFormMinutes(String(Math.floor(session.duration_seconds / 60)));
    setFormSeconds(String(session.duration_seconds % 60));
    setFormType(session.session_type);
    setFormNotes(session.notes || '');
    setFormHrAvg(
      session.heart_rate_avg != null ? String(session.heart_rate_avg) : ''
    );
    setFormHrStart(
      session.heart_rate_start != null ? String(session.heart_rate_start) : ''
    );
    setFormHrEnd(
      session.heart_rate_end != null ? String(session.heart_rate_end) : ''
    );
    setFormHrv(session.hrv_rmssd != null ? String(session.hrv_rmssd) : '');
    setIsLogDialogOpen(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(formMinutes, 10) || 0;
    const secs = parseInt(formSeconds, 10) || 0;
    const totalSeconds = mins * 60 + secs;
    if (totalSeconds <= 0) return;

    const payload: CreateMindfulnessSessionBody = {
      entry_date: selectedDate,
      duration_seconds: totalSeconds,
      session_type: formType,
      provider: editingSession?.provider || 'manual',
      notes: formNotes.trim() || null,
      heart_rate_avg: formHrAvg ? parseFloat(formHrAvg) : null,
      heart_rate_start: formHrStart ? parseInt(formHrStart, 10) : null,
      heart_rate_end: formHrEnd ? parseInt(formHrEnd, 10) : null,
      hrv_rmssd: formHrv ? parseFloat(formHrv) : null,
    };

    if (editingSession) {
      await updateSession({ id: editingSession.id, data: payload });
    } else {
      await createSession(payload);
    }
    setIsLogDialogOpen(false);
    setEditingSession(null);
    setFormNotes('');
    setFormHrAvg('');
    setFormHrStart('');
    setFormHrEnd('');
    setFormHrv('');
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSession(sessionToDelete);
      setSessionToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDurationDisplay = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m} min`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Overview Metric Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-background border-indigo-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-indigo-400 font-medium">
              <Sparkles className="w-4 h-4" />
              {t('mindfulness.stats.totalMinutes', 'Mindful Minutes Today')}
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
              {summary?.total_mindful_minutes ?? 0}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                min
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summary?.session_count ?? 0}{' '}
              {summary?.session_count === 1
                ? t('mindfulness.stats.recorded_one', 'session recorded')
                : t('mindfulness.stats.recorded_other', 'sessions recorded')}
            </p>
          </CardContent>
        </Card>

        {/* Quick Tool Launchers */}
        <Card className="flex flex-col justify-between border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-400 font-medium">
              <Wind className="w-4 h-4" />
              {t('mindfulness.pacer.title', 'Paced Breathing')}
            </CardDescription>
            <CardTitle className="text-lg font-semibold">
              {t('mindfulness.pacer.subtitle', 'Breathwork Guide')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveTool(activeTool === 'breathe' ? 'none' : 'breathe')
              }
              className="w-full border-blue-500/30 hover:bg-blue-500/10 text-blue-400"
            >
              {activeTool === 'breathe'
                ? t('mindfulness.pacer.hide', 'Hide Pacer')
                : t('mindfulness.pacer.launch', 'Launch Pacer')}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between border-purple-500/20 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-400 font-medium">
              <Timer className="w-4 h-4" />
              {t('mindfulness.timer.title', 'Meditation Timer')}
            </CardDescription>
            <CardTitle className="text-lg font-semibold">
              {t('mindfulness.timer.subtitle', 'Open / Timed Session')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveTool(activeTool === 'timer' ? 'none' : 'timer')
              }
              className="w-full border-purple-500/30 hover:bg-purple-500/10 text-purple-400"
            >
              {activeTool === 'timer'
                ? t('mindfulness.timer.hide', 'Hide Timer')
                : t('mindfulness.timer.launch', 'Launch Timer')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Tool: Breathwork Pacer */}
      {activeTool === 'breathe' && (
        <Card className="border-blue-500/30 bg-blue-950/20 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Wind className="w-5 h-5 text-blue-400" />
                  {getPatternName(patternKey)}
                </CardTitle>
                <CardDescription>{getPatternDesc(patternKey)}</CardDescription>
              </div>

              {!isBreathingActive && (
                <div className="flex gap-2">
                  {(
                    Object.keys(
                      BREATHING_PATTERNS
                    ) as (keyof typeof BREATHING_PATTERNS)[]
                  ).map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={patternKey === key ? 'secondary' : 'ghost'}
                      onClick={() => setPatternKey(key)}
                      className="text-xs"
                    >
                      {getPatternName(key).split(' ')[0]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="relative flex items-center justify-center w-52 h-52 mb-6">
              <div
                className={`absolute rounded-full border-2 border-blue-400/40 transition-all duration-1000 ease-in-out ${
                  isBreathingActive && breathPhase === 'Inhale'
                    ? 'w-48 h-48 bg-blue-500/20 scale-100'
                    : isBreathingActive && breathPhase === 'Hold'
                      ? 'w-48 h-48 bg-indigo-500/30 scale-100'
                      : isBreathingActive && breathPhase === 'Exhale'
                        ? 'w-24 h-24 bg-blue-500/10 scale-75'
                        : 'w-32 h-32 bg-blue-500/10 scale-90'
                }`}
              />
              <div className="z-10 text-center">
                <p className="text-2xl font-bold tracking-wide text-foreground">
                  {isBreathingActive
                    ? getPhaseName(breathPhase)
                    : t('mindfulness.pacer.ready', 'Ready')}
                </p>
                {isBreathingActive && (
                  <p className="text-4xl font-extrabold text-blue-400 mt-1 font-mono">
                    {phaseSecondsLeft}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {!isBreathingActive ? (
                <Button
                  onClick={handleStartBreathing}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {t('mindfulness.pacer.begin', 'Begin Breathing')}
                </Button>
              ) : (
                <Button
                  onClick={handleStopBreathing}
                  variant="destructive"
                  className="px-8"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {t(
                    'mindfulness.pacer.complete2',
                    'Complete ({{breathElapsed}})',
                    { breathElapsed: formatSeconds(breathElapsed) }
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive Tool: Meditation Timer */}
      {activeTool === 'timer' && (
        <Card className="border-purple-500/30 bg-purple-950/20 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Timer className="w-5 h-5 text-purple-400" />
                  {t('mindfulness.timer.heading', 'Meditation Session Timer')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'mindfulness.timer.description',
                    'Quiet focus with automated completion recording'
                  )}
                </CardDescription>
              </div>

              {!isTimerRunning && timerElapsed === 0 && (
                <div className="flex gap-2">
                  {[300, 600, 900, 1200].map((sec) => (
                    <Button
                      key={sec}
                      size="sm"
                      variant={
                        timerTargetSeconds === sec ? 'secondary' : 'ghost'
                      }
                      onClick={() => setTimerTargetSeconds(sec)}
                      className="text-xs"
                    >
                      {sec / 60}m
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="text-6xl font-mono font-bold tracking-tight text-foreground mb-6">
              {formatSeconds(timerElapsed)}
              {timerTargetSeconds > 0 && (
                <span className="text-xl font-normal text-muted-foreground ml-2">
                  / {formatSeconds(timerTargetSeconds)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {!isTimerRunning ? (
                <Button
                  onClick={() => setIsTimerRunning(true)}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-8"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {timerElapsed > 0
                    ? t('mindfulness.timer.resume', 'Resume')
                    : t('mindfulness.timer.start', 'Start Timer')}
                </Button>
              ) : (
                <Button
                  onClick={() => setIsTimerRunning(false)}
                  variant="outline"
                  className="px-8"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {t('mindfulness.timer.pause', 'Pause')}
                </Button>
              )}

              {timerElapsed > 0 && (
                <Button
                  onClick={handleStopTimer}
                  variant="secondary"
                  className="px-6"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t('mindfulness.timer.saveAndFinish', 'Save & Finish')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Logged Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg">
              {t('mindfulness.history.title', 'Today’s Sessions')}
            </CardTitle>
            <CardDescription>
              {t(
                'mindfulness.history.subtitle',
                'Wearable imports and manual entries for {{date}}',
                { date: selectedDate }
              )}
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('mindfulness.actions.logManual', 'Log Session')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('mindfulness.history.loading', 'Loading mindfulness data...')}
            </div>
          ) : !summary?.sessions || summary.sessions.length === 0 ? (
            <div className="py-10 text-center border border-dashed rounded-xl border-border/60">
              <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium text-foreground">
                {t(
                  'mindfulness.history.emptyTitle',
                  'No mindfulness sessions recorded for this day'
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {t(
                  'mindfulness.history.emptyDescription',
                  'Take a quick 5-minute breathing break, meditate, or log a wearable session from Apple Health / Garmin.'
                )}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {summary.sessions.map((session) => (
                <div
                  key={session.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm capitalize">
                        {t(
                          `mindfulness.types.${session.session_type}`,
                          session.session_type
                        )}
                      </span>
                      {session.provider && session.provider !== 'manual' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase"
                        >
                          {session.provider.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatDurationDisplay(session.duration_seconds)}
                      </span>

                      {session.heart_rate_avg != null && (
                        <span className="flex items-center gap-1 text-rose-500 font-medium">
                          <Heart className="w-3 h-3 fill-rose-500/20" />
                          {session.heart_rate_avg} bpm
                        </span>
                      )}

                      {session.hrv_rmssd != null && (
                        <span className="flex items-center gap-1 text-indigo-400 font-medium">
                          <Activity className="w-3 h-3" />
                          {t(
                            'checkIn.mindfulnessSection.hrvMs',
                            'HRV {{hrv_rmssd}} ms',
                            { hrv_rmssd: session.hrv_rmssd }
                          )}
                        </span>
                      )}

                      {session.notes && (
                        <span className="italic text-foreground/80">
                          "{session.notes}"
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground h-8 w-8"
                      onClick={() => handleOpenEdit(session)}
                      title={t('mindfulness.actions.edit', 'Edit session')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                      onClick={() => setSessionToDelete(session.id)}
                      title={t('mindfulness.actions.delete', 'Delete session')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Entry Dialog */}
      <Dialog
        open={isLogDialogOpen}
        onOpenChange={(open) => {
          setIsLogDialogOpen(open);
          if (!open) setEditingSession(null);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingSession
                ? t('mindfulness.dialog.editTitle', 'Edit Mindfulness Session')
                : t(
                    'mindfulness.dialog.createTitle',
                    'Log Mindfulness Session'
                  )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="minutes">
                  {t('mindfulness.dialog.minutes', 'Minutes')}
                </Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="15"
                  value={formMinutes}
                  onChange={(e) => setFormMinutes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seconds">
                  {t('mindfulness.dialog.seconds', 'Seconds')}
                </Label>
                <Input
                  id="seconds"
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  placeholder="0"
                  value={formSeconds}
                  onChange={(e) => setFormSeconds(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sessionType">
                {t('mindfulness.dialog.type', 'Type')}
              </Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meditation">
                    {t('mindfulness.types.meditation', 'Meditation')}
                  </SelectItem>
                  <SelectItem value="breathwork">
                    {t('mindfulness.types.breathwork', 'Breathwork')}
                  </SelectItem>
                  <SelectItem value="reflection">
                    {t('mindfulness.types.reflection', 'Reflection')}
                  </SelectItem>
                  <SelectItem value="walking">
                    {t('mindfulness.types.walking', 'Mindful Walking')}
                  </SelectItem>
                  <SelectItem value="yoga">
                    {t('mindfulness.types.yoga', 'Yoga')}
                  </SelectItem>
                  <SelectItem value="other">
                    {t('mindfulness.types.other', 'Other')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="hrAvg">
                  {t('mindfulness.dialog.hrAvg', 'Avg Heart Rate (bpm)')}
                </Label>
                <Input
                  id="hrAvg"
                  type="number"
                  placeholder="e.g. 68"
                  value={formHrAvg}
                  onChange={(e) => setFormHrAvg(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hrv">
                  {t('mindfulness.dialog.hrv', 'HRV RMSSD (ms)')}
                </Label>
                <Input
                  id="hrv"
                  type="number"
                  placeholder="e.g. 55"
                  value={formHrv}
                  onChange={(e) => setFormHrv(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="hrStart">
                  {t('mindfulness.dialog.hrStart', 'Start HR (bpm)')}
                </Label>
                <Input
                  id="hrStart"
                  type="number"
                  placeholder="e.g. 78"
                  value={formHrStart}
                  onChange={(e) => setFormHrStart(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hrEnd">
                  {t('mindfulness.dialog.hrEnd', 'End HR (bpm)')}
                </Label>
                <Input
                  id="hrEnd"
                  type="number"
                  placeholder="e.g. 62"
                  value={formHrEnd}
                  onChange={(e) => setFormHrEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                {t('mindfulness.dialog.notes', 'Notes')}
              </Label>
              <Textarea
                id="notes"
                placeholder={t(
                  'mindfulness.dialog.notesPlaceholder',
                  'How did this session feel?'
                )}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsLogDialogOpen(false);
                  setEditingSession(null);
                }}
              >
                {t('mindfulness.actions.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {editingSession
                  ? isUpdating
                    ? t('mindfulness.actions.saving', 'Saving...')
                    : t('mindfulness.dialog.update', 'Update Session')
                  : isCreating
                    ? t('mindfulness.actions.saving', 'Saving...')
                    : t('mindfulness.dialog.save', 'Save Session')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!sessionToDelete}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                'mindfulness.deleteDialog.title',
                'Delete Mindfulness Session'
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'mindfulness.deleteDialog.description',
                'Are you sure you want to delete this mindfulness session? This action cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('mindfulness.actions.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting
                ? t('mindfulness.deleteDialog.deleting', 'Deleting...')
                : t('mindfulness.deleteDialog.confirm', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
