import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import ProgramActionRow from '../components/recording/ProgramActionRow';
import RecordingSwitchRow from '../components/recording/RecordingSwitchRow';
import HeartRateBandCard from '../components/recording/HeartRateBandCard';
import SuggestedRangesCard from '../components/recording/SuggestedRangesCard';
import PaceBandCard, {
  type PaceBandChoice,
} from '../components/recording/PaceBandCard';
import RecordingVoiceCard from '../components/recording/RecordingVoiceCard';
import CheckInCard from '../components/recording/CheckInCard';
import SegmentedControl from '../components/SegmentedControl';
import { SplitRow, Stat } from '../components/recording/SplitRow';
import RunProgramSelect from '../components/recording/RunProgramSelect';
import {
  programTitle,
  programWorkoutLabel,
} from '../components/recording/RunProgramCard';
import GpsSignalBadge from '../components/recording/GpsSignalBadge';
import IntervalCard from '../components/recording/IntervalCard';
import IntervalSetup, {
  DEFAULT_CUSTOM_INTERVALS,
  usesWorkDistance,
  type IntervalChoice,
} from '../components/recording/IntervalSetup';
import RouteMap from '../components/exerciseStats/RouteMap';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useIndoorDistanceEstimate } from '../hooks/useIndoorDistanceEstimate';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { usePreferences } from '../hooks/usePreferences';
import { useSuggestedRanges } from '../hooks/useSuggestedRanges';
import { useWatchConnectivity } from '../hooks/useWatchConnectivity';
import { startRunOnWatch } from '../services/watchRunControl';
import { buildWatchStartPlan } from '../utils/watchRunPlans';
import { useRecordingHeartRate } from '../stores/liveHeartRateStore';
import { notificationText } from '../utils/recordingNotification';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import {
  RecordingPermissionError,
  discardRecording,
  elapsedSeconds,
  planCompleted,
  finishRecording,
  COUNTDOWN_CHOICES,
  getHeartRateSamples,
  getRecordingPreferences,
  setHeartRateBandPreference,
  setPaceBandPreference,
  setRecordingHeartRateBand,
  setRecordingPaceBand,
  hydrate,
  markLap,
  pauseRecording,
  resumeRecording,
  setRecordingAudioCues,
  setRecordingAutoPause,
  setCheckInPreference,
  setCountdownPreference,
  setRecordingCheckIn,
  setRecordingPreference,
  startRecording,
  tickIntervals,
  useGpsRecording,
} from '../services/gpsRecordingService';
import {
  applyHeartRateTargets,
  applyPaceTargets,
  type HeartRateBand,
  buildIntervalPlan,
  INTERVAL_PRESETS,
  intervalPosition,
  type IntervalOptions,
  type IntervalPlan,
  type PaceBand,
  type RunProgramResponse,
  zoneShiftForEffort,
  type StepEffort,
} from '@workspace/shared';
import {
  completeProgramWorkout,
  useRunProgram,
} from '../services/runProgramService';
import { runProgramQueryKey } from '../hooks/queryKeys';
import { programSummary } from '../utils/runProgramSummary';
import {
  averageHeartRate,
  buildRunSummary,
  type RunSummaryParams,
} from '../utils/runSummary';
import { toLocalDateString } from '../utils/dateUtils';
import { saveRecordedActivity } from '../services/gpsRecordingSave';
import { useShoeMutations } from '../hooks/useShoes';
import { promptToRetireShoe } from '../utils/retireShoePrompt';
import { fireSelectionHaptic } from '../services/haptics';
import { addLog } from '../services/LogService';
import {
  beginRecordingCues,
  speakRecordingCue,
  stopRecordingCues,
} from '../services/recordingCues';
import {
  computeLaps,
  computeSplits,
  currentPaceSecondsPerUnit,
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  splitBars,
  summarizeRecording,
  type RecordingActivity,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';

/** A starting band: 5:00 to 5:30 per km, 8:00 to 8:50 per mile. */
const defaultPaceBand = (unit: 'km' | 'miles'): PaceBandChoice =>
  unit === 'miles'
    ? { fastest: 480, slowest: 530 }
    : { fastest: 300, slowest: 330 };

/** Starting heart-rate ranges: a steady aerobic one, and for fast and easy stretches. */
const DEFAULT_HEART_RATE_BAND: HeartRateBand = { minBpm: 130, maxBpm: 150 };
const DEFAULT_WORK_HEART_RATE_BAND: HeartRateBand = {
  minBpm: 160,
  maxBpm: 175,
};
const DEFAULT_EASY_HEART_RATE_BAND: HeartRateBand = {
  minBpm: 120,
  maxBpm: 140,
};
/** And for the warm-up and cool-down, an easy zone below the easy stretches. */
const DEFAULT_WARM_HEART_RATE_BAND: HeartRateBand = {
  minBpm: 100,
  maxBpm: 125,
};

/** One of a plan's heart-rate ranges as chosen on this screen. */
interface HeartRateTargetChoice {
  enabled: boolean;
  band: HeartRateBand | null;
}

/** One of a plan's pace ranges as chosen on this screen. */
interface PaceTargetChoice {
  enabled: boolean;
  /** In the display unit; null until the person moves it. */
  band: PaceBandChoice | null;
}

/** Starting ranges for a plan's fast stretches: 4:30-5:00/km, 7:15-8:00/mi. */
const defaultWorkPaceBand = (unit: 'km' | 'miles'): PaceBandChoice =>
  unit === 'miles'
    ? { fastest: 435, slowest: 480 }
    : { fastest: 270, slowest: 300 };

/** And for its easy stretches: 6:00-7:00/km, 9:40-11:15/mi. */
const defaultEasyPaceBand = (unit: 'km' | 'miles'): PaceBandChoice =>
  unit === 'miles'
    ? { fastest: 580, slowest: 675 }
    : { fastest: 360, slowest: 420 };

/** And for its warm-up and cool-down, up to a walk: 6:30-15:00/km, 10:30-24:10/mi. */
const defaultWarmPaceBand = (unit: 'km' | 'miles'): PaceBandChoice =>
  unit === 'miles'
    ? { fastest: 630, slowest: 1450 }
    : { fastest: 390, slowest: 900 };

/** The band the service takes: seconds per kilometre. */
const paceBandPerKm = (band: PaceBandChoice, unit: 'km' | 'miles') => {
  const perKm = unit === 'miles' ? 1 / 1.609344 : 1;
  return {
    minSecondsPerKm: band.fastest * perKm,
    maxSecondsPerKm: band.slowest * perKm,
  };
};

/** A saved band (seconds per km) as the card shows it, in the display unit. */
const paceBandInUnit = (
  band: { minSecondsPerKm: number; maxSecondsPerKm: number },
  unit: 'km' | 'miles'
): PaceBandChoice => {
  const perUnit = unit === 'miles' ? 1.609344 : 1;
  return {
    fastest: Math.round((band.minSecondsPerKm * perUnit) / 5) * 5,
    slowest: Math.round((band.maxSecondsPerKm * perUnit) / 5) * 5,
  };
};

type Props = RootStackScreenProps<'RecordActivity'>;

const FEET_PER_METER = 3.28084;

/** "Outdoor run", "Indoor walk", "Ride": what a recording is, for its header. */
function recordingTitle(
  t: TFunction,
  activity: RecordingActivity,
  indoor: boolean
): string {
  switch (activity) {
    case 'walk':
      return indoor
        ? t('recordActivity.title.indoorWalk', { defaultValue: 'Indoor walk' })
        : t('recordActivity.title.outdoorWalk', {
            defaultValue: 'Outdoor walk',
          });
    case 'ride':
      return indoor
        ? t('recordActivity.title.indoorRide', { defaultValue: 'Indoor ride' })
        : t('recordActivity.title.outdoorRide', {
            defaultValue: 'Outdoor ride',
          });
    default:
      return indoor
        ? t('recordActivity.title.indoorRun', { defaultValue: 'Indoor run' })
        : t('recordActivity.title.outdoorRun', { defaultValue: 'Outdoor run' });
  }
}

const RecordActivityScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { updateMutation: updateShoe } = useShoeMutations();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });

  const { session, points } = useGpsRecording();
  const heartRate = useRecordingHeartRate(session?.id ?? null);
  const [activity, setActivity] = useState<RecordingActivity>('run');
  const [busy, setBusy] = useState(false);
  const { isSupported: watchSupported, isPaired: watchPaired } =
    useWatchConnectivity();
  // Outdoors or indoors (a treadmill: no GPS), chosen first; then, for a walk
  // or run with a paired watch, which device records it. A ride is
  // phone-only.
  const [indoor, setIndoor] = useState(false);
  const [recordWith, setRecordWith] = useState<'phone' | 'watch'>('phone');
  const watchAvailable = watchSupported && watchPaired && activity !== 'ride';
  const onWatch = watchAvailable && recordWith === 'watch';
  const [autoPause, setAutoPause] = useState(true);
  const [audioCues, setAudioCues] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [checkInMinutes, setCheckInMinutes] = useState(0);
  const [heartRateAlert, setHeartRateAlert] = useState(false);
  const [heartRateBand, setHeartRateBand] = useState<HeartRateBand | null>(
    null
  );
  const [workHeartRate, setWorkHeartRate] = useState<HeartRateTargetChoice>({
    enabled: false,
    band: null,
  });
  const [easyHeartRate, setEasyHeartRate] = useState<HeartRateTargetChoice>({
    enabled: false,
    band: null,
  });
  const [warmHeartRate, setWarmHeartRate] = useState<HeartRateTargetChoice>({
    enabled: false,
    band: null,
  });
  const [paceAlert, setPaceAlert] = useState(false);
  const [paceBand, setPaceBand] = useState<PaceBandChoice | null>(null);
  // The range last saved (seconds per km), shown until the person changes it.
  const [savedPaceBand, setSavedPaceBand] = useState<{
    minSecondsPerKm: number;
    maxSecondsPerKm: number;
  } | null>(null);
  const currentPaceBand =
    paceBand ??
    (savedPaceBand
      ? paceBandInUnit(savedPaceBand, distanceUnit)
      : defaultPaceBand(distanceUnit));
  const [intervalChoice, setIntervalChoice] = useState<IntervalChoice>('off');
  const [customIntervals, setCustomIntervals] = useState<IntervalOptions>(
    DEFAULT_CUSTOM_INTERVALS
  );
  const {
    status: storedProgram,
    enabled: programEnabled,
    loaded: programLoaded,
    effortSuggestion,
  } = useRunProgram();
  // The program only drives the screen while the person has it switched on.
  const programStatus = programEnabled ? storedProgram : null;
  const programWorkout = programStatus?.workout ?? null;
  // Today's program workout is chosen only when the person came here to do it
  // (the Diary card's Start, or Start today's workout); otherwise it is just
  // offered on its own card, because most recordings are a plain walk or run.
  const wantsProgramWorkout = route.params?.programWorkout === true;
  const programApplied = useRef(false);
  useEffect(() => {
    if (!wantsProgramWorkout || programApplied.current || !programLoaded)
      return;
    programApplied.current = true;
    if (programWorkout && programStatus) {
      setActivity(programStatus.program.activity);
      setIntervalChoice('program');
    }
  }, [wantsProgramWorkout, programLoaded, programWorkout, programStatus]);
  // A program that ended or was left while it was chosen.
  useEffect(() => {
    if (intervalChoice === 'program' && programLoaded && !programWorkout) {
      setIntervalChoice('off');
    }
  }, [intervalChoice, programLoaded, programWorkout]);
  // The run/walk presets are not offered for a walk or ride, so switching to
  // one drops a run/walk preset rather than leaving a choice the picker lacks.
  useEffect(() => {
    if (activity === 'run') return;
    const preset = INTERVAL_PRESETS.find((p) => p.id === intervalChoice);
    if (preset?.options.style === 'runWalk') setIntervalChoice('off');
  }, [activity, intervalChoice]);
  // Optional pace ranges for a plan's fast and easy stretches, this run only.
  // Paces for tempo, marathon-pace and stride stretches, set from a recent race.
  const [effortPace, setEffortPace] = useState<Partial<
    Record<StepEffort, PaceBand>
  > | null>(null);
  const [workPace, setWorkPace] = useState<PaceTargetChoice>({
    enabled: false,
    band: null,
  });
  const [easyPace, setEasyPace] = useState<PaceTargetChoice>({
    enabled: false,
    band: null,
  });
  const [warmPace, setWarmPace] = useState<PaceTargetChoice>({
    enabled: false,
    band: null,
  });
  const workBand = workPace.band ?? defaultWorkPaceBand(distanceUnit);
  const easyBand = easyPace.band ?? defaultEasyPaceBand(distanceUnit);
  // Distance steps follow GPS distance, so going indoors drops a distance
  // plan: Custom goes back to timed work, a distance preset to no plan.
  useEffect(() => {
    if (!indoor) return;
    if (intervalChoice === 'custom') {
      if (usesWorkDistance(customIntervals)) {
        setCustomIntervals({
          ...customIntervals,
          workMeters: undefined,
          workUnit: undefined,
        });
      }
      return;
    }
    const preset = INTERVAL_PRESETS.find((p) => p.id === intervalChoice);
    if (preset && usesWorkDistance(preset.options)) setIntervalChoice('off');
  }, [indoor, intervalChoice, customIntervals]);
  const [warmOpen, setWarmOpen] = useState(false);
  const warmBand = warmPace.band ?? defaultWarmPaceBand(distanceUnit);
  const basePlan = useMemo<IntervalPlan | undefined>(() => {
    if (intervalChoice === 'off') return undefined;
    if (intervalChoice === 'program') return programWorkout?.plan;
    const plan =
      intervalChoice === 'custom'
        ? buildIntervalPlan(customIntervals)
        : (() => {
            const preset = INTERVAL_PRESETS.find(
              (p) => p.id === intervalChoice
            );
            return preset ? buildIntervalPlan(preset.options) : undefined;
          })();
    // A walk or ride has no running in it: its steps are Fast and Easy, so
    // the card, the spoken cues and the watch never say "Run" during one.
    return plan && activity !== 'run' && plan.style === 'runWalk'
      ? { ...plan, style: 'fastEasy' }
      : plan;
  }, [intervalChoice, customIntervals, programWorkout, activity]);
  const workHeartRateBand = workHeartRate.band ?? DEFAULT_WORK_HEART_RATE_BAND;
  const easyHeartRateBand = easyHeartRate.band ?? DEFAULT_EASY_HEART_RATE_BAND;
  const warmHeartRateBand = warmHeartRate.band ?? DEFAULT_WARM_HEART_RATE_BAND;
  const warmParts: string[] = [];
  if (warmPace.enabled) {
    warmParts.push(
      `${formatClock(warmBand.fastest)}–${formatClock(warmBand.slowest)}/${unitLabel}`
    );
  }
  if (warmHeartRate.enabled && watchAvailable) {
    warmParts.push(
      `${warmHeartRateBand.minBpm}–${warmHeartRateBand.maxBpm} ${t('recordActivity.unitBpm', { defaultValue: 'bpm' })}`
    );
  }
  const warmSummary =
    warmParts.length > 0
      ? warmParts.join(' · ')
      : t('recordActivity.warmRanges.off', { defaultValue: 'Off' });
  const currentHeartRateBand = heartRateBand ?? DEFAULT_HEART_RATE_BAND;
  const intervalPlan = useMemo<IntervalPlan | undefined>(
    () =>
      basePlan
        ? applyHeartRateTargets(
            applyPaceTargets(basePlan, {
              work: workPace.enabled
                ? paceBandPerKm(workBand, distanceUnit)
                : null,
              easy: easyPace.enabled
                ? paceBandPerKm(easyBand, distanceUnit)
                : null,
              warm: warmPace.enabled
                ? paceBandPerKm(warmBand, distanceUnit)
                : null,
              byEffort: workPace.enabled
                ? (effortPace ?? undefined)
                : undefined,
            }),
            {
              work: workHeartRate.enabled ? workHeartRateBand : null,
              easy: easyHeartRate.enabled ? easyHeartRateBand : null,
              warm: warmHeartRate.enabled ? warmHeartRateBand : null,
            }
          )
        : undefined,
    [
      basePlan,
      workPace.enabled,
      easyPace.enabled,
      warmPace.enabled,
      effortPace,
      workBand,
      easyBand,
      warmBand,
      distanceUnit,
      workHeartRate.enabled,
      easyHeartRate.enabled,
      warmHeartRate.enabled,
      workHeartRateBand,
      easyHeartRateBand,
      warmHeartRateBand,
    ]
  );
  // Starting ranges for the plan's fast and easy stretches, offered with a tap.
  const showPlanTargets = intervalChoice !== 'off' && (!indoor || onWatch);
  // How the last two rated workouts felt re-paces the suggestions: two hard
  // ones slow every zone, two easy ones speed them up.
  const paceShift = zoneShiftForEffort(
    programEnabled ? effortSuggestion : null
  );
  const suggested = useSuggestedRanges(activity, showPlanTargets, paceShift);
  const suggestedPaceChoice = useMemo(() => {
    if (!suggested.pace) return null;
    const perUnit = distanceUnit === 'miles' ? 1.609344 : 1;
    const choice = (band: {
      minSecondsPerKm: number;
      maxSecondsPerKm: number;
    }) => ({
      fastest: Math.round((band.minSecondsPerKm * perUnit) / 5) * 5,
      slowest: Math.round((band.maxSecondsPerKm * perUnit) / 5) * 5,
    });
    const efforts: Record<string, ReturnType<typeof choice>> = {};
    for (const effort of ['tempo', 'marathon', 'stride'] as const) {
      const band = suggested.byEffort?.[effort];
      if (band) efforts[effort] = choice(band);
    }
    return {
      work: choice(suggested.pace.work),
      easy: choice(suggested.pace.easy),
      warm: choice(suggested.pace.warm),
      sessions: suggested.pace.sessions,
      race: suggested.pace.race,
      efforts,
    };
  }, [suggested.pace, suggested.byEffort, distanceUnit]);
  // Tempo, stride and marathon-pace ranges come from the saved race; once it is
  // cleared or the activity changes, the ranges applied from it no longer apply.
  useEffect(() => {
    setEffortPace(null);
  }, [suggested.byEffort]);
  const suggestedHeartRate = watchAvailable ? suggested.heartRate : null;
  const useSuggestedRangesNow = () => {
    if (suggestedPaceChoice) {
      setWorkPace({ enabled: true, band: suggestedPaceChoice.work });
      setEasyPace({ enabled: true, band: suggestedPaceChoice.easy });
      setWarmPace({ enabled: true, band: suggestedPaceChoice.warm });
      setEffortPace(suggested.byEffort);
    }
    if (suggestedHeartRate) {
      setWorkHeartRate({ enabled: true, band: suggestedHeartRate.work });
      setEasyHeartRate({ enabled: true, band: suggestedHeartRate.easy });
      setWarmHeartRate({ enabled: true, band: suggestedHeartRate.warm });
    }
  };
  // Seconds left before recording begins, or null when no countdown is running.
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [permissionProblem, setPermissionProblem] = useState<
    'denied' | 'services-disabled' | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  // Whether the check for a recording an earlier run left on disk has finished.
  // Until it has, the screen cannot tell "nothing recording" from "not loaded
  // yet", and would show Start for a moment before jumping to a live recording.
  const [ready, setReady] = useState(false);
  // Set when the person taps Start here, so a session that is already there
  // when the screen opens can be told apart from one started on this visit.
  const [startedHere, setStartedHere] = useState(false);
  // Null until the person types: the field then shows the step-based estimate,
  // and clearing it leaves it empty rather than bringing the estimate back.
  const [indoorDistanceText, setIndoorDistanceText] = useState<string | null>(
    null
  );
  // A change made before the stored preferences load must not be overwritten
  // by that read. Each flag is set in the control that changes it.
  const preferenceEdits = useRef({
    autoPause: false,
    audioCues: false,
    countdownSeconds: false,
    checkInMinutes: false,
    paceAlert: false,
    heartRateAlert: false,
  });

  // While a recording is going, the header names it ("Outdoor run"), so the
  // screen always says what is being recorded.
  const liveTitle = session
    ? recordingTitle(t, session.activity, session.indoor === true)
    : t('screens.recordActivity', { defaultValue: 'Record Activity' });
  useScreenHeader({
    title: liveTitle,
    nativeTitle: liveTitle,
    left: { kind: 'back' },
  });

  // Pick up a recording an earlier run left behind (app killed mid-activity).
  useEffect(() => {
    let active = true;
    void getRecordingPreferences().then((preferences) => {
      if (!active) return;
      if (!preferenceEdits.current.autoPause) {
        setAutoPause(preferences.autoPause);
      }
      if (!preferenceEdits.current.audioCues) {
        setAudioCues(preferences.audioCues);
      }
      if (!preferenceEdits.current.checkInMinutes) {
        setCheckInMinutes(preferences.checkInMinutes);
      }
      if (!preferenceEdits.current.countdownSeconds) {
        setCountdownSeconds(preferences.countdownSeconds);
      }
      // Only the ranges come back: an alert is switched on per run.
      if (!preferenceEdits.current.heartRateAlert) {
        setHeartRateBand(preferences.heartRateBand ?? null);
      }
      if (!preferenceEdits.current.paceAlert) {
        setSavedPaceBand(preferences.paceBand ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void hydrate().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const isLive = session?.status === 'recording';
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Each second, let a timed plan move on to its next step.
  const hasIntervals =
    Boolean(session?.intervals) || Boolean(session?.checkInMinutes);
  useEffect(() => {
    if (!isLive || !hasIntervals) return;
    void tickIntervals();
  }, [isLive, hasIntervals, now]);

  const summary = useMemo(() => summarizeRecording(points), [points]);
  const mapPoints = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.t).toISOString(),
        lat: p.lat,
        lon: p.lon,
      })),
    [points]
  );
  const splits = useMemo(
    () =>
      session?.status === 'finished' ? computeSplits(points, unitMeters) : [],
    [points, session?.status, unitMeters]
  );
  const lapMarks = session?.laps;
  const laps = useMemo(
    () =>
      session?.status === 'finished' && lapMarks && lapMarks.length > 0
        ? computeLaps(points, lapMarks, session.finishedAt ?? undefined)
        : [],
    [points, session?.status, session?.finishedAt, lapMarks]
  );
  const splitBarsFor = useMemo(
    () => splitBars(splits, unitMeters),
    [splits, unitMeters]
  );
  const lapBarsFor = useMemo(
    () => splitBars(laps, unitMeters),
    [laps, unitMeters]
  );

  const run = useCallback(
    async (work: () => Promise<void>, failure: string) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        if (error instanceof RecordingPermissionError) {
          setPermissionProblem(error.reason);
        } else {
          addLog(`[GPS Recording] ${failure}: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: failure,
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  const handleStart = useCallback(
    () =>
      run(
        async () => {
          setPermissionProblem(null);
          if (onWatch) {
            const meta =
              intervalChoice === 'program' && programStatus
                ? {
                    id: programStatus.program.id,
                    name: programTitle(t, programStatus.program),
                    program: {
                      id: programStatus.program.id,
                      index: programStatus.done,
                      activity: programStatus.program.activity,
                    },
                  }
                : {
                    id: intervalChoice,
                    name: t('recordActivity.watch.planName', {
                      defaultValue: 'Intervals',
                    }),
                  };
            await startRunOnWatch({
              kind: activity,
              place: indoor ? 'indoor' : 'outdoor',
              autoPause,
              voiceCues: audioCues,
              checkInMinutes,
              ...(paceAlert
                ? { paceBand: paceBandPerKm(currentPaceBand, distanceUnit) }
                : {}),
              ...(heartRateAlert
                ? { heartRateBand: currentHeartRateBand }
                : {}),
              plan: intervalPlan
                ? buildWatchStartPlan(t, intervalPlan, meta)
                : undefined,
            });
            navigation.navigate('WatchRunLive');
            return;
          }
          // Before the await: the session publishes inside startRecording, and
          // the "already recording" notice must not flash for one render.
          setStartedHere(true);
          await startRecording({
            activity,
            // Indoors there are no location fixes for it to judge by.
            autoPause: autoPause && !indoor,
            audioCues: audioCues
              ? distanceUnit === 'miles'
                ? 'miles'
                : 'km'
              : undefined,
            intervals: intervalPlan,
            checkInMinutes: audioCues ? checkInMinutes : 0,
            indoor,
            paceBand:
              paceAlert && !indoor && activity !== 'ride'
                ? paceBandPerKm(currentPaceBand, distanceUnit)
                : undefined,
            heartRateBand:
              heartRateAlert && !indoor && activity !== 'ride'
                ? currentHeartRateBand
                : undefined,
            program:
              intervalChoice === 'program' && programStatus && intervalPlan
                ? { id: programStatus.program.id, index: programStatus.done }
                : undefined,
            notification: notificationText(t, activity),
          });
        },
        t('recordActivity.errors.start', {
          defaultValue: 'Could not start recording',
        })
      ),
    [
      activity,
      audioCues,
      checkInMinutes,
      autoPause,
      paceAlert,
      currentPaceBand,
      heartRateAlert,
      currentHeartRateBand,
      distanceUnit,
      indoor,
      intervalChoice,
      intervalPlan,
      navigation,
      onWatch,
      programStatus,
      run,
      t,
    ]
  );
  // Counts down once a second, then starts. Each number is felt and, with
  // voice cues on, spoken.
  useEffect(() => {
    if (countdownLeft === null) return;
    if (countdownLeft === 0) {
      setCountdownLeft(null);
      void handleStart();
      return;
    }
    fireSelectionHaptic();
    if (audioCues) speakRecordingCue(String(countdownLeft));
    const id = setTimeout(() => setCountdownLeft(countdownLeft - 1), 1000);
    return () => clearTimeout(id);
  }, [countdownLeft, audioCues, handleStart]);

  const handleStartPress = useCallback(() => {
    if (countdownSeconds === 0) {
      void handleStart();
      return;
    }
    setPermissionProblem(null);
    if (audioCues) beginRecordingCues();
    setCountdownLeft(countdownSeconds);
  }, [audioCues, countdownSeconds, handleStart]);

  const cancelCountdown = useCallback(() => {
    setCountdownLeft(null);
    if (audioCues) stopRecordingCues();
  }, [audioCues]);

  const handleResume = useCallback(
    () =>
      run(
        () =>
          resumeRecording(notificationText(t, session?.activity ?? activity)),
        t('recordActivity.errors.resume', {
          defaultValue: 'Could not resume recording',
        })
      ),
    [activity, run, session?.activity, t]
  );

  const handleFinish = useCallback(
    () =>
      run(
        finishRecording,
        t('recordActivity.errors.finish', {
          defaultValue: 'Could not finish recording',
        })
      ),
    [run, t]
  );

  const handleDiscard = useCallback(() => {
    Alert.alert(
      t('recordActivity.discard.title', {
        defaultValue: 'Discard this activity?',
      }),
      t('recordActivity.discard.message', {
        defaultValue: 'The recorded route and stats will be deleted.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('recordActivity.discard.confirm', {
            defaultValue: 'Discard',
          }),
          style: 'destructive',
          onPress: () =>
            void run(
              async () => {
                await discardRecording();
                // The screen stays mounted. A distance typed for this session
                // must not be offered as the next one's estimate.
                setIndoorDistanceText(null);
              },
              t('recordActivity.errors.discard', {
                defaultValue: 'Could not discard recording',
              })
            ),
        },
      ]
    );
  }, [run, t]);

  const indoorEstimate = useIndoorDistanceEstimate(session);
  const estimateText = indoorEstimate
    ? ((indoorEstimate.distanceKm * METERS_PER_KM) / unitMeters).toFixed(2)
    : '';
  const shownDistanceText = indoorDistanceText ?? estimateText;
  const indoorDistance =
    shownDistanceText.trim() === ''
      ? null
      : parseDecimalInput(shownDistanceText);
  const indoorDistanceInvalid =
    indoorDistance !== null &&
    (!Number.isFinite(indoorDistance) || indoorDistance < 0);
  const indoorDistanceKm =
    indoorDistance !== null && Number.isFinite(indoorDistance)
      ? (indoorDistance * unitMeters) / METERS_PER_KM
      : null;

  const handleSave = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const saved = await saveRecordedActivity(
        session,
        points,
        distanceUnit,
        session.indoor ? indoorDistanceKm : null,
        session.indoor ? indoorEstimate : null,
        session.indoor === true && indoorDistanceText === null
      );
      // Ticks a program workout off only if the plan was followed to its end; a run cut short can be tried again. The day is the one the run
      // started on, so a run saved after midnight still counts for its own day.
      let program: RunSummaryParams['program'] = null;
      if (session.program && planCompleted(session)) {
        // The activity is already saved, so a failure here only costs the
        // tick: say so and carry on rather than failing the save.
        try {
          await completeProgramWorkout(
            session.program.id,
            session.program.index,
            toLocalDateString(new Date(session.startedAt)),
            saved.entryId
          );
          program = programSummary(
            t,
            queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey),
            toLocalDateString(new Date()),
            (workoutStatus) => programWorkoutLabel(t, workoutStatus),
            session.program.index
          );
        } catch (error) {
          addLog(
            `[Run Program] Could not tick off the workout: ${error}`,
            'WARNING'
          );
          Toast.show({
            type: 'info',
            text1: t('recordActivity.program.tickFailed', {
              defaultValue: 'Activity saved, program not updated',
            }),
            text2: t('recordActivity.program.tickFailedHint', {
              defaultValue:
                'Use "Count it" on the Diary card to tick the workout off.',
            }),
          });
        }
      }
      invalidateExerciseCache(queryClient, saved.entryDate);
      const { wornOutShoe } = saved;
      if (wornOutShoe) {
        promptToRetireShoe(t, wornOutShoe, () =>
          updateShoe.mutate({
            id: wornOutShoe.id,
            data: { status: 'retired' },
          })
        );
      }
      // The activity is filed. Nothing after this may report the save as
      // failed, or the person would be told to try again for no reason.
      let summaryParams: RunSummaryParams | null = null;
      try {
        summaryParams = buildRunSummary({
          activity: session.activity,
          entryDate: saved.entryDate,
          distanceUnit,
          points,
          lapMarks: session.laps,
          avgHeartRate: averageHeartRate(
            await getHeartRateSamples().catch(() => [])
          ),
          program,
          entryId: saved.entryId,
        });
      } catch (error) {
        addLog(
          `[GPS Recording] Could not build the summary: ${error}`,
          'WARNING'
        );
      }
      await discardRecording().catch((error: unknown) =>
        addLog(
          `[GPS Recording] Could not clear the recording: ${error}`,
          'WARNING'
        )
      );
      if (summaryParams) navigation.replace('RunSummary', summaryParams);
      else navigation.goBack();
    } catch (error) {
      addLog(`[GPS Recording] Save failed: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('recordActivity.errors.save', {
          defaultValue: 'Could not save activity',
        }),
        text2: t('recordActivity.errors.saveHint', {
          defaultValue: 'Your recording is kept on this phone. Try again.',
        }),
      });
    } finally {
      setBusy(false);
    }
  }, [
    distanceUnit,
    indoorDistanceKm,
    indoorDistanceText,
    indoorEstimate,
    navigation,
    points,
    queryClient,
    session,
    t,
    updateShoe,
  ]);

  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const body = (() => {
    if (!ready) {
      return (
        <View
          testID="record-activity-loading"
          className="items-center justify-center py-16"
        >
          <ActivityIndicator />
        </View>
      );
    }
    if (!session && countdownLeft !== null) {
      return (
        <View className="items-center py-16">
          <Text
            className="text-text-primary text-8xl font-bold"
            accessibilityLiveRegion="assertive"
          >
            {countdownLeft}
          </Text>
          <Text className="text-text-secondary text-sm mt-2 mb-8">
            {t('recordActivity.countdown.getReady', {
              defaultValue: 'Get ready',
            })}
          </Text>
          <Button variant="outline" onPress={cancelCountdown}>
            {t('recordActivity.countdown.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </View>
      );
    }
    if (!session) {
      return (
        <>
          <Text className="text-text-secondary text-sm mb-3">
            {indoor
              ? t('recordActivity.introIndoor', {
                  defaultValue:
                    'Record a treadmill or other indoor session. No GPS is used, and you can enter the distance your machine shows when you finish.',
                })
              : t('recordActivity.intro', {
                  defaultValue:
                    'Record a walk, run or ride with your phone’s GPS. Recording continues with the screen locked.',
                })}
          </Text>
          <SegmentedControl<RecordingActivity>
            segments={[
              {
                key: 'walk',
                label: t('recordActivity.activity.walk', {
                  defaultValue: 'Walk',
                }),
              },
              {
                key: 'run',
                label: t('recordActivity.activity.run', {
                  defaultValue: 'Run',
                }),
              },
              {
                key: 'ride',
                label: t('recordActivity.activity.ride', {
                  defaultValue: 'Ride',
                }),
              },
            ]}
            activeKey={activity}
            onSelect={setActivity}
          />
          <View className="mt-3">
            <SegmentedControl<'outdoor' | 'indoor'>
              segments={[
                {
                  key: 'outdoor',
                  label: t('recordActivity.location.outdoor', {
                    defaultValue: 'Outdoor',
                  }),
                },
                {
                  key: 'indoor',
                  label: t('recordActivity.location.indoor', {
                    defaultValue: 'Indoor',
                  }),
                },
              ]}
              activeKey={indoor ? 'indoor' : 'outdoor'}
              onSelect={(key) => setIndoor(key === 'indoor')}
            />
          </View>
          {watchAvailable ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm font-semibold mb-1">
                {t('recordActivity.watch.title', {
                  defaultValue: 'Record with',
                })}
              </Text>
              <Text className="text-text-secondary text-xs mb-2">
                {recordWith === 'phone'
                  ? indoor
                    ? t('recordActivity.watch.phoneIndoorHint', {
                        defaultValue:
                          'Your phone counts your steps to estimate the distance. Correct it to the treadmill’s figure afterwards.',
                      })
                    : t('recordActivity.watch.phoneHint', {
                        defaultValue:
                          'Your phone’s GPS records the route and distance.',
                      })
                  : indoor
                    ? t('recordActivity.watch.indoorHint', {
                        defaultValue:
                          'Your watch counts steps and estimates the distance. Correct it to the treadmill’s figure afterwards.',
                      })
                    : t('recordActivity.watch.outdoorHint', {
                        defaultValue:
                          'Your watch records it with its own GPS and heart rate sensor. Your phone can stay behind.',
                      })}
              </Text>
              <SegmentedControl<'phone' | 'watch'>
                segments={[
                  {
                    key: 'phone',
                    label: indoor
                      ? t('recordActivity.watch.phoneIndoor', {
                          defaultValue: 'Phone',
                        })
                      : t('recordActivity.watch.phone', {
                          defaultValue: 'Phone GPS',
                        }),
                  },
                  {
                    key: 'watch',
                    label: indoor
                      ? t('recordActivity.watch.watchIndoor', {
                          defaultValue: 'Watch',
                        })
                      : t('recordActivity.watch.outdoor', {
                          defaultValue: 'Watch GPS',
                        }),
                  },
                ]}
                activeKey={recordWith}
                onSelect={setRecordWith}
              />
            </View>
          ) : null}
          {/* A phone indoors has no location fixes for auto-pause; the
              watch judges by its step counter, so it keeps the switch. */}
          {indoor && !onWatch ? null : (
            <RecordingSwitchRow
              testID="auto-pause-switch"
              title={t('recordActivity.autoPause.title', {
                defaultValue: 'Auto-pause',
              })}
              description={t('recordActivity.autoPause.description', {
                defaultValue:
                  'Pauses the clock when you stop and carries on when you move.',
              })}
              value={autoPause}
              onValueChange={(value) => {
                preferenceEdits.current.autoPause = true;
                setAutoPause(value);
                void setRecordingPreference('autoPause', value);
              }}
            />
          )}
          <RecordingSwitchRow
            testID="audio-cues-switch"
            title={t('recordActivity.audioCues.title', {
              defaultValue: 'Voice cues',
            })}
            description={t('recordActivity.audioCues.description', {
              defaultValue:
                'Speaks your time at each kilometer or mile, and when you pause or resume.',
            })}
            value={audioCues}
            onValueChange={(value) => {
              preferenceEdits.current.audioCues = true;
              setAudioCues(value);
              void setRecordingPreference('audioCues', value);
            }}
          />
          {/* The watch speaks with its own voice. */}
          {audioCues && !onWatch ? <RecordingVoiceCard /> : null}
          {audioCues ? (
            <CheckInCard
              minutes={checkInMinutes}
              onChange={(minutes) => {
                preferenceEdits.current.checkInMinutes = true;
                setCheckInMinutes(minutes);
                void setCheckInPreference(minutes);
              }}
            />
          ) : null}
          {/* A phone indoors has no GPS pace to judge by; the watch has its own. */}
          {(!indoor || onWatch) && activity !== 'ride' ? (
            <PaceBandCard
              enabled={paceAlert}
              onEnabledChange={(value) => {
                preferenceEdits.current.paceAlert = true;
                setPaceAlert(value);
                if (value) {
                  void setPaceBandPreference(
                    paceBandPerKm(currentPaceBand, distanceUnit)
                  );
                }
              }}
              band={currentPaceBand}
              onBandChange={(next) => {
                preferenceEdits.current.paceAlert = true;
                setPaceBand(next);
                void setPaceBandPreference(paceBandPerKm(next, distanceUnit));
              }}
              unit={distanceUnit}
            />
          ) : null}
          {/* Heart rate comes from the Apple Watch, so needs one paired. */}
          {watchAvailable && (!indoor || onWatch) ? (
            <HeartRateBandCard
              enabled={heartRateAlert}
              onEnabledChange={(value) => {
                preferenceEdits.current.heartRateAlert = true;
                setHeartRateAlert(value);
                if (value)
                  void setHeartRateBandPreference(currentHeartRateBand);
              }}
              band={currentHeartRateBand}
              onBandChange={(next) => {
                preferenceEdits.current.heartRateAlert = true;
                setHeartRateBand(next);
                void setHeartRateBandPreference(next);
              }}
            />
          ) : null}
          <View className="bg-surface rounded-xl p-4 mt-4">
            <Text className="text-text-primary text-sm font-semibold mb-2">
              {t('recordActivity.countdown.title', {
                defaultValue: 'Start countdown',
              })}
            </Text>
            <SegmentedControl<string>
              segments={COUNTDOWN_CHOICES.map((seconds) => ({
                key: String(seconds),
                label:
                  seconds === 0
                    ? t('recordActivity.countdown.off', {
                        defaultValue: 'Off',
                      })
                    : t('recordActivity.countdown.seconds', {
                        seconds,
                        defaultValue: '{{seconds}} s',
                      }),
              }))}
              activeKey={String(countdownSeconds)}
              onSelect={(key) => {
                const seconds = Number(key);
                preferenceEdits.current.countdownSeconds = true;
                setCountdownSeconds(seconds);
                void setCountdownPreference(seconds);
              }}
            />
          </View>
          <RunProgramSelect
            status={programStatus}
            loaded={programLoaded}
            selected={intervalChoice === 'program'}
            onSelect={() => {
              setActivity(programStatus?.program.activity ?? 'run');
              setIntervalChoice('program');
            }}
            onManage={() => navigation.navigate('RunPrograms')}
          />
          <IntervalSetup
            programLabel={
              programStatus?.workout
                ? programWorkoutLabel(t, programStatus)
                : undefined
            }
            choice={intervalChoice}
            onChoice={setIntervalChoice}
            custom={customIntervals}
            onCustom={setCustomIntervals}
            activity={activity}
            distanceAllowed={!indoor}
            milesAvailable={distanceUnit === 'miles'}
          />
          {/* A plan can hold a pace in its fast and easy stretches and its warm-up and cool-down. */}
          {showPlanTargets ? (
            <>
              <SuggestedRangesCard
                unit={distanceUnit}
                pace={suggestedPaceChoice}
                heartRate={suggestedHeartRate}
                onUse={useSuggestedRangesNow}
              />
              <PaceBandCard
                testIDPrefix="work-pace"
                title={t('recordActivity.paceBand.workTitle', {
                  defaultValue: 'Fast stretch pace',
                })}
                description={t('recordActivity.paceBand.workDescription', {
                  defaultValue:
                    'Alerts you when a fast stretch is outside this range.',
                })}
                enabled={workPace.enabled}
                onEnabledChange={(enabled) =>
                  setWorkPace((current) => ({ ...current, enabled }))
                }
                band={workBand}
                onBandChange={(band) =>
                  setWorkPace((current) => ({ ...current, band }))
                }
                unit={distanceUnit}
              />
              <PaceBandCard
                testIDPrefix="easy-pace"
                title={t('recordActivity.paceBand.easyTitle', {
                  defaultValue: 'Easy stretch pace',
                })}
                description={t('recordActivity.paceBand.easyDescription', {
                  defaultValue:
                    'Alerts you when an easy stretch is outside this range.',
                })}
                enabled={easyPace.enabled}
                onEnabledChange={(enabled) =>
                  setEasyPace((current) => ({ ...current, enabled }))
                }
                band={easyBand}
                onBandChange={(band) =>
                  setEasyPace((current) => ({ ...current, band }))
                }
                unit={distanceUnit}
              />
              {watchAvailable ? (
                <>
                  <HeartRateBandCard
                    testIDPrefix="work-hr"
                    title={t('recordActivity.heartRateBand.workTitle', {
                      defaultValue: 'Fast stretch heart rate',
                    })}
                    description={t(
                      'recordActivity.heartRateBand.workDescription',
                      {
                        defaultValue:
                          'Alerts you when your heart rate in a fast stretch is outside this range.',
                      }
                    )}
                    enabled={workHeartRate.enabled}
                    onEnabledChange={(enabled) =>
                      setWorkHeartRate((current) => ({ ...current, enabled }))
                    }
                    band={workHeartRateBand}
                    onBandChange={(band) =>
                      setWorkHeartRate((current) => ({ ...current, band }))
                    }
                  />
                  <HeartRateBandCard
                    testIDPrefix="easy-hr"
                    title={t('recordActivity.heartRateBand.easyTitle', {
                      defaultValue: 'Easy stretch heart rate',
                    })}
                    description={t(
                      'recordActivity.heartRateBand.easyDescription',
                      {
                        defaultValue:
                          'Alerts you when your heart rate in an easy stretch is outside this range.',
                      }
                    )}
                    enabled={easyHeartRate.enabled}
                    onEnabledChange={(enabled) =>
                      setEasyHeartRate((current) => ({ ...current, enabled }))
                    }
                    band={easyHeartRateBand}
                    onBandChange={(band) =>
                      setEasyHeartRate((current) => ({ ...current, band }))
                    }
                  />
                </>
              ) : null}
              <View className="bg-surface rounded-xl px-4 mt-4">
                <ProgramActionRow
                  testID="warm-ranges-toggle"
                  label={t('recordActivity.warmRanges.title', {
                    defaultValue: 'Warm-up and cool-down',
                  })}
                  hint={warmSummary}
                  onPress={() => setWarmOpen((open) => !open)}
                />
              </View>
              {warmOpen ? (
                <>
                  <PaceBandCard
                    testIDPrefix="warm-pace"
                    title={t('recordActivity.paceBand.warmTitle', {
                      defaultValue: 'Warm-up and cool-down pace',
                    })}
                    description={t('recordActivity.paceBand.warmDescription', {
                      defaultValue:
                        'Alerts you when the warm-up or cool-down is outside this range.',
                    })}
                    enabled={warmPace.enabled}
                    onEnabledChange={(enabled) =>
                      setWarmPace((current) => ({ ...current, enabled }))
                    }
                    band={warmBand}
                    onBandChange={(band) =>
                      setWarmPace((current) => ({ ...current, band }))
                    }
                    unit={distanceUnit}
                  />
                  {watchAvailable ? (
                    <HeartRateBandCard
                      testIDPrefix="warm-hr"
                      title={t('recordActivity.heartRateBand.warmTitle', {
                        defaultValue: 'Warm-up and cool-down heart rate',
                      })}
                      description={t(
                        'recordActivity.heartRateBand.warmDescription',
                        {
                          defaultValue:
                            'Alerts you when your heart rate in the warm-up or cool-down is outside this range.',
                        }
                      )}
                      enabled={warmHeartRate.enabled}
                      onEnabledChange={(enabled) =>
                        setWarmHeartRate((current) => ({ ...current, enabled }))
                      }
                      band={warmHeartRateBand}
                      onBandChange={(band) =>
                        setWarmHeartRate((current) => ({ ...current, band }))
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {permissionProblem ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm mb-3">
                {permissionProblem === 'denied'
                  ? t('recordActivity.permission.denied', {
                      defaultValue:
                        'SparkyFitness needs location access to record your route. You can allow it in Settings.',
                    })
                  : t('recordActivity.permission.servicesOff', {
                      defaultValue:
                        'Location services are turned off. Turn them on in Settings to record.',
                    })}
              </Text>
              <Button
                variant="outline"
                onPress={() => void Linking.openSettings()}
              >
                {t('recordActivity.permission.openSettings', {
                  defaultValue: 'Open Settings',
                })}
              </Button>
            </View>
          ) : null}
          {Platform.OS === 'android' && !indoor ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm font-semibold mb-1">
                {t('recordActivity.androidTips.title', {
                  defaultValue: 'Recording with the screen off',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mb-3">
                {t('recordActivity.androidTips.body', {
                  defaultValue:
                    'Some phones stop apps that run in the background. If a recording has gaps, set SparkyFitness to “Unrestricted” in the phone’s battery settings.',
                })}
              </Text>
              <Button
                variant="link"
                onPress={() =>
                  void Linking.openURL('https://dontkillmyapp.com')
                }
              >
                {t('recordActivity.androidTips.link', {
                  defaultValue: 'Phone-specific steps',
                })}
              </Button>
            </View>
          ) : null}
          <Button className="mt-6" loading={busy} onPress={handleStartPress}>
            {t('recordActivity.start', { defaultValue: 'Start' })}
          </Button>
        </>
      );
    }

    const active = elapsedSeconds(session, now);
    const distance = summary.distanceMeters;
    const avgPace = paceSecondsPerUnit(
      distance,
      summary.activeSeconds,
      unitMeters
    );
    const currentPace = currentPaceSecondsPerUnit(points, unitMeters);
    const elevation =
      distanceUnit === 'miles'
        ? summary.elevationGainMeters * FEET_PER_METER
        : summary.elevationGainMeters;
    const elevationUnit =
      distanceUnit === 'miles'
        ? t('recordActivity.unitFt', { defaultValue: 'ft' })
        : t('recordActivity.unitM', { defaultValue: 'm' });
    const paceUnit = t('recordActivity.perUnit', {
      defaultValue: '/{{unit}}',
      unit: unitLabel,
    });
    const finished = session.status === 'finished';
    const intervalPos = session.intervals
      ? intervalPosition(session.intervals.plan, active, {
          cursor: session.intervals.cursor,
          meters: distance,
        })
      : null;
    const indoorSession = session.indoor === true;
    // Still running from before this visit (or from earlier in it): say when it
    // began so a leftover recording is never mistaken for a new one.
    const carriedOver = !startedHere && !finished;

    return (
      <>
        {carriedOver ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-sm">
              {t('recordActivity.carriedOver', {
                defaultValue:
                  'This recording started at {{time}} and was still running on this phone.',
                time: new Date(session.startedAt).toLocaleTimeString(
                  getAppLocale(),
                  { hour: 'numeric', minute: '2-digit' }
                ),
              })}
            </Text>
          </View>
        ) : null}
        {indoorSession ? null : points.length > 1 ? (
          <View className="mb-4">
            <RouteMap
              points={mapPoints}
              accessibilityLabel={t('recordActivity.routeA11y', {
                defaultValue: 'Map of your route so far',
              })}
            />
          </View>
        ) : (
          <View className="bg-surface rounded-xl p-4 mb-4 items-center">
            <ActivityIndicator />
            <Text className="text-text-muted text-sm mt-2">
              {t('recordActivity.waitingForGps', {
                defaultValue: 'Waiting for a GPS fix…',
              })}
            </Text>
          </View>
        )}
        {indoorSession || finished ? null : (
          <View className="items-center mb-2">
            <GpsSignalBadge />
          </View>
        )}
        <View className="items-center mb-4">
          <Text className="text-text-muted text-xs">
            {session.status === 'paused'
              ? session.autoPaused
                ? t('recordActivity.status.autoPaused', {
                    defaultValue: 'Auto-paused',
                  })
                : t('recordActivity.status.paused', { defaultValue: 'Paused' })
              : finished
                ? t('recordActivity.status.finished', {
                    defaultValue: 'Finished',
                  })
                : t('recordActivity.time', { defaultValue: 'Time' })}
          </Text>
          <Text
            className="text-text-primary text-5xl font-bold"
            accessibilityLabel={formatClock(active)}
          >
            {formatClock(active)}
          </Text>
        </View>
        {session.intervals && intervalPos && !finished ? (
          <IntervalCard plan={session.intervals.plan} position={intervalPos} />
        ) : null}
        {indoorSession ? null : (
          <>
            <View className="flex-row mb-3">
              <Stat
                label={t('recordActivity.distance', {
                  defaultValue: 'Distance',
                })}
                value={number(distance / unitMeters)}
                unit={unitLabel}
              />
              <Stat
                label={t('recordActivity.avgPace', {
                  defaultValue: 'Avg pace',
                })}
                value={formatPace(avgPace)}
                unit={paceUnit}
              />
            </View>
            <View className="flex-row mb-4">
              {finished ? (
                <Stat
                  label={t('recordActivity.elevationLoss', {
                    defaultValue: 'Elevation loss',
                  })}
                  value={number(
                    distanceUnit === 'miles'
                      ? summary.elevationLossMeters * FEET_PER_METER
                      : summary.elevationLossMeters,
                    0
                  )}
                  unit={elevationUnit}
                />
              ) : (
                <Stat
                  label={t('recordActivity.currentPace', {
                    defaultValue: 'Pace',
                  })}
                  value={formatPace(currentPace)}
                  unit={paceUnit}
                />
              )}
              <Stat
                label={t('recordActivity.elevationGain', {
                  defaultValue: 'Elevation gain',
                })}
                value={number(elevation, 0)}
                unit={elevationUnit}
              />
            </View>
          </>
        )}
        {heartRate != null && !finished ? (
          <View className="flex-row mb-4">
            <Stat
              label={t('recordActivity.heartRate', {
                defaultValue: 'Heart rate',
              })}
              value={number(heartRate, 0)}
              unit={t('recordActivity.unitBpm', { defaultValue: 'bpm' })}
            />
          </View>
        ) : null}
        {finished && laps.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('recordActivity.laps', { defaultValue: 'Laps' })}
            </Text>
            {laps.map((lap, i) => (
              <SplitRow
                key={lap.index}
                label={t('recordActivity.lapLabel', {
                  defaultValue: 'Lap {{number}}',
                  number: lap.index,
                })}
                detail={`${number(lap.distanceMeters / unitMeters, 2)} ${unitLabel} · ${formatClock(lap.durationSeconds)}`}
                pace={`${formatPace(
                  paceSecondsPerUnit(
                    lap.distanceMeters,
                    lap.durationSeconds,
                    unitMeters
                  )
                )} ${paceUnit}`}
                fraction={lapBarsFor[i].fraction}
                fastest={lapBarsFor[i].fastest}
                fastestLabel={t('recordActivity.fastest', {
                  defaultValue: 'Fastest',
                })}
              />
            ))}
          </View>
        ) : null}
        {finished && splits.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('recordActivity.splits', { defaultValue: 'Splits' })}
            </Text>
            {splits.map((split, i) => (
              <SplitRow
                key={split.index}
                label={`${
                  split.partial
                    ? number(split.distanceMeters / unitMeters)
                    : String(split.index)
                } ${unitLabel}`}
                pace={`${formatPace(
                  paceSecondsPerUnit(
                    split.distanceMeters,
                    split.durationSeconds,
                    unitMeters
                  )
                )} ${paceUnit}`}
                fraction={splitBarsFor[i].fraction}
                fastest={splitBarsFor[i].fastest}
                fastestLabel={t('recordActivity.fastest', {
                  defaultValue: 'Fastest',
                })}
              />
            ))}
          </View>
        ) : null}
        {finished && indoorSession ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-1">
              {t('recordActivity.indoorDistance.title', {
                defaultValue: 'Distance',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mb-3">
              {indoorEstimate
                ? indoorEstimate.calibrated
                  ? t('recordActivity.indoorDistance.estimateLearned', {
                      count: indoorEstimate.steps,
                      formattedCount: formatLocalizedNumber(
                        indoorEstimate.steps,
                        {
                          maximumFractionDigits: 0,
                        }
                      ),
                      defaultValue:
                        'Estimated from {{formattedCount}} steps using your stride. Change it to match your treadmill and the app keeps learning.',
                      defaultValue_one:
                        'Estimated from {{formattedCount}} step using your stride. Change it to match your treadmill and the app keeps learning.',
                      defaultValue_other:
                        'Estimated from {{formattedCount}} steps using your stride. Change it to match your treadmill and the app keeps learning.',
                    })
                  : t('recordActivity.indoorDistance.estimateRough', {
                      count: indoorEstimate.steps,
                      formattedCount: formatLocalizedNumber(
                        indoorEstimate.steps,
                        {
                          maximumFractionDigits: 0,
                        }
                      ),
                      defaultValue:
                        'A rough estimate from {{formattedCount}} steps with a typical stride. Enter what your treadmill shows and the app learns yours.',
                      defaultValue_one:
                        'A rough estimate from {{formattedCount}} step with a typical stride. Enter what your treadmill shows and the app learns yours.',
                      defaultValue_other:
                        'A rough estimate from {{formattedCount}} steps with a typical stride. Enter what your treadmill shows and the app learns yours.',
                    })
                : t('recordActivity.indoorDistance.hint', {
                    defaultValue:
                      'Optional. Enter the distance your treadmill or machine shows.',
                  })}
            </Text>
            <View className="flex-row items-center">
              <FormInput
                className="flex-1"
                keyboardType="decimal-pad"
                value={shownDistanceText}
                placeholder="0.00"
                accessibilityLabel={t('recordActivity.indoorDistance.title', {
                  defaultValue: 'Distance',
                })}
                onChangeText={(text) => {
                  if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
                  setIndoorDistanceText(text);
                }}
              />
              <Text className="text-text-secondary text-base ml-3">
                {unitLabel}
              </Text>
            </View>
            {indoorDistanceInvalid ? (
              <Text className="text-text-danger-subtle text-sm mt-2">
                {t('recordActivity.indoorDistance.invalid', {
                  defaultValue: 'Enter a distance of zero or more.',
                })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {finished ? (
          <>
            <Button
              loading={busy}
              disabled={indoorSession && indoorDistanceInvalid}
              onPress={() => void handleSave()}
            >
              {t('recordActivity.save', { defaultValue: 'Save activity' })}
            </Button>
            <Button
              variant="destructive"
              className="mt-2"
              disabled={busy}
              onPress={handleDiscard}
            >
              {t('recordActivity.discard.action', { defaultValue: 'Discard' })}
            </Button>
          </>
        ) : (
          <View>
            {session.status === 'recording' ? (
              <Button
                variant="outline"
                className="mb-2"
                disabled={busy}
                onPress={() => void markLap()}
              >
                {t('recordActivity.lap', { defaultValue: 'Lap' })}
              </Button>
            ) : null}
            <View className="flex-row">
              <Button
                variant="secondary"
                className="flex-1 mr-2"
                loading={busy}
                onPress={() =>
                  void (session.status === 'recording'
                    ? run(
                        pauseRecording,
                        t('recordActivity.errors.pause', {
                          defaultValue: 'Could not pause recording',
                        })
                      )
                    : handleResume())
                }
              >
                {session.status === 'recording'
                  ? t('recordActivity.pause', { defaultValue: 'Pause' })
                  : t('recordActivity.resume', { defaultValue: 'Resume' })}
              </Button>
              <Button
                className="flex-1 ml-2"
                disabled={busy}
                onPress={() => void handleFinish()}
              >
                {t('recordActivity.finish', { defaultValue: 'Finish' })}
              </Button>
            </View>
          </View>
        )}
        {finished ? null : (
          <Button
            variant="destructive"
            className="mt-2"
            disabled={busy}
            onPress={handleDiscard}
          >
            {t('recordActivity.discard.action', { defaultValue: 'Discard' })}
          </Button>
        )}
        {/* This recording only: the saved preferences stay as they are. */}
        {finished || session.indoor ? null : (
          <RecordingSwitchRow
            testID="live-auto-pause-switch"
            title={t('recordActivity.autoPause.title', {
              defaultValue: 'Auto-pause',
            })}
            value={session.autoPause === true}
            onValueChange={(value) =>
              void run(
                () =>
                  setRecordingAutoPause(
                    value,
                    notificationText(t, session.activity)
                  ),
                t('recordActivity.errors.resume', {
                  defaultValue: 'Could not resume recording',
                })
              )
            }
          />
        )}
        {finished ? null : (
          <RecordingSwitchRow
            testID="live-audio-cues-switch"
            title={t('recordActivity.audioCues.title', {
              defaultValue: 'Voice cues',
            })}
            value={session.audioCues != null}
            onValueChange={(value) =>
              void setRecordingAudioCues(
                value ? (distanceUnit === 'miles' ? 'miles' : 'km') : undefined
              )
            }
          />
        )}
        {finished || session.audioCues == null ? null : (
          <CheckInCard
            testID="live-check-in"
            minutes={session.checkInMinutes ?? 0}
            onChange={(minutes) => {
              preferenceEdits.current.checkInMinutes = true;
              setCheckInMinutes(minutes);
              void setCheckInPreference(minutes);
              void setRecordingCheckIn(minutes);
            }}
          />
        )}
        {/* Change the range without stopping: a new range starts the wait again. */}
        {finished || session.indoor || session.activity === 'ride' ? null : (
          <PaceBandCard
            testIDPrefix="live-pace"
            enabled={session.paceBand != null}
            onEnabledChange={(on) =>
              void setRecordingPaceBand(
                on ? paceBandPerKm(currentPaceBand, distanceUnit) : undefined
              )
            }
            band={
              session.paceBand
                ? paceBandInUnit(session.paceBand, distanceUnit)
                : currentPaceBand
            }
            onBandChange={(next) =>
              void setRecordingPaceBand(paceBandPerKm(next, distanceUnit))
            }
            unit={distanceUnit}
          />
        )}
        {finished || session.indoor || session.activity === 'ride' ? null : (
          <HeartRateBandCard
            testIDPrefix="live-hr"
            enabled={session.heartRateBand != null}
            onEnabledChange={(on) =>
              void setRecordingHeartRateBand(
                on ? currentHeartRateBand : undefined
              )
            }
            band={session.heartRateBand ?? currentHeartRateBand}
            onBandChange={(next) => void setRecordingHeartRateBand(next)}
          />
        )}
      </>
    );
  })();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
    >
      {body}
    </ScrollView>
  );
};

export default RecordActivityScreen;
