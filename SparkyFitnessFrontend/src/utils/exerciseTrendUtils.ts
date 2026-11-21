import {
  effectiveLoadKg,
  countedTrendSets,
  exerciseTrendEntryValueKg,
  resolveExerciseModality,
  type ExerciseProgressResponse,
} from '@workspace/shared';

type ProgressSet = ExerciseProgressResponse['sets'][number];

/**
 * The load a set moved: its weight, or for a bodyweight exercise the lifter's
 * body weight that day plus the added (or minus the assisting) weight.
 */
const setLoad = (entry: ExerciseProgressResponse, set: ProgressSet): number =>
  effectiveLoadKg(
    set.weight,
    resolveExerciseModality(entry.modality, entry.category),
    entry.body_weight_kg
  );

// Per-entry values come from the shared rule the mobile exercise card uses
// too: warm-ups, sets without reps and untouched workout-plan rows never count.
// A day with only warm-ups or an untouched plan row has no point, rather
// than a point at 0.
const hasCountedSets = (entry: ExerciseProgressResponse): boolean =>
  countedTrendSets(entry).length > 0;

const entryVolume = (entry: ExerciseProgressResponse): number =>
  exerciseTrendEntryValueKg(entry, 'volume');

const entryMaxLoad = (entry: ExerciseProgressResponse): number =>
  exerciseTrendEntryValueKg(entry, 'maxLoad');

const entryMaxEstimated1RM = (entry: ExerciseProgressResponse): number =>
  exerciseTrendEntryValueKg(entry, 'estimated1RM');

/**
 * Returns the Monday (week start) of the week containing the given date.
 */
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getTrendDateFormat = (aggregationLevel?: string) => {
  if (aggregationLevel === 'weekly' || aggregationLevel === 'week') {
    // Year included: without it, the week of Jan 05 2025 and Jan 05 2026 produce
    // the same label, so they collide into one bucket and sort against each other.
    return 'MMM dd, yyyy'; // applied to week-start date
  }
  if (aggregationLevel === 'monthly' || aggregationLevel === 'month') {
    return 'MMM yyyy';
  }
  if (aggregationLevel === 'yearly' || aggregationLevel === 'year') {
    return 'yyyy';
  }
  return 'MMM dd, yyyy';
};

/**
 * Given an entry date and aggregation level, returns the Date to use as the bucket key.
 * For weekly aggregation this snaps to the Monday of that week.
 */
const getBucketDate = (date: Date, aggregationLevel: string): Date => {
  if (aggregationLevel === 'weekly' || aggregationLevel === 'week') {
    return getWeekStart(date);
  }
  return date;
};

export const calculateVolumeTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date,
  aggregationLevel: string = 'daily'
) => {
  const formatStr = getTrendDateFormat(aggregationLevel);
  return Object.values(exerciseProgressData)
    .flat()
    .filter(hasCountedSets)
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          getBucketDate(parseISO(entry.entry_date), aggregationLevel),
          formatStr
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, volume: 0, comparisonVolume: 0 };
          acc.push(existingEntry);
        }

        existingEntry.volume += entryVolume(entry);

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          existingEntry.comparisonVolume += entryVolume(comparisonEntry);
        }
        return acc;
      },
      [] as { date: string; volume: number; comparisonVolume: number }[]
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const calculateMaxWeightTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date,
  aggregationLevel: string = 'daily'
) => {
  const formatStr = getTrendDateFormat(aggregationLevel);
  return Object.values(exerciseProgressData)
    .flat()
    .filter(hasCountedSets)
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          getBucketDate(parseISO(entry.entry_date), aggregationLevel),
          formatStr
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, maxWeight: 0, comparisonMaxWeight: 0 };
          acc.push(existingEntry);
        }

        existingEntry.maxWeight = Math.max(
          existingEntry.maxWeight,
          entryMaxLoad(entry)
        );

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          existingEntry.comparisonMaxWeight = Math.max(
            existingEntry.comparisonMaxWeight,
            entryMaxLoad(comparisonEntry)
          );
        }
        return acc;
      },
      [] as { date: string; maxWeight: number; comparisonMaxWeight: number }[]
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const calculateEstimated1RMTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date,
  aggregationLevel: string = 'daily'
) => {
  const formatStr = getTrendDateFormat(aggregationLevel);
  return Object.values(exerciseProgressData)
    .flat()
    .filter(hasCountedSets)
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          getBucketDate(parseISO(entry.entry_date), aggregationLevel),
          formatStr
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, estimated1RM: 0, comparisonEstimated1RM: 0 };
          acc.push(existingEntry);
        }

        existingEntry.estimated1RM = Math.max(
          existingEntry.estimated1RM,
          entryMaxEstimated1RM(entry)
        );

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          existingEntry.comparisonEstimated1RM = Math.max(
            existingEntry.comparisonEstimated1RM,
            entryMaxEstimated1RM(comparisonEntry)
          );
        }
        return acc;
      },
      [] as {
        date: string;
        estimated1RM: number;
        comparisonEstimated1RM: number;
      }[]
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const calculateRepsVsWeightScatterData = (
  exerciseData: ExerciseProgressResponse[]
) => {
  const repWeightMap = new Map<
    number,
    { totalWeight: number; count: number }
  >();

  exerciseData
    .flatMap((entry) =>
      countedTrendSets(entry).map((set) => ({
        reps: set.reps,
        weight: setLoad(entry, set),
      }))
    )
    .forEach((item) => {
      if (repWeightMap.has(item.reps ?? 0)) {
        const existing = repWeightMap.get(item.reps ?? 0)!;
        existing.totalWeight += item.weight ?? 0;
        existing.count += 1;
      } else {
        repWeightMap.set(item.reps ?? 0, {
          totalWeight: item.weight ?? 0,
          count: 1,
        });
      }
    });

  return Array.from(repWeightMap.entries())
    .map(([reps, { totalWeight, count }]) => ({
      reps,
      averageWeight: Math.round(totalWeight / count),
    }))
    .sort((a, b) => a.reps - b.reps);
};

