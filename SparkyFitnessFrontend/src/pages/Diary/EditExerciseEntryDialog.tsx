import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import type { WorkoutPresetSet } from '@/types/workout';
import ExerciseActivityDetailsEditor from '@/components/ExerciseActivityDetailsEditor';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import {
  Plus,
  ChevronDown,
  XCircle,
  X,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  Heart,
  Zap,
  Footprints,
  Mountain,
  Activity,
  Sun,
  Gauge,
} from 'lucide-react';
import {
  activityDetailsOptions as fetchActivityDetailsOptions,
  useActivityDetailsQuery,
} from '@/hooks/Exercises/useExercises';
import {
  useUpdateExerciseEntryMutation,
  exerciseDetailsOptions,
} from '@/hooks/Exercises/useExerciseEntries';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { WorkoutLapsTable } from '@/components/Exercises/WorkoutLapsTable';
import { WorkoutGpsMap } from '@/components/Exercises/WorkoutGpsMap';
import { useWorkoutLaps, useWorkoutGpsPoints } from '@/hooks/useGenericHealth';
import { ActivityDetailKeyValuePair, ExerciseEntry } from '@/types/exercises';

interface RawActivityDetailItem {
  id?: string;
  provider_name?: string;
  detail_type: string;
  detail_data?: unknown;
}
import { SortableSetItem } from '../Exercises/SortableWorkoutSet';
import { SetColumnHeaders } from '../Exercises/SetHeader';
import {
  defaultSetForModality,
  toSetTableModality,
} from '@/constants/exercises';
import { CardioLog } from '../Exercises/CardioLog';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import {
  resolveExerciseModality,
  setsDurationMinutes,
  toHourMinute,
  userHourMinute,
} from '@workspace/shared';
interface EditExerciseEntryDialogProps {
  entry: ExerciseEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}
type SortableSet = WorkoutPresetSet & { _dndId: string };
const RAW_PROVIDER_TYPES = [
  'full_activity_data',
  'full_workout_data',
  'fit_file_data',
];

function extractTelemetry(entry: ExerciseEntry, activityData: unknown) {
  const e = entry as Record<string, unknown>;
  const detailsList =
    (entry.activity_details as Array<Record<string, unknown>>) || [];

  const providerDump = detailsList.find(
    (d) =>
      d['detail_type'] === 'full_activity_data' ||
      d['detail_type'] === 'full_workout_data'
  );

  const rawData =
    ((activityData as Record<string, unknown>)?.['activity'] as
      | Record<string, unknown>
      | undefined) || providerDump?.['detail_data'];

  const rawObj = (rawData as Record<string, unknown>) || {};
  const summary =
    (rawObj['summaryDTO'] as Record<string, unknown>) ||
    (rawObj['activity'] as Record<string, unknown>) ||
    rawObj;

  const getNum = (decimals = 2, ...keys: string[]): number | '' => {
    const factor = Math.pow(10, decimals);
    for (const key of keys) {
      if (e[key] != null && e[key] !== '') {
        const val = Number(e[key]);
        if (Number.isFinite(val)) return Math.round(val * factor) / factor;
      }
      if (summary[key] != null && summary[key] !== '') {
        const val = Number(summary[key]);
        if (Number.isFinite(val)) return Math.round(val * factor) / factor;
      }
    }
    return '';
  };

  const getStr = (...keys: string[]): string => {
    for (const key of keys) {
      if (typeof e[key] === 'string' && e[key]) return e[key] as string;
      if (typeof summary[key] === 'string' && summary[key])
        return summary[key] as string;
    }
    return '';
  };

  return {
    maxHeartRate: getNum(0, 'max_heart_rate', 'maxHR', 'maxHeartRate'),
    avgRespiration: getNum(
      0,
      'avg_respiration_brpm',
      'avgRespirationRate',
      'avgRespiration'
    ),
    maxRespiration: getNum(
      0,
      'max_respiration_brpm',
      'maxRespirationRate',
      'maxRespiration'
    ),
    avgSpeedMps: getNum(2, 'avg_speed_mps', 'averageSpeed', 'avgSpeed'),
    maxSpeedMps: getNum(2, 'max_speed_mps', 'maxSpeed'),
    avgCadence: getNum(
      0,
      'avg_cadence',
      'averageRunCadenceInStepsPerMinute',
      'averageRunCadence',
      'avgRunCadence',
      'averageCadence',
      'avgCadence'
    ),
    maxCadence: getNum(
      0,
      'max_cadence',
      'maxRunningCadenceInStepsPerMinute',
      'maxRunCadence',
      'maxCadence'
    ),
    avgPowerWatts: getNum(0, 'avg_power_watts', 'averagePower', 'avgPower'),
    maxPowerWatts: getNum(0, 'max_power_watts', 'maxPower'),
    elevationGain: getNum(
      2,
      'elevation_gain_meters',
      'elevationGain',
      'totalElevationGain'
    ),
    elevationLoss: getNum(
      2,
      'elevation_loss_meters',
      'elevationLoss',
      'totalElevationLoss'
    ),
    floorsClimbed: getNum(0, 'floors_climbed', 'floorsClimbed'),
    strokeCount: getNum(0, 'stroke_count', 'strokes', 'strokeCount'),
    trainingLoad: getNum(0, 'training_load', 'trainingLoad'),
    aerobicEffect: getNum(
      2,
      'aerobic_training_effect',
      'aerobicTrainingEffect'
    ),
    anaerobicEffect: getNum(
      2,
      'anaerobic_training_effect',
      'anaerobicTrainingEffect'
    ),
    vo2Max: getNum(2, 'vo2_max_estimate', 'vo2MaxValue', 'vo2MaxPrecision'),
    avgTemp: getNum(
      1,
      'avg_temperature_celsius',
      'avgTemperature',
      'minTemperature'
    ),
    weatherCondition: getStr(
      'weather_condition',
      'weatherCondition',
      'weatherConditionName'
    ),
    gearName: getStr('gear_name', 'gearName', 'gear_name'),
    steps: getNum(0, 'steps', 'stepsCount'),
    waterEstimated: getNum(0, 'water_estimated', 'waterEstimated'),
    movingTime: getNum(
      0,
      'moving_time_seconds',
      'movingDuration',
      'movingTime'
    ),
    elapsedTime: getNum(
      0,
      'elapsed_time_seconds',
      'elapsedDuration',
      'elapsedTime'
    ),
    activeCalories: getNum(0, 'active_calories', 'activeCalories'),
    restingCalories: getNum(
      0,
      'resting_calories',
      'bmrCalories',
      'restingCalories'
    ),
    groundContact: getNum(0, 'ground_contact_time_ms', 'avgGroundContactTime'),
    verticalOscillation: getNum(
      1,
      'vertical_oscillation_mm',
      'avgVerticalOscillation'
    ),
    strideLength: getNum(1, 'stride_length_cm', 'avgStrideLength'),
    normPower: getNum(0, 'normalized_power_watts', 'normalizedPower'),
    tss: getNum(1, 'tss_score', 'tssScore', 'trainingStressScore'),
    minElevation: getNum(2, 'min_elevation_meters', 'minElevation'),
    maxElevation: getNum(2, 'max_elevation_meters', 'maxElevation'),
    avgMovingSpeed: getNum(2, 'avg_moving_speed_mps', 'avgMovingSpeed'),
    weatherTemp: getNum(1, 'weather_temp_celsius', 'weatherTemp'),
    windSpeed: getNum(1, 'weather_wind_speed_mps', 'windSpeed'),
    humidity: getNum(0, 'weather_humidity_percentage', 'humidityPercentage'),
  };
}

