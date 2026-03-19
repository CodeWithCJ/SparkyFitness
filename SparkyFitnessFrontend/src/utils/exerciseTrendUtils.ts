import { ExerciseProgressData } from '@/types/reports';

export const calculateVolumeTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressData[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressData[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date
) => {
  return Object.values(exerciseProgressData)
    .flat()
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          parseISO(entry.entry_date),
          'MMM dd, yyyy'
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, volume: 0, comparisonVolume: 0 };
          acc.push(existingEntry);
        }

        const currentVolume = entry.sets.reduce(
          (sum, set) => sum + set.reps * set.weight,
          0
        );
        existingEntry.volume += currentVolume;

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          const compVolume = comparisonEntry.sets.reduce(
            (sum, set) => sum + set.reps * set.weight,
            0
          );
          existingEntry.comparisonVolume += compVolume;
        }
        return acc;
      },
      [] as { date: string; volume: number; comparisonVolume: number }[]
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const calculateMaxWeightTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressData[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressData[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date
) => {
  return Object.values(exerciseProgressData)
    .flat()
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          parseISO(entry.entry_date),
          'MMM dd, yyyy'
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, maxWeight: 0, comparisonMaxWeight: 0 };
          acc.push(existingEntry);
        }

        const currentMaxWeight = Math.max(
          ...entry.sets.map((set) => set.weight)
        );
        existingEntry.maxWeight = Math.max(
          existingEntry.maxWeight,
          currentMaxWeight
        );

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          const compMaxWeight = Math.max(
            ...comparisonEntry.sets.map((set) => set.weight)
          );
          existingEntry.comparisonMaxWeight = Math.max(
            existingEntry.comparisonMaxWeight,
            compMaxWeight
          );
        }
        return acc;
      },
      [] as { date: string; maxWeight: number; comparisonMaxWeight: number }[]
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const calculateEstimated1RMTrendData = (
  exerciseProgressData: Record<string, ExerciseProgressData[]>,
  comparisonExerciseProgressData: Record<string, ExerciseProgressData[]>,
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date
) => {
  return Object.values(exerciseProgressData)
    .flat()
    .reduce(
      (acc, entry) => {
        const date = formatDateInUserTimezone(
          parseISO(entry.entry_date),
          'MMM dd, yyyy'
        );
        let existingEntry = acc.find((item) => item.date === date);

        if (!existingEntry) {
          existingEntry = { date, estimated1RM: 0, comparisonEstimated1RM: 0 };
          acc.push(existingEntry);
        }

        const currentMax1RM = Math.max(
          ...entry.sets.map((set) => set.weight * (1 + set.reps / 30))
        );
        existingEntry.estimated1RM = Math.max(
          existingEntry.estimated1RM,
          currentMax1RM
        );

        const comparisonEntry = Object.values(comparisonExerciseProgressData)
          .flat()
          .find((compEntry) => compEntry.entry_date === entry.entry_date);

        if (comparisonEntry) {
          const compMax1RM = Math.max(
            ...comparisonEntry.sets.map(
              (set) => set.weight * (1 + set.reps / 30)
            )
          );
          existingEntry.comparisonEstimated1RM = Math.max(
            existingEntry.comparisonEstimated1RM,
            compMax1RM
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
  exerciseData: ExerciseProgressData[]
) => {
  const repWeightMap = new Map<
    number,
    { totalWeight: number; count: number }
  >();

  exerciseData
    .flatMap((entry) =>
      entry.sets.map((set) => ({ reps: set.reps, weight: set.weight }))
    )
    .forEach((item) => {
      if (repWeightMap.has(item.reps)) {
        const existing = repWeightMap.get(item.reps)!;
        existing.totalWeight += item.weight;
        existing.count += 1;
      } else {
        repWeightMap.set(item.reps, { totalWeight: item.weight, count: 1 });
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
  exerciseData: ExerciseProgressData[],
  formatDateInUserTimezone: (date: Date, formatStr: string) => string,
  parseISO: (dateString: string) => Date
) => {
  return exerciseData.map((d) => ({
    ...d,
    date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
    timeUnderTension: d.sets.reduce((sum, set) => sum + (set.duration || 0), 0),
  }));
};

export const extractGarminActivityEntries = (
  exerciseProgressData: Record<string, ExerciseProgressData[]>,
  selectedExercise: string,
  parseISO: (dateString: string) => Date
) => {
  const allGarminActivityEntries: ExerciseProgressData[] = [];

  if (selectedExercise === 'All') {
    Object.values(exerciseProgressData).forEach((dataArray) => {
      dataArray.forEach((entry) => {
        if (entry.provider_name === 'garmin' && entry.exercise_entry_id) {
          allGarminActivityEntries.push(entry);
        }
      });
    });
  } else if (selectedExercise && exerciseProgressData[selectedExercise]) {
    exerciseProgressData[selectedExercise].forEach((entry) => {
      if (entry.provider_name === 'garmin' && entry.exercise_entry_id) {
        allGarminActivityEntries.push(entry);
      }
    });
  }

  return allGarminActivityEntries.sort(
    (a, b) =>
      parseISO(b.entry_date).getTime() - parseISO(a.entry_date).getTime()
  );
};