export const calculateTimeUnderTensionData = (
  exerciseData: ExerciseProgressResponse[],
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date
) => {
  return exerciseData.map((d) => ({
    ...d,
    date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
    timeUnderTension:
      d.sets.reduce((sum, set) => sum + (set.duration || 0), 0) / 60,
  }));
};

export const extractTelemetryActivityEntries = (
  exerciseProgressData: Record<string, ExerciseProgressResponse[]>,
  selectedExercise: string,
  parseISO: (dateString: string) => Date
) => {
  const allTelemetryActivityEntries: ExerciseProgressResponse[] = [];
  const seenPresetIds = new Set<string>();

  // Every provider listed here now writes relational telemetry (laps at minimum) on
  // sync/import — see garminActivityProcessor.ts, fitImportService.ts,
  // stravaDataProcessor.ts, and the workout handler in healthDataHandlers.ts —
  // so the activity detail view has real data to show for all of them.
  //
  // Matched case-insensitively: provider_name casing is not consistent across
  // the ingest paths (Strava writes 'Strava', Garmin writes 'garmin', mobile
  // writes 'HealthKit'/'Health Connect'), and an exact-match set silently hides
  // a provider's activities the moment one side changes case.
  const TELEMETRY_PROVIDERS = new Set([
    'garmin',
    'garmin_fit',
    'strava',
    'coros_mcp',
    'healthkit',
    'health connect',
  ]);

  // Mobile sync writes a row for every workout the phone knows about, including
  // strength sessions and entries that predate telemetry capture, so source
  // alone would render an empty activity card (~5 queries) for each of them.
  // Garmin and Strava sync only ever writes activities that carry telemetry, so
  // they stay gated on source and keep working against a server too old to send
  // has_telemetry — which is also why this compares to true explicitly: an
  // absent flag must fail closed here rather than pass as truthy.
  const REQUIRES_TELEMETRY_FLAG = new Set(['healthkit', 'health connect']);

  const processEntry = (entry: ExerciseProgressResponse) => {
    const source = entry.provider_name?.toLowerCase();
    if (
      source &&
      TELEMETRY_PROVIDERS.has(source) &&
      entry.exercise_entry_id &&
      (!REQUIRES_TELEMETRY_FLAG.has(source) || entry.has_telemetry === true)
    ) {
      const presetId = (entry as Record<string, unknown>)[
        'exercise_preset_entry_id'
      ] as string | undefined;

      if (presetId) {
        if (!seenPresetIds.has(presetId)) {
          seenPresetIds.add(presetId);
          allTelemetryActivityEntries.push(entry);
        }
      } else {
        if (!seenPresetIds.has(entry.exercise_entry_id)) {
          seenPresetIds.add(entry.exercise_entry_id);
          allTelemetryActivityEntries.push(entry);
        }
      }
    }
  };

  if (selectedExercise === 'All') {
    Object.values(exerciseProgressData).forEach((dataArray) => {
      dataArray.forEach(processEntry);
    });
  } else if (selectedExercise && exerciseProgressData[selectedExercise]) {
    exerciseProgressData[selectedExercise].forEach(processEntry);
  }

  return allTelemetryActivityEntries.sort(
    (a, b) =>
      parseISO(b.entry_date).getTime() - parseISO(a.entry_date).getTime()
  );
};