const EditExerciseEntryDialog = ({
  entry,
  open,
  onOpenChange,
  onSave,
}: EditExerciseEntryDialogProps) => {
  const { t } = useTranslation();
  const { loggingLevel, weightUnit, distanceUnit, convertDistance, timezone } =
    usePreferences();

  const modality = resolveExerciseModality(
    entry.exercise_snapshot?.modality,
    entry.exercise_snapshot?.category
  );
  const isCardio = modality === 'duration_distance';

  // Laps/GPS only exist for cardio (duration_distance) entries; skip the request
  // entirely for strength-set edits instead of firing two calls that always come back
  // empty.
  const { data: lapsData, isLoading: lapsLoading } = useWorkoutLaps(
    isCardio ? entry.id : ''
  );
  const { data: gpsData, isLoading: gpsLoading } = useWorkoutGpsPoints(
    isCardio ? entry.id : ''
  );

  const [sets, setSets] = useState<SortableSet[]>(() => {
    const entrySets = ((entry.sets as WorkoutPresetSet[]) || []).map((set) => ({
      ...set,
      weight: set.weight != null ? Number(set.weight) : null,
      _dndId: uuidv4(),
    }));
    // A legacy cardio entry logged before sets-backed cardio has no rows;
    // seed one so the save below has a set to write duration/distance into.
    if (entrySets.length === 0 && isCardio) {
      return [{ ...defaultSetForModality(modality), _dndId: uuidv4() }];
    }
    return entrySets;
  });

  // Cardio renders the entry-level Duration/Distance form only while it has
  // at most one set; a multi-set cardio entry (import, intervals) keeps the
  // duration set table so no rows are hidden.
  const cardioForm = isCardio && sets.length <= 1;
  const [notes, setNotes] = useState(entry.notes || '');
  const [entryTime, setEntryTime] = useState<string>(
    toHourMinute(entry.entry_time) || ''
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    entry.image_url || null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [caloriesBurnedInput, setCaloriesBurnedInput] = useState<number | ''>(
    entry.calories_burned || ''
  );
  const [distanceInput, setDistanceInput] = useState<number | ''>(
    entry.distance !== undefined && entry.distance !== null
      ? Number(convertDistance(entry.distance, 'km', distanceUnit).toFixed(1))
      : ''
  );
  const [avgHeartRateInput, setAvgHeartRateInput] = useState<number | ''>(
    entry.avg_heart_rate != null ? entry.avg_heart_rate : ''
  );
  const [durationInput, setDurationInput] = useState<number | ''>(
    entry.duration_minutes != null
      ? Math.round(Number(entry.duration_minutes) * 100) / 100
      : ''
  );
  const providerDumps = useMemo<RawActivityDetailItem[]>(
    () =>
      ((entry.activity_details as RawActivityDetailItem[]) || []).filter(
        (detail) => RAW_PROVIDER_TYPES.includes(detail.detail_type)
      ),
    [entry.activity_details]
  );

  const [activityDetails, setActivityDetails] = useState<
    ActivityDetailKeyValuePair[]
  >(
    ((entry.activity_details as RawActivityDetailItem[]) || [])
      .filter(
        (detail) =>
          !RAW_PROVIDER_TYPES.includes(detail.detail_type) &&
          detail.detail_data !== null &&
          detail.detail_data !== 'null'
      )
      .map((detail) => ({
        id: detail.id,
        key: detail.detail_type,
        value:
          typeof detail.detail_data === 'string'
            ? detail.detail_data
            : JSON.stringify(detail.detail_data),
        provider_name: detail.provider_name,
        detail_type: detail.detail_type,
      }))
  );
  const [showCaloriesWarning, setShowCaloriesWarning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Extended Telemetry / Garmin Parity Fields
  const [maxHeartRateInput, setMaxHeartRateInput] = useState<number | ''>(
    entry.max_heart_rate != null ? entry.max_heart_rate : ''
  );
  const [avgRespirationInput, setAvgRespirationInput] = useState<number | ''>(
    entry.avg_respiration_brpm != null ? entry.avg_respiration_brpm : ''
  );
  const [maxRespirationInput, setMaxRespirationInput] = useState<number | ''>(
    entry.max_respiration_brpm != null ? entry.max_respiration_brpm : ''
  );
  const [avgSpeedMpsInput, setAvgSpeedMpsInput] = useState<number | ''>(
    entry.avg_speed_mps != null ? entry.avg_speed_mps : ''
  );
  const [maxSpeedMpsInput, setMaxSpeedMpsInput] = useState<number | ''>(
    entry.max_speed_mps != null ? entry.max_speed_mps : ''
  );
  const [avgCadenceInput, setAvgCadenceInput] = useState<number | ''>(
    entry.avg_cadence != null ? entry.avg_cadence : ''
  );
  const [maxCadenceInput, setMaxCadenceInput] = useState<number | ''>(
    entry.max_cadence != null ? entry.max_cadence : ''
  );
  const [avgPowerWattsInput, setAvgPowerWattsInput] = useState<number | ''>(
    entry.avg_power_watts != null ? entry.avg_power_watts : ''
  );
  const [maxPowerWattsInput, setMaxPowerWattsInput] = useState<number | ''>(
    entry.max_power_watts != null ? entry.max_power_watts : ''
  );
  const [elevationGainInput, setElevationGainInput] = useState<number | ''>(
    entry.elevation_gain_meters != null ? entry.elevation_gain_meters : ''
  );
  const [elevationLossInput, setElevationLossInput] = useState<number | ''>(
    entry.elevation_loss_meters != null ? entry.elevation_loss_meters : ''
  );
  const [floorsClimbedInput, setFloorsClimbedInput] = useState<number | ''>(
    entry.floors_climbed != null ? entry.floors_climbed : ''
  );
  const [strokeCountInput, setStrokeCountInput] = useState<number | ''>(
    entry.stroke_count != null ? entry.stroke_count : ''
  );
  const [trainingLoadInput, setTrainingLoadInput] = useState<number | ''>(
    entry.training_load != null ? entry.training_load : ''
  );
  const [aerobicEffectInput, setAerobicEffectInput] = useState<number | ''>(
    entry.aerobic_training_effect != null ? entry.aerobic_training_effect : ''
  );
  const [anaerobicEffectInput, setAnaerobicEffectInput] = useState<number | ''>(
    entry.anaerobic_training_effect != null
      ? entry.anaerobic_training_effect
      : ''
  );
  const [vo2MaxInput, setVo2MaxInput] = useState<number | ''>(
    entry.vo2_max_estimate != null ? entry.vo2_max_estimate : ''
  );
  const [tempCelsiusInput, setTempCelsiusInput] = useState<number | ''>(
    entry.avg_temperature_celsius != null ? entry.avg_temperature_celsius : ''
  );
  const [weatherCondInput, setWeatherCondInput] = useState<string>(
    entry.weather_condition || ''
  );
  const [gearNameInput, setGearNameInput] = useState<string>(
    entry.gear_name || ''
  );
  const [stepsInput, setStepsInput] = useState<number | ''>(
    entry.steps != null ? entry.steps : ''
  );
  const [waterEstimatedInput, setWaterEstimatedInput] = useState<number | ''>(
    entry.water_estimated != null ? entry.water_estimated : ''
  );
  const [movingTimeInput, setMovingTimeInput] = useState<number | ''>(
    entry.moving_time_seconds != null ? entry.moving_time_seconds : ''
  );
  const [elapsedTimeInput, setElapsedTimeInput] = useState<number | ''>(
    entry.elapsed_time_seconds != null ? entry.elapsed_time_seconds : ''
  );
  const [activeCaloriesInput, setActiveCaloriesInput] = useState<number | ''>(
    entry.active_calories != null ? entry.active_calories : ''
  );
  const [restingCaloriesInput, setRestingCaloriesInput] = useState<number | ''>(
    entry.resting_calories != null ? entry.resting_calories : ''
  );
  const [groundContactInput, setGroundContactInput] = useState<number | ''>(
    entry.ground_contact_time_ms != null ? entry.ground_contact_time_ms : ''
  );
  const [verticalOscillationInput, setVerticalOscillationInput] = useState<
    number | ''
  >(entry.vertical_oscillation_mm != null ? entry.vertical_oscillation_mm : '');
  const [strideLengthInput, setStrideLengthInput] = useState<number | ''>(
    entry.stride_length_cm != null ? entry.stride_length_cm : ''
  );
  const [normPowerInput, setNormPowerInput] = useState<number | ''>(
    entry.normalized_power_watts != null ? entry.normalized_power_watts : ''
  );
  const [tssInput, setTssInput] = useState<number | ''>(
    entry.tss_score != null ? entry.tss_score : ''
  );
  const [minElevationInput, setMinElevationInput] = useState<number | ''>(
    entry.min_elevation_meters != null ? entry.min_elevation_meters : ''
  );
  const [maxElevationInput, setMaxElevationInput] = useState<number | ''>(
    entry.max_elevation_meters != null ? entry.max_elevation_meters : ''
  );
  const [avgMovingSpeedInput, setAvgMovingSpeedInput] = useState<number | ''>(
    entry.avg_moving_speed_mps != null ? entry.avg_moving_speed_mps : ''
  );
  const [weatherTempInput, setWeatherTempInput] = useState<number | ''>(
    entry.weather_temp_celsius != null ? entry.weather_temp_celsius : ''
  );
  const [windSpeedInput, setWindSpeedInput] = useState<number | ''>(
    entry.weather_wind_speed_mps != null ? entry.weather_wind_speed_mps : ''
  );
  const [humidityInput, setHumidityInput] = useState<number | ''>(
    entry.weather_humidity_percentage != null
      ? entry.weather_humidity_percentage
      : ''
  );

  const providerName = providerDumps[0]?.provider_name || 'Garmin';
  const { data: activityData, isFetched: activityDataFetched } =
    useActivityDetailsQuery(open ? entry.id : '', providerName);

  // Seed the telemetry inputs once per dialog opening, not on every
  // `activityData` identity change. TanStack Query can refetch
  // useActivityDetailsQuery in the background (refocus, revalidation) while
  // the dialog stays open; without this guard, that refetch re-runs the
  // whole seeding block below and overwrites any field the user has already
  // typed into but not yet saved.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasSeededRef.current = false;
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || hasSeededRef.current || !activityDataFetched) return;
    hasSeededRef.current = true;
    const extracted = extractTelemetry(entry, activityData);
    if (extracted.maxHeartRate !== '')
      setMaxHeartRateInput(extracted.maxHeartRate);
    if (extracted.avgRespiration !== '')
      setAvgRespirationInput(extracted.avgRespiration);
    if (extracted.maxRespiration !== '')
      setMaxRespirationInput(extracted.maxRespiration);
    if (extracted.avgSpeedMps !== '')
      setAvgSpeedMpsInput(extracted.avgSpeedMps);
    if (extracted.maxSpeedMps !== '')
      setMaxSpeedMpsInput(extracted.maxSpeedMps);
    if (extracted.avgCadence !== '') setAvgCadenceInput(extracted.avgCadence);
    if (extracted.maxCadence !== '') setMaxCadenceInput(extracted.maxCadence);
    if (extracted.avgPowerWatts !== '')
      setAvgPowerWattsInput(extracted.avgPowerWatts);
    if (extracted.maxPowerWatts !== '')
      setMaxPowerWattsInput(extracted.maxPowerWatts);
    if (extracted.elevationGain !== '')
      setElevationGainInput(extracted.elevationGain);
    if (extracted.elevationLoss !== '')
      setElevationLossInput(extracted.elevationLoss);
    if (extracted.floorsClimbed !== '')
      setFloorsClimbedInput(extracted.floorsClimbed);
    if (extracted.strokeCount !== '')
      setStrokeCountInput(extracted.strokeCount);
    if (extracted.trainingLoad !== '')
      setTrainingLoadInput(extracted.trainingLoad);
    if (extracted.aerobicEffect !== '')
      setAerobicEffectInput(extracted.aerobicEffect);
    if (extracted.anaerobicEffect !== '')
      setAnaerobicEffectInput(extracted.anaerobicEffect);
    if (extracted.vo2Max !== '') setVo2MaxInput(extracted.vo2Max);
    if (extracted.avgTemp !== '') setTempCelsiusInput(extracted.avgTemp);
    if (extracted.weatherCondition)
      setWeatherCondInput(extracted.weatherCondition);
    if (extracted.gearName) setGearNameInput(extracted.gearName);
    if (extracted.steps !== '') setStepsInput(extracted.steps);
    if (extracted.waterEstimated !== '')
      setWaterEstimatedInput(extracted.waterEstimated);
    if (extracted.movingTime !== '') setMovingTimeInput(extracted.movingTime);
    if (extracted.elapsedTime !== '')
      setElapsedTimeInput(extracted.elapsedTime);
    if (extracted.activeCalories !== '')
      setActiveCaloriesInput(extracted.activeCalories);
    if (extracted.restingCalories !== '')
      setRestingCaloriesInput(extracted.restingCalories);
    if (extracted.groundContact !== '')
      setGroundContactInput(extracted.groundContact);
    if (extracted.verticalOscillation !== '')
      setVerticalOscillationInput(extracted.verticalOscillation);
    if (extracted.strideLength !== '')
      setStrideLengthInput(extracted.strideLength);
    if (extracted.normPower !== '') setNormPowerInput(extracted.normPower);
    if (extracted.tss !== '') setTssInput(extracted.tss);
    if (extracted.minElevation !== '')
      setMinElevationInput(extracted.minElevation);
    if (extracted.maxElevation !== '')
      setMaxElevationInput(extracted.maxElevation);
    if (extracted.avgMovingSpeed !== '')
      setAvgMovingSpeedInput(extracted.avgMovingSpeed);
    if (extracted.weatherTemp !== '')
      setWeatherTempInput(extracted.weatherTemp);
    if (extracted.windSpeed !== '') setWindSpeedInput(extracted.windSpeed);
    if (extracted.humidity !== '') setHumidityInput(extracted.humidity);
    if (entry.duration_minutes != null && entry.duration_minutes > 0) {
      setDurationInput(Math.round(Number(entry.duration_minutes) * 100) / 100);
    }
  }, [open, entry, activityData, activityDataFetched]);

  const { mutateAsync: updateExerciseEntry, isPending: loading } =
    useUpdateExerciseEntryMutation();
  const queryClient = useQueryClient();

  const handleCopyRawData = async () => {
    setIsCopying(true);
    try {
      const providerName = providerDumps[0]?.provider_name || 'Garmin';
      let details: unknown = null;
      try {
        details = await queryClient.fetchQuery(
          fetchActivityDetailsOptions(entry.id, providerName)
        );
      } catch {
        details = entry.activity_details || providerDumps;
      }

      const jsonString = JSON.stringify(details, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      error(loggingLevel, 'Failed to copy raw activity data:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };
  const triggerCalorieWarning = () => {
    if (!entry.calories_burned) {
      setCaloriesBurnedInput('');
      setShowCaloriesWarning(true);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImageUrl(null);
  };

  const handleSetChange = (
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: string | number | undefined
  ) => {
    setSets((prev) =>
      prev.map((set, i) => (i !== setIndex ? set : { ...set, [field]: value }))
    );
    triggerCalorieWarning();
  };

  const handleAddSet = () => {
    setSets((prev) => {
      const lastSet = prev[prev.length - 1] ?? {
        ...defaultSetForModality(modality),
        _dndId: uuidv4(),
      };
      return [
        ...prev,
        {
          ...lastSet,
          set_number: prev.length + 1,
          _dndId: uuidv4(),
        },
      ];
    });
    triggerCalorieWarning();
  };

  const handleDuplicateSet = (setIndex: number) => {
    setSets((prev) => {
      const setToDuplicate = prev[setIndex];
      if (!setToDuplicate) return prev;
      return [
        ...prev.slice(0, setIndex + 1),
        { ...setToDuplicate, _dndId: uuidv4() },
        ...prev.slice(setIndex + 1),
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
    });
    triggerCalorieWarning();
  };

  const handleRemoveSet = (setIndex: number) => {
    setSets((prev) =>
      prev
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, set_number: i + 1 }))
    );
    triggerCalorieWarning();
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSets((items) => {
        const oldIndex = items.findIndex((s) => s._dndId === active.id);
        const newIndex = items.findIndex((s) => s._dndId === over.id);
        return arrayMove(items, oldIndex, newIndex).map((set, index) => ({
          ...set,
          set_number: index + 1,
        }));
      });
    }
  };

  const handleSave = async () => {
    info(loggingLevel, 'EditExerciseEntryDialog: saving entry:', entry.id);
    try {
      const exerciseData = await queryClient.fetchQuery(
        exerciseDetailsOptions(entry.exercise_id)
      );
      const caloriesPerHour =
        (exerciseData as { calories_per_hour?: number })?.calories_per_hour ||
        300;

      const totalDuration =
        durationInput !== ''
          ? Number(durationInput)
          : cardioForm
            ? 0
            : setsDurationMinutes(sets);

      const caloriesBurned =
        caloriesBurnedInput !== '' && caloriesBurnedInput !== 0
          ? caloriesBurnedInput
          : Math.round((caloriesPerHour / 60) * totalDuration);

      // Cardio performance also lives on its single backing set (issue
      // #1903): duration in seconds + distance in km, no between-set rest.
      // These agree with the entry-level totals below by construction. A
      // multi-set cardio entry keeps its rows untouched instead.
      const cardioSetValues = cardioForm
        ? {
            duration:
              durationInput === ''
                ? null
                : Math.round(Number(durationInput) * 60),
            distance:
              distanceInput === ''
                ? null
                : convertDistance(Number(distanceInput), distanceUnit, 'km'),
            rest_time: 0,
          }
        : null;

      await updateExerciseEntry({
        id: entry.id,
        data: {
          duration_minutes: totalDuration,
          calories_burned: caloriesBurned,
          notes,
          entry_time: entryTime || null,
          sets: sets.map(({ _dndId, ...set }) => ({
            ...set,
            weight: set.weight ?? null,
            ...(cardioSetValues ?? {}),
          })),
          imageFile,
          image_url: imageUrl,
          distance:
            distanceInput === ''
              ? null
              : convertDistance(Number(distanceInput), distanceUnit, 'km'),
          avg_heart_rate:
            avgHeartRateInput === '' ? 0 : Number(avgHeartRateInput),
          max_heart_rate:
            maxHeartRateInput === '' ? null : Number(maxHeartRateInput),
          avg_respiration_brpm:
            avgRespirationInput === '' ? null : Number(avgRespirationInput),
          max_respiration_brpm:
            maxRespirationInput === '' ? null : Number(maxRespirationInput),
          avg_speed_mps:
            avgSpeedMpsInput === '' ? null : Number(avgSpeedMpsInput),
          max_speed_mps:
            maxSpeedMpsInput === '' ? null : Number(maxSpeedMpsInput),
          avg_cadence: avgCadenceInput === '' ? null : Number(avgCadenceInput),
          max_cadence: maxCadenceInput === '' ? null : Number(maxCadenceInput),
          avg_power_watts:
            avgPowerWattsInput === '' ? null : Number(avgPowerWattsInput),
          max_power_watts:
            maxPowerWattsInput === '' ? null : Number(maxPowerWattsInput),
          elevation_gain_meters:
            elevationGainInput === '' ? null : Number(elevationGainInput),
          elevation_loss_meters:
            elevationLossInput === '' ? null : Number(elevationLossInput),
          floors_climbed:
            floorsClimbedInput === '' ? null : Number(floorsClimbedInput),
          stroke_count:
            strokeCountInput === '' ? null : Number(strokeCountInput),
          training_load:
            trainingLoadInput === '' ? null : Number(trainingLoadInput),
          aerobic_training_effect:
            aerobicEffectInput === '' ? null : Number(aerobicEffectInput),
          anaerobic_training_effect:
            anaerobicEffectInput === '' ? null : Number(anaerobicEffectInput),
          vo2_max_estimate: vo2MaxInput === '' ? null : Number(vo2MaxInput),
          avg_temperature_celsius:
            tempCelsiusInput === '' ? null : Number(tempCelsiusInput),
          weather_condition: weatherCondInput || null,
          gear_name: gearNameInput || null,
          steps: stepsInput === '' ? null : Number(stepsInput),
          water_estimated:
            waterEstimatedInput === '' ? null : Number(waterEstimatedInput),
          moving_time_seconds:
            movingTimeInput === '' ? null : Number(movingTimeInput),
          elapsed_time_seconds:
            elapsedTimeInput === '' ? null : Number(elapsedTimeInput),
          active_calories:
            activeCaloriesInput === '' ? null : Number(activeCaloriesInput),
          resting_calories:
            restingCaloriesInput === '' ? null : Number(restingCaloriesInput),
          ground_contact_time_ms:
            groundContactInput === '' ? null : Number(groundContactInput),
          vertical_oscillation_mm:
            verticalOscillationInput === ''
              ? null
              : Number(verticalOscillationInput),
          stride_length_cm:
            strideLengthInput === '' ? null : Number(strideLengthInput),
          normalized_power_watts:
            normPowerInput === '' ? null : Number(normPowerInput),
          tss_score: tssInput === '' ? null : Number(tssInput),
          min_elevation_meters:
            minElevationInput === '' ? null : Number(minElevationInput),
          max_elevation_meters:
            maxElevationInput === '' ? null : Number(maxElevationInput),
          avg_moving_speed_mps:
            avgMovingSpeedInput === '' ? null : Number(avgMovingSpeedInput),
          weather_temp_celsius:
            weatherTempInput === '' ? null : Number(weatherTempInput),
          weather_wind_speed_mps:
            windSpeedInput === '' ? null : Number(windSpeedInput),
          weather_humidity_percentage:
            humidityInput === '' ? null : Number(humidityInput),
          activity_details: [
            ...activityDetails.map((detail) => ({
              id: detail.id,
              provider_name: detail.provider_name,
              detail_type: detail.key,
              detail_data: detail.value,
            })),
            ...providerDumps.map((dump: RawActivityDetailItem) => ({
              id: dump.id,
              provider_name: dump.provider_name,
              detail_type: dump.detail_type,
              detail_data: null,
            })),
          ],
        },
      });

      info(
        loggingLevel,
        'EditExerciseEntryDialog: saved successfully:',
        entry.id
      );
      onOpenChange(false);
      onSave();
    } catch (err) {
      error(loggingLevel, 'EditExerciseEntryDialog: error saving:', err);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        debug(loggingLevel, 'EditExerciseEntryDialog: open state changed:', o);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('exercise.editExerciseEntryDialog.title', 'Edit Exercise Entry')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.editExerciseEntryDialog.description',
              "Make changes to your exercise entry here. Click save when you're done."
            )}
          </DialogDescription>
        </DialogHeader>

        {showCaloriesWarning && (
          <Alert
            variant="default"
            className="bg-yellow-100 border-yellow-400 text-yellow-700 relative py-2"
          >
            <AlertDescription>
              {t(
                'exercise.editExerciseEntryDialog.caloriesWarning',
                'Calories burned will be recalculated on save. Enter a value to override.'
              )}
            </AlertDescription>
            <button
              onClick={() => setShowCaloriesWarning(false)}
              className="absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {/* Exercise name (read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="exercise-name" className="text-sm">
              {t('exercise.editExerciseEntryDialog.exerciseLabel', 'Exercise')}
            </Label>
            <Input
              id="exercise-name"
              value={
                entry.exercise_snapshot?.name ||
                t(
                  'exercise.editExerciseEntryDialog.unknownExercise',
                  'Unknown Exercise'
                )
              }
              disabled
              className="bg-muted"
            />
          </div>

          {/* ── Cardio log or strength sets ── */}
          {cardioForm ? (
            <CardioLog
              durationMinutes={durationInput}
              distance={distanceInput}
              caloriesBurned={caloriesBurnedInput}
              avgHeartRate={avgHeartRateInput}
              rpe={sets[0]?.rpe ?? ''}
              distanceUnit={distanceUnit}
              onDurationChange={setDurationInput}
              onDistanceChange={setDistanceInput}
              onCaloriesChange={setCaloriesBurnedInput}
              onAvgHeartRateChange={setAvgHeartRateInput}
              onRpeChange={(v) =>
                setSets((prev) =>
                  prev.map((s, i) =>
                    i === 0 ? { ...s, rpe: v === '' ? null : Number(v) } : s
                  )
                )
              }
            />
          ) : (
            <div className="space-y-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SetColumnHeaders modality={toSetTableModality(modality)} />
                <SortableContext items={sets.map((set) => set._dndId)}>
                  <div className="space-y-0.5">
                    {sets.map((set, setIndex) => (
                      <SortableSetItem
                        id={set._dndId}
                        key={set._dndId}
                        set={set}
                        setIndex={setIndex}
                        exerciseIndex={0}
                        onSetChange={(_, sIdx, field, value) =>
                          handleSetChange(sIdx, field, value ?? undefined)
                        }
                        onDuplicateSet={(_, sIdx) => handleDuplicateSet(sIdx)}
                        onRemoveSet={(_, sIdx) => handleRemoveSet(sIdx)}
                        weightUnit={weightUnit}
                        modality={toSetTableModality(modality)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSet}
                className="mt-1"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('exercise.editExerciseEntryDialog.addSetButton', 'Add Set')}
              </Button>
            </div>
          )}

          {/* Start Time (optional) */}
          <div className="space-y-1.5 max-w-[280px]">
            <div className="flex items-center justify-between">
              <Label htmlFor="entryTime" className="text-sm">
                Start Time (optional)
              </Label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEntryTime('')}
                  disabled={!entryTime}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium text-muted-foreground shadow-sm hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Clear time"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { hour, minute } = userHourMinute(timezone);
                    setEntryTime(
                      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Set to current local time"
                >
                  <Clock className="h-4 w-4" />
                  Now
                </button>
              </div>
            </div>
            <Input
              id="entryTime"
              type="time"
              value={entryTime}
              onChange={(e) => setEntryTime(e.target.value)}
              className="text-sm h-9"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">
              {t('exercise.editExerciseEntryDialog.notesLabel', 'Notes')}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              rows={2}
              className="resize-none text-sm"
              placeholder={t(
                'exercise.editExerciseEntryDialog.notesPlaceholder',
                'Add any notes about this exercise...'
              )}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Exercise history */}
          <ExerciseHistoryDisplay exerciseId={entry.exercise_id} />

          {/* ── Advanced (collapsible) ── */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground px-2"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    advancedOpen && 'rotate-180'
                  )}
                />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('common.advanced', 'Advanced')}
                </span>
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-3 pt-2">
              {/* Calories override — strength only */}
              {!cardioForm && (
                <div className="space-y-1.5">
                  <Label htmlFor="calories-burned" className="text-sm">
                    {t(
                      'exercise.editExerciseEntryDialog.caloriesBurnedOptionalLabel',
                      'Calories burned (optional)'
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="calories-burned"
                      type="number"
                      value={caloriesBurnedInput}
                      onChange={(e) =>
                        setCaloriesBurnedInput(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder={t(
                        'exercise.editExerciseEntryDialog.caloriesBurnedPlaceholder',
                        'Auto-calculated if left blank'
                      )}
                      className="pr-8"
                    />
                    {caloriesBurnedInput !== '' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCaloriesBurnedInput('');
                          setShowCaloriesWarning(true);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Duration & Avg heart rate — strength only */}
              {!cardioForm && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="duration-minutes" className="text-sm">
                      {t(
                        'exercise.editExerciseEntryDialog.durationLabel',
                        'Total Duration (minutes)'
                      )}
                    </Label>
                    <Input
                      id="duration-minutes"
                      type="number"
                      step="0.1"
                      value={durationInput}
                      onChange={(e) =>
                        setDurationInput(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder="Auto-calculated from sets"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="avg-heart-rate" className="text-sm">
                      {t(
                        'exercise.editExerciseEntryDialog.avgHeartRateLabel',
                        'Average heart rate (bpm)'
                      )}
                    </Label>
                    <Input
                      id="avg-heart-rate"
                      type="number"
                      value={avgHeartRateInput}
                      onChange={(e) =>
                        setAvgHeartRateInput(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder="0"
                    />
                  </div>
                </>
              )}

              {/* GPS Route Map & Lap Splits */}
              <WorkoutGpsMap
                gpsPoints={gpsData?.points}
                isLoading={gpsLoading}
              />
              <WorkoutLapsTable laps={lapsData} isLoading={lapsLoading} />

              {/* Telemetry & Detailed Metrics */}
              <div className="border border-border rounded-xl p-3.5 bg-muted/20 space-y-4">
                <div className="flex items-center gap-2 pb-1.5 border-b border-border/60">
                  <Activity className="w-4 h-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {t(
                      'exercise.editExerciseEntryDialog.telemetryHeader',
                      'Telemetry & Activity Metrics'
                    )}
                  </h4>
                </div>

                {/* 🫀 Heart Rate & Respiration */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                    <Heart className="w-4.5 h-4.5" />
                    <span>Heart Rate & Respiration</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Max HR (bpm)</Label>
                      <Input
                        type="number"
                        value={maxHeartRateInput}
                        onChange={(e) =>
                          setMaxHeartRateInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 175"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Avg Respiration (brpm)</Label>
                      <Input
                        type="number"
                        value={avgRespirationInput}
                        onChange={(e) =>
                          setAvgRespirationInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 18"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Respiration (brpm)</Label>
                      <Input
                        type="number"
                        value={maxRespirationInput}
                        onChange={(e) =>
                          setMaxRespirationInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 35"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* ⚡ Speed, Cadence & Power */}
                <div className="space-y-2 pt-2.5 border-t border-border/40">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
                    <Zap className="w-4.5 h-4.5" />
                    <span>Speed, Cadence & Power</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Avg Speed (m/s)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={avgSpeedMpsInput}
                        onChange={(e) =>
                          setAvgSpeedMpsInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 3.2"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Speed (m/s)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={maxSpeedMpsInput}
                        onChange={(e) =>
                          setMaxSpeedMpsInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 5.1"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Avg Moving Speed (m/s)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={avgMovingSpeedInput}
                        onChange={(e) =>
                          setAvgMovingSpeedInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 3.4"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Avg Cadence (spm/rpm)</Label>
                      <Input
                        type="number"
                        value={avgCadenceInput}
                        onChange={(e) =>
                          setAvgCadenceInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 165"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Cadence</Label>
                      <Input
                        type="number"
                        value={maxCadenceInput}
                        onChange={(e) =>
                          setMaxCadenceInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 180"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Avg Power (W)</Label>
                      <Input
                        type="number"
                        value={avgPowerWattsInput}
                        onChange={(e) =>
                          setAvgPowerWattsInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 210"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Power (W)</Label>
                      <Input
                        type="number"
                        value={maxPowerWattsInput}
                        onChange={(e) =>
                          setMaxPowerWattsInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 450"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Norm Power (W)</Label>
                      <Input
                        type="number"
                        value={normPowerInput}
                        onChange={(e) =>
                          setNormPowerInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 225"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">TSS Score</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={tssInput}
                        onChange={(e) =>
                          setTssInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 65"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 🏃 Running Dynamics */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500">
                    <Footprints className="w-3.5 h-3.5" />
                    <span>Running Dynamics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Ground Contact (ms)</Label>
                      <Input
                        type="number"
                        value={groundContactInput}
                        onChange={(e) =>
                          setGroundContactInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 240"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Vert Oscillation (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={verticalOscillationInput}
                        onChange={(e) =>
                          setVerticalOscillationInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 8.2"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stride Length (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={strideLengthInput}
                        onChange={(e) =>
                          setStrideLengthInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 115"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* ⛰️ Elevation & Swimming */}
                <div className="space-y-2 pt-2.5 border-t border-border/40">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500">
                    <Mountain className="w-4.5 h-4.5" />
                    <span>Elevation & Swimming</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Elevation Gain (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={elevationGainInput}
                        onChange={(e) =>
                          setElevationGainInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 120"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Elevation Loss (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={elevationLossInput}
                        onChange={(e) =>
                          setElevationLossInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 115"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Min Elevation (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={minElevationInput}
                        onChange={(e) =>
                          setMinElevationInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 15"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Elevation (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={maxElevationInput}
                        onChange={(e) =>
                          setMaxElevationInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 145"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Floors Climbed</Label>
                      <Input
                        type="number"
                        value={floorsClimbedInput}
                        onChange={(e) =>
                          setFloorsClimbedInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 12"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stroke Count</Label>
                      <Input
                        type="number"
                        value={strokeCountInput}
                        onChange={(e) =>
                          setStrokeCountInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 450"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Steps</Label>
                      <Input
                        type="number"
                        value={stepsInput}
                        onChange={(e) =>
                          setStepsInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 4500"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Est. Water Loss (mL)</Label>
                      <Input
                        type="number"
                        value={waterEstimatedInput}
                        onChange={(e) =>
                          setWaterEstimatedInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 650"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* ⏱️ Time & Calorie Breakdown */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Time & Calorie Breakdown</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Moving Time (sec)</Label>
                      <Input
                        type="number"
                        value={movingTimeInput}
                        onChange={(e) =>
                          setMovingTimeInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 1200"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Elapsed Time (sec)</Label>
                      <Input
                        type="number"
                        value={elapsedTimeInput}
                        onChange={(e) =>
                          setElapsedTimeInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 1350"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Active Calories (kcal)</Label>
                      <Input
                        type="number"
                        value={activeCaloriesInput}
                        onChange={(e) =>
                          setActiveCaloriesInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 350"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Resting Calories (kcal)</Label>
                      <Input
                        type="number"
                        value={restingCaloriesInput}
                        onChange={(e) =>
                          setRestingCaloriesInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 45"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 🎯 Training Load & Performance */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-500">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Training Load & Performance</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Training Load</Label>
                      <Input
                        type="number"
                        value={trainingLoadInput}
                        onChange={(e) =>
                          setTrainingLoadInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 85"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Aerobic Effect (0-5)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={aerobicEffectInput}
                        onChange={(e) =>
                          setAerobicEffectInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 3.2"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Anaerobic Effect (0-5)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={anaerobicEffectInput}
                        onChange={(e) =>
                          setAnaerobicEffectInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 1.5"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">VO2 Max Estimate</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={vo2MaxInput}
                        onChange={(e) =>
                          setVo2MaxInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 48.5"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 🌤️ Environment & Gear */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-500">
                    <Sun className="w-3.5 h-3.5" />
                    <span>Environment & Gear</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <Label className="text-xs">Avg Temp (°C)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={tempCelsiusInput}
                        onChange={(e) =>
                          setTempCelsiusInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 24"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Weather Temp (°C)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={weatherTempInput}
                        onChange={(e) =>
                          setWeatherTempInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 22"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Weather Condition</Label>
                      <Input
                        type="text"
                        value={weatherCondInput}
                        onChange={(e) => setWeatherCondInput(e.target.value)}
                        placeholder="e.g. Sunny"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Wind Speed (m/s)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={windSpeedInput}
                        onChange={(e) =>
                          setWindSpeedInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 3.5"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Humidity (%)</Label>
                      <Input
                        type="number"
                        value={humidityInput}
                        onChange={(e) =>
                          setHumidityInput(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="e.g. 60"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Gear Name</Label>
                      <Input
                        type="text"
                        value={gearNameInput}
                        onChange={(e) => setGearNameInput(e.target.value)}
                        placeholder="e.g. Nike Pegasus 40"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom activity details */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {t(
                    'exercise.editExerciseEntryDialog.customActivityDetailsLabel',
                    'Custom activity details'
                  )}
                </Label>

                {providerDumps.length > 0 && (
                  <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs space-y-2 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        {t(
                          'exercise.editExerciseEntryDialog.syncedProviderBackup',
                          'Synced Provider Backup (Protected)'
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isCopying}
                        onClick={handleCopyRawData}
                        className="h-7 px-2.5 text-xs gap-1.5"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            {t('common.copied', 'Copied!')}
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            {t('common.copyRawJson', 'Copy Raw JSON')}
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {providerDumps
                        .map((d: RawActivityDetailItem) => {
                          const name = d.provider_name
                            ? d.provider_name.charAt(0).toUpperCase() +
                              d.provider_name.slice(1)
                            : 'Provider';
                          return `${name} (${d.detail_type})`;
                        })
                        .join(', ')}
                    </p>
                  </div>
                )}

                <ExerciseActivityDetailsEditor
                  initialData={activityDetails}
                  onChange={setActivityDetails}
                />
              </div>

              {/* Image */}
              <div className="space-y-1.5">
                <Label htmlFor="image" className="text-sm">
                  {t('exercise.editExerciseEntryDialog.imageLabel', 'Photo')}
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                {(imageUrl || imageFile) && (
                  <div className="mt-1 relative w-24 h-24">
                    <img
                      src={
                        imageFile
                          ? URL.createObjectURL(imageFile)
                          : imageUrl || ''
                      }
                      alt="Exercise"
                      className="h-full w-full object-cover rounded-md"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={handleClearImage}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading
              ? t('common.saving', 'Saving...')
              : t('common.saveChanges', 'Save Changes')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExerciseEntryDialog;
